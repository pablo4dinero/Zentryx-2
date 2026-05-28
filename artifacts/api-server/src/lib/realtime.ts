import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { verifyToken } from "./auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ── Realtime signaling hub for 1:1 WebRTC calls ──────────────────────────
// This server does NOT carry any audio/video. WebRTC media flows directly
// browser-to-browser (encrypted DTLS-SRTP). All we do here is relay the
// tiny signaling messages (call ring + SDP offer/answer + ICE candidates)
// between the two authenticated users, plus track who's connected so we can
// answer "is the callee even online?".

interface LiveSocket extends WebSocket {
  userId: number;
  userName: string;
  isAlive: boolean;
}

// userId → set of live sockets (a user may have several tabs/devices open).
const userSockets = new Map<number, Set<LiveSocket>>();

function addSocket(sock: LiveSocket) {
  let set = userSockets.get(sock.userId);
  if (!set) { set = new Set(); userSockets.set(sock.userId, set); }
  set.add(sock);
}

function removeSocket(sock: LiveSocket) {
  const set = userSockets.get(sock.userId);
  if (!set) return;
  set.delete(sock);
  if (set.size === 0) userSockets.delete(sock.userId);
}

function isUserOnline(userId: number): boolean {
  const set = userSockets.get(userId);
  return !!set && set.size > 0;
}

/** Send a JSON payload to every live socket of a user. Returns true if at
 *  least one socket received it. */
function sendToUser(userId: number, payload: unknown): boolean {
  const set = userSockets.get(userId);
  if (!set || set.size === 0) return false;
  const data = JSON.stringify(payload);
  let delivered = false;
  for (const s of set) {
    if (s.readyState === WebSocket.OPEN) { s.send(data); delivered = true; }
  }
  return delivered;
}

// Message types that are simply forwarded to `toUserId`, with the real
// sender identity stamped on by the server (never trusting the client).
const RELAY_TYPES = new Set([
  "call:invite",   // A rings B           { toUserId, callId, roomId, media }
  "call:accept",   // B accepts           { toUserId, callId }
  "call:reject",   // B declines          { toUserId, callId }
  "call:cancel",   // A cancels ringing   { toUserId, callId }
  "call:end",      // either hangs up     { toUserId, callId }
  "webrtc:offer",  // SDP offer           { toUserId, callId, sdp }
  "webrtc:answer", // SDP answer          { toUserId, callId, sdp }
  "webrtc:ice",    // ICE candidate       { toUserId, callId, candidate }
]);

export function attachRealtime(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (rawSock, req) => {
    const sock = rawSock as LiveSocket;
    try {
      // Browsers can't set headers on a WebSocket, so the JWT comes in as a
      // query param: wss://host/ws?token=<jwt>
      const url = new URL(req.url || "", "http://localhost");
      const token = url.searchParams.get("token") || "";
      const payload = verifyToken(token) as any;
      if (payload?.mfaPending) { sock.close(4001, "mfa-pending"); return; }
      // Honour the same session ceilings as HTTP requests (superadmin skips).
      if (!payload?.noExpiry) {
        const now = Math.floor(Date.now() / 1000);
        if ((payload.absoluteExpiry && now > payload.absoluteExpiry) ||
            (payload.idleUntil && now > payload.idleUntil)) {
          sock.close(4001, "session-expired");
          return;
        }
      }

      const [user] = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (!user) { sock.close(4001, "no-user"); return; }

      sock.userId = user.id;
      sock.userName = user.name;
      sock.isAlive = true;
      addSocket(sock);

      sock.on("pong", () => { sock.isAlive = true; });

      sock.on("message", (raw) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (!msg || typeof msg.type !== "string") return;

        if (RELAY_TYPES.has(msg.type)) {
          const toUserId = Number(msg.toUserId);
          if (!Number.isInteger(toUserId)) return;
          // Stamp the authenticated identity — clients can't spoof who a
          // message is from.
          const out = { ...msg, fromUserId: sock.userId, fromName: sock.userName };
          const delivered = sendToUser(toUserId, out);
          // If a ring can't be delivered, tell the caller immediately so the
          // UI can stop ringing and show "unavailable" instead of hanging.
          if (!delivered && msg.type === "call:invite") {
            sock.send(JSON.stringify({ type: "call:unavailable", callId: msg.callId, toUserId }));
          }
          return;
        }
      });

      sock.on("close", () => { removeSocket(sock); });
      sock.on("error", () => { removeSocket(sock); });

      sock.send(JSON.stringify({ type: "ready", userId: sock.userId }));
    } catch {
      try { sock.close(4001, "unauthorized"); } catch { /* noop */ }
    }
  });

  // Heartbeat — drop sockets that stopped responding so the registry (and
  // "is online?" answers) stay accurate.
  const interval = setInterval(() => {
    wss.clients.forEach((c) => {
      const s = c as LiveSocket;
      if (s.isAlive === false) { try { s.terminate(); } catch { /* noop */ } return; }
      s.isAlive = false;
      try { s.ping(); } catch { /* noop */ }
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  logger.info("Realtime WebSocket server attached at /ws");
}

export { isUserOnline };
