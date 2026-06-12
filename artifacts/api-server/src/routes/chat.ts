import { Router } from "express";
import { db } from "@workspace/db";
import { chatRoomsTable, chatRoomMembersTable, chatMessagesTable, chatReadReceiptsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, inArray, desc, sql, ne, lt, gt } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth";
import { getOnlineUserIds } from "../lib/realtime";
import { SUPERADMIN_EMAIL } from "./auth";
import { uploadToR2, getSignedFileUrl } from "../lib/r2";
import { sanitize } from "../lib/sanitize";
import multer from "multer";
import { randomUUID } from "crypto";

const router = Router();

// Memory storage — files live in a Node Buffer just long enough to be
// streamed up to R2. Nothing touches the local disk anymore, so the
// container can be wiped on deploy without data loss and no path-
// traversal surface remains.
const ALLOWED_MIME_TYPES = new Set<string>([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  // 2 MB — chat attachments are messages, not document storage. Anything
  // larger belongs in a proper file-sharing flow.
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`MIME type not allowed: ${file.mimetype}`));
  },
});

const MSG_SELECT = {
  id: chatMessagesTable.id,
  roomId: chatMessagesTable.roomId,
  messageType: chatMessagesTable.messageType,
  content: chatMessagesTable.content,
  fileUrl: chatMessagesTable.fileUrl,
  fileName: chatMessagesTable.fileName,
  createdAt: chatMessagesTable.createdAt,
  senderId: chatMessagesTable.senderId,
  senderName: usersTable.name,
  senderRole: usersTable.role,
};

// Helper: when a message is posted, drop a single "new message" notification
// row in front of every other member of the room. The notification deliberately
// doesn't include the message content — only the sender name and a hint to
// open the chat. The frontend notification panel surfaces these alongside any
// other system events.
async function notifyRoomMembers(opts: { roomId: number; senderId: number; senderName: string | null; isGroup: boolean; roomName: string }) {
  try {
    const members = await db.select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable)
      .where(eq(chatRoomMembersTable.roomId, opts.roomId));
    const others = members.map(m => m.userId).filter(id => id !== opts.senderId);
    if (others.length === 0) return;
    const from = opts.senderName ?? "a teammate";
    const title = opts.isGroup ? `New message in #${opts.roomName}` : `New message from ${from}`;
    const message = opts.isGroup
      ? `${from} sent a message in #${opts.roomName}. Open the chat to read it.`
      : `${from} sent you a new message. Open the chat to read it.`;
    await db.insert(notificationsTable).values(others.map(userId => ({
      userId,
      type: "update" as const,
      title,
      message,
      isRead: false,
      link: "/chat",
    })));
  } catch (err) {
    console.error("[chat] notifyRoomMembers failed", err);
  }
}

// Helper: update read receipt for user in room
async function markRead(userId: number, roomId: number, messageId: number) {
  const existing = await db.select().from(chatReadReceiptsTable)
    .where(and(eq(chatReadReceiptsTable.userId, userId), eq(chatReadReceiptsTable.roomId, roomId)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(chatReadReceiptsTable)
      .set({ lastReadMessageId: messageId, updatedAt: new Date() })
      .where(and(eq(chatReadReceiptsTable.userId, userId), eq(chatReadReceiptsTable.roomId, roomId)));
  } else {
    await db.insert(chatReadReceiptsTable).values({ userId, roomId, lastReadMessageId: messageId }).catch(() => {});
  }
}

// Live presence — ids of users with at least one open WebSocket (any device).
// The chat client polls this to show Online/Offline next to each person.
router.get("/presence", requireAuth, (_req: AuthRequest, res) => {
  res.json({ online: getOnlineUserIds() });
});

// Get all rooms for current user with last message preview + unread count
router.get("/rooms", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const memberships = await db.select({ roomId: chatRoomMembersTable.roomId })
      .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, userId));
    if (memberships.length === 0) { res.json([]); return; }
    const roomIds = memberships.map(m => m.roomId);
    const rooms = await db.select().from(chatRoomsTable).where(inArray(chatRoomsTable.id, roomIds));

    // For each room, get last message info + member ids so the client can
    // match DM rooms back to specific users without falling back to the
    // ambiguous "match by first name" heuristic (which silently merged any
    // two users that shared a first name into the same chat thread).
    const enriched = await Promise.all(rooms.map(async (room) => {
      const [lastMsg] = await db.select(MSG_SELECT)
        .from(chatMessagesTable)
        .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
        .where(eq(chatMessagesTable.roomId, room.id))
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(1);

      const [receipt] = await db.select().from(chatReadReceiptsTable)
        .where(and(eq(chatReadReceiptsTable.userId, userId), eq(chatReadReceiptsTable.roomId, room.id)))
        .limit(1);

      const memberRows = await db.select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, room.id));

      const lastReadId = receipt?.lastReadMessageId ?? 0;
      const lastMsgId = lastMsg?.id ?? 0;
      const hasUnread = lastMsg && lastMsg.senderId !== userId && lastMsgId > lastReadId;

      // Exact count of unread messages from other people in this room, used
      // for the per-room and total unread badges on the client. Only queried
      // when there's something unread so we don't pay for a count on every
      // already-read room.
      let unreadCount = 0;
      if (hasUnread) {
        const [cnt] = await db.select({ c: sql<number>`count(*)` })
          .from(chatMessagesTable)
          .where(and(
            eq(chatMessagesTable.roomId, room.id),
            gt(chatMessagesTable.id, lastReadId),
            ne(chatMessagesTable.senderId, userId),
          ));
        unreadCount = Number(cnt?.c ?? 0);
      }

      return {
        ...room,
        lastMessageAt: lastMsg?.createdAt ?? room.createdAt,
        lastMessagePreview: lastMsg?.content ?? null,
        lastMessageSender: lastMsg?.senderName ?? null,
        lastMessageType: lastMsg?.messageType ?? null,
        hasUnread: !!hasUnread,
        unreadCount,
        memberUserIds: memberRows.map(m => m.userId),
      };
    }));

    // Sort by most recent message
    enriched.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
    res.json(enriched);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Create a room (or return existing DM between two users)
router.post("/rooms", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, isGroup, memberIds } = req.body;
    const userId = req.user!.userId;

    // Resolve superadmin DB id so we can strip them from any member list
    const [sa] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
    const saId = sa?.id;

    const rawIds = [...new Set([userId, ...(memberIds || [])])];
    // Privacy rule: regular users can't pull the superadmin into a room. But
    // the superadmin must still be able to start their own DMs and groups —
    // otherwise the creator gets filtered out, no chatRoomMembers row is
    // inserted for them, and every click creates an orphan room their /rooms
    // list never returns. That's the "history clears" bug.
    const allMemberIds = saId && userId !== saId
      ? rawIds.filter(id => id !== saId)
      : rawIds;

    if (isGroup === false && allMemberIds.length === 2) {
      const otherId = allMemberIds.find(id => id !== userId)!;
      const myRooms = await db.select({ roomId: chatRoomMembersTable.roomId })
        .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, userId));
      const otherRooms = await db.select({ roomId: chatRoomMembersTable.roomId })
        .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, otherId));
      const myRoomIds = myRooms.map(r => r.roomId);
      const otherRoomIds = new Set(otherRooms.map(r => r.roomId));
      const sharedIds = myRoomIds.filter(id => otherRoomIds.has(id));
      if (sharedIds.length > 0) {
        const existing = await db.select().from(chatRoomsTable)
          .where(and(inArray(chatRoomsTable.id, sharedIds), eq(chatRoomsTable.isGroup, false)))
          .limit(1);
        if (existing.length > 0) { res.status(201).json(existing[0]); return; }
      }
    }

    const [room] = await db.insert(chatRoomsTable).values({
      name: sanitize(name), isGroup: isGroup !== false, createdById: userId,
    }).returning();
    for (const uid of allMemberIds) {
      await db.insert(chatRoomMembersTable).values({ roomId: room.id, userId: uid }).catch(() => {});
    }
    res.status(201).json(room);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Edit a group channel — rename and/or swap members. Creator only.
// Body: { name?: string, memberIds?: number[] }
// memberIds, if provided, REPLACES the room's member list (creator is
// always preserved; superadmin is stripped unless the requester is the
// superadmin, matching POST /rooms behaviour).
router.patch("/rooms/:roomId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const { name, memberIds } = req.body as { name?: string; memberIds?: number[] };

    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (!room) { res.status(404).json({ error: "NotFound" }); return; }
    if (room.createdById !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    if (!room.isGroup) { res.status(400).json({ error: "DMNotEditable" }); return; }

    if (typeof name === "string" && name.trim() !== "" && name !== room.name) {
      await db.update(chatRoomsTable).set({ name: sanitize(name) }).where(eq(chatRoomsTable.id, roomId));
    }

    if (Array.isArray(memberIds)) {
      const [sa] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
      const saId = sa?.id;
      const requested = new Set<number>([room.createdById, ...memberIds]);
      const desired = saId && userId !== saId
        ? new Set([...requested].filter(id => id !== saId))
        : requested;

      const existingRows = await db.select({ userId: chatRoomMembersTable.userId })
        .from(chatRoomMembersTable)
        .where(eq(chatRoomMembersTable.roomId, roomId));
      const existing = new Set(existingRows.map(r => r.userId));

      const toAdd = [...desired].filter(id => !existing.has(id));
      const toRemove = [...existing].filter(id => !desired.has(id) && id !== room.createdById);

      for (const uid of toAdd) {
        await db.insert(chatRoomMembersTable).values({ roomId, userId: uid }).catch(() => {});
      }
      if (toRemove.length > 0) {
        await db.delete(chatRoomMembersTable).where(and(
          eq(chatRoomMembersTable.roomId, roomId),
          inArray(chatRoomMembersTable.userId, toRemove),
        ));
      }
    }

    const [updated] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    const memberRows = await db.select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable)
      .where(eq(chatRoomMembersTable.roomId, roomId));
    res.json({ ...updated, memberUserIds: memberRows.map(m => m.userId) });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Delete a room (creator only) or leave it
router.delete("/rooms/:roomId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (!room) { res.status(404).json({ error: "NotFound" }); return; }
    if (room.createdById === userId) {
      await db.delete(chatRoomsTable).where(eq(chatRoomsTable.id, roomId));
      res.json({ deleted: true });
    } else {
      await db.delete(chatRoomMembersTable).where(
        and(eq(chatRoomMembersTable.roomId, roomId), eq(chatRoomMembersTable.userId, userId))
      );
      res.json({ left: true });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Get messages for a room + mark as read
router.get("/rooms/:roomId/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const limit = Math.min(parseInt(String(req.query.limit ?? 50)) || 50, 100);
    // Cursor-based pagination: ?before=<messageId> loads older messages
    const beforeId = req.query.before ? parseInt(String(req.query.before)) : null;

    const whereClause = beforeId
      ? and(eq(chatMessagesTable.roomId, roomId), lt(chatMessagesTable.id, beforeId))
      : eq(chatMessagesTable.roomId, roomId);

    // Fetch in DESC order to get the N most recent (or N before cursor),
    // then reverse so messages render oldest→newest in the UI.
    const rawMessages = await db.select(MSG_SELECT)
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(whereClause)
      .orderBy(desc(chatMessagesTable.id))
      .limit(limit);

    const messages = rawMessages.reverse();

    // Get read receipts for all members in this room (for seen indicators)
    const members = await db.select({ userId: chatRoomMembersTable.userId })
      .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.roomId, roomId));
    const memberIds = members.map(m => m.userId).filter(id => id !== userId);
    const receipts = memberIds.length > 0
      ? await db.select().from(chatReadReceiptsTable)
          .where(and(eq(chatReadReceiptsTable.roomId, roomId), inArray(chatReadReceiptsTable.userId, memberIds)))
      : [];

    // Auto mark-as-read: update receipt for current user to last message
    if (messages.length > 0) {
      const lastId = messages[messages.length - 1].id;
      await markRead(userId, roomId, lastId).catch(() => {});
    }

    // Attach seenByOthers flag to each message
    const seenMap = new Map(receipts.map(r => [r.userId, r.lastReadMessageId ?? 0]));
    const enriched = messages.map(m => ({
      ...m,
      seenBy: memberIds.filter(uid => (seenMap.get(uid) ?? 0) >= m.id),
    }));

    // hasMore: true means there are older messages the client hasn't loaded yet
    const hasMore = rawMessages.length === limit;
    res.json({ messages: enriched, hasMore, oldestId: messages[0]?.id ?? null });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Mark room as read (explicit)
router.post("/rooms/:roomId/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const userId = req.user!.userId;
    const { messageId } = req.body;
    await markRead(userId, roomId, messageId);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Send a text message
router.post("/rooms/:roomId/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const { content, messageType } = req.body;
    const [msg] = await db.insert(chatMessagesTable).values({
      roomId, senderId: req.user!.userId,
      messageType: messageType || "text",
      content: sanitize(content),
    }).returning();
    const [withSender] = await db.select(MSG_SELECT)
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.id, msg.id));
    // Auto-mark sender as read
    await markRead(req.user!.userId, roomId, msg.id).catch(() => {});
    // Drop a notification for every other room member (no message body)
    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (room) {
      await notifyRoomMembers({
        roomId,
        senderId: req.user!.userId,
        senderName: withSender?.senderName ?? null,
        isGroup: !!room.isGroup,
        roomName: room.name ?? "",
      });
    }
    res.status(201).json({ ...withSender, seenBy: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Delete a message (sender only)
router.delete("/rooms/:roomId/messages/:messageId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const messageId = parseInt(Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId as string);
    const userId = req.user!.userId;
    const [msg] = await db.select().from(chatMessagesTable).where(eq(chatMessagesTable.id, messageId)).limit(1);
    if (!msg) { res.status(404).json({ error: "NotFound" }); return; }
    if (msg.senderId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, messageId));
    res.json({ deleted: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Upload an attachment (images / voice notes / documents — max 2 MB).
// The file is streamed straight to Cloudflare R2; nothing is written to
// the local filesystem. We store ONLY the R2 object key in the DB; the
// download endpoint mints a fresh signed URL on demand.
router.post("/rooms/:roomId/upload", requireAuth, (req: AuthRequest, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "FileTooLarge", message: "File exceeds the 2 MB limit." });
      } else {
        res.status(400).json({ error: "UploadError", message: err.message });
      }
      return;
    }
    next();
  });
}, async (req: AuthRequest, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
    const roomId = parseInt(Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId as string);
    const messageType = (req.body.messageType as any) || (req.file.mimetype.startsWith("audio") ? "voice_note" : "image");

    // Build a collision-resistant R2 key. UUID + original extension so
    // it's safe to URL-encode and keeps the user-friendly file type.
    const ext = (req.file.originalname.split(".").pop() || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
    const key = `chat/${randomUUID()}${ext ? `.${ext}` : ""}`;

    // Push to R2 first — only persist the message row if the upload
    // succeeds, so we never end up with a DB record pointing at a
    // file that doesn't exist.
    await uploadToR2(key, req.file.buffer, req.file.mimetype);

    // We store the R2 key (not a URL) in fileUrl. The download endpoint
    // resolves it to a fresh signed URL each time.
    const [msg] = await db.insert(chatMessagesTable).values({
      roomId, senderId: req.user!.userId, messageType,
      fileUrl: key, fileName: req.file.originalname,
    }).returning();
    const [withSender] = await db.select(MSG_SELECT)
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.id, msg.id));
    await markRead(req.user!.userId, roomId, msg.id).catch(() => {});
    const [room] = await db.select().from(chatRoomsTable).where(eq(chatRoomsTable.id, roomId)).limit(1);
    if (room) {
      await notifyRoomMembers({
        roomId,
        senderId: req.user!.userId,
        senderName: withSender?.senderName ?? null,
        isGroup: !!room.isGroup,
        roomName: room.name ?? "",
      });
    }
    res.status(201).json({ ...withSender, seenBy: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Resolve a chat attachment URL. Auth required — only members of the
// room should be able to view its files. (We currently auth via the JWT
// but don't check room membership; that's a Phase 1 follow-up.)
// On hit, we mint a fresh signed R2 URL (1-hour expiry) and 302 the
// client to it. The legacy filename-only path is preserved so existing
// `/api/chat/uploads/<filename>` URLs in old messages keep working —
// we just prepend the `chat/` prefix to reconstruct the R2 key.
router.get("/uploads/:filename", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Express types req.params values as `string | string[]` to cover
    // repeated query-string-style params; for route params we know it's
    // a single string. Narrow defensively.
    const raw = req.params.filename;
    const filename = Array.isArray(raw) ? raw[0] : (raw as string);
    if (!filename || !/^[A-Za-z0-9._-]+$/.test(filename)) {
      res.status(400).json({ error: "BadRequest" });
      return;
    }
    const key = filename.startsWith("chat/") ? filename : `chat/${filename}`;
    const signedUrl = await getSignedFileUrl(key);
    res.redirect(signedUrl);
  } catch (err) {
    console.error("[chat] signed-url failed", err);
    res.status(404).json({ error: "NotFound" });
  }
});

// ── Reachable-but-unlisted superadmin contact ────────────────────────
// The superadmin is intentionally kept OUT of the people directory
// (GET /users excludes them). These two routes are the controlled way a
// regular user can still reach them WITHOUT exposing them in the list:
//   • admin-contact returns only the minimal identity needed to render a
//     single "Administrator" entry.
//   • admin-dm creates-or-returns the 1:1 room between the caller and the
//     superadmin, so messages deliver in both directions. Group creation
//     still can't pull the superadmin in (the strips in POST/PATCH /rooms
//     are untouched).
router.get("/admin-contact", requireAuth, async (_req: AuthRequest, res) => {
  try {
    const [sa] = await db.select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
      .from(usersTable).where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
    if (!sa) { res.json(null); return; }
    res.json({ id: sa.id, name: sa.name, avatar: sa.avatar });
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

router.post("/admin-dm", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const [sa] = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.email, SUPERADMIN_EMAIL)).limit(1);
    if (!sa) { res.status(404).json({ error: "NoSuperadmin" }); return; }
    const saId = sa.id;
    if (userId === saId) { res.status(400).json({ error: "BadRequest", message: "You are the administrator." }); return; }

    // Return the existing 1:1 room if one already exists (created by either
    // side), so we never spawn duplicate admin threads.
    const myRooms = await db.select({ roomId: chatRoomMembersTable.roomId })
      .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, userId));
    const saRooms = await db.select({ roomId: chatRoomMembersTable.roomId })
      .from(chatRoomMembersTable).where(eq(chatRoomMembersTable.userId, saId));
    const saRoomIds = new Set(saRooms.map(r => r.roomId));
    const sharedIds = myRooms.map(r => r.roomId).filter(id => saRoomIds.has(id));
    if (sharedIds.length > 0) {
      const [existing] = await db.select().from(chatRoomsTable)
        .where(and(inArray(chatRoomsTable.id, sharedIds), eq(chatRoomsTable.isGroup, false)))
        .limit(1);
      if (existing) { res.status(200).json(existing); return; }
    }

    const [room] = await db.insert(chatRoomsTable).values({
      name: sa.name, isGroup: false, createdById: userId,
    }).returning();
    await db.insert(chatRoomMembersTable).values({ roomId: room.id, userId }).catch(() => {});
    await db.insert(chatRoomMembersTable).values({ roomId: room.id, userId: saId }).catch(() => {});
    res.status(201).json(room);
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Get all users for private chat (superadmin always excluded). Includes the
// profile fields the chat View-Profile dialog needs (department, role,
// phone, avatar) so the client doesn't have to make a second round-trip.
router.get("/users", requireAuth, async (_req, res) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      department: usersTable.department,
      jobPosition: usersTable.jobPosition,
      phone: usersTable.phone,
      avatar: usersTable.avatar,
      isActive: usersTable.isActive,
      lastActiveAt: usersTable.lastActiveAt,
    })
      .from(usersTable)
      .where(ne(usersTable.email, SUPERADMIN_EMAIL));
    res.json(users);
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

// Update user's last active timestamp for online status tracking
router.post("/users/update-activity", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    await db.update(usersTable).set({ lastActiveAt: new Date() }).where(eq(usersTable.id, userId));
    res.json({ success: true });
  } catch { res.status(500).json({ error: "InternalServerError" }); }
});

// Bulk delete messages — only deletes messages sent by the current user
router.delete("/rooms/:roomId/messages", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const roomId = Number(req.params.roomId);
    const { messageIds } = req.body as { messageIds: number[] };
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ error: "BadRequest", message: "messageIds must be a non-empty array" });
      return;
    }
    // Verify user is a member of this room
    const membership = await db.select().from(chatRoomMembersTable)
      .where(and(eq(chatRoomMembersTable.roomId, roomId), eq(chatRoomMembersTable.userId, userId)))
      .limit(1);
    if (!membership.length) { res.status(403).json({ error: "Forbidden" }); return; }
    // Delete only messages where senderId = current user
    await db.delete(chatMessagesTable).where(
      and(inArray(chatMessagesTable.id, messageIds), eq(chatMessagesTable.senderId, userId))
    );
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

// Forward a message to another room — copies content/file to target room as a new message
router.post("/rooms/:roomId/messages/:messageId/forward", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const sourceRoomId = Number(req.params.roomId);
    const messageId = Number(req.params.messageId);
    const { toRoomId } = req.body as { toRoomId: number };
    if (!toRoomId) { res.status(400).json({ error: "BadRequest", message: "toRoomId required" }); return; }
    // Verify user is member of source room
    const sourceMembership = await db.select().from(chatRoomMembersTable)
      .where(and(eq(chatRoomMembersTable.roomId, sourceRoomId), eq(chatRoomMembersTable.userId, userId)))
      .limit(1);
    if (!sourceMembership.length) { res.status(403).json({ error: "Forbidden" }); return; }
    // Verify user is member of target room
    const targetMembership = await db.select().from(chatRoomMembersTable)
      .where(and(eq(chatRoomMembersTable.roomId, toRoomId), eq(chatRoomMembersTable.userId, userId)))
      .limit(1);
    if (!targetMembership.length) { res.status(403).json({ error: "Forbidden" }); return; }
    // Fetch source message
    const [sourceMsg] = await db.select().from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.id, messageId), eq(chatMessagesTable.roomId, sourceRoomId)))
      .limit(1);
    if (!sourceMsg) { res.status(404).json({ error: "NotFound" }); return; }
    // Create new message in target room with [Forwarded] prefix for text
    const fwdContent = sourceMsg.messageType === "text"
      ? `[Forwarded] ${sourceMsg.content}`
      : sourceMsg.content;
    const [newMsg] = await db.insert(chatMessagesTable).values({
      roomId: toRoomId,
      senderId: userId,
      messageType: sourceMsg.messageType,
      content: fwdContent,
      fileUrl: sourceMsg.fileUrl,
      fileName: sourceMsg.fileName,
    }).returning();
    // Fetch target room for notification
    const [targetRoom] = await db.select().from(chatRoomsTable)
      .where(eq(chatRoomsTable.id, toRoomId)).limit(1);
    // Notify room members
    const [user] = await db.select({ name: usersTable.name }).from(usersTable)
      .where(eq(usersTable.id, userId)).limit(1);
    await notifyRoomMembers({
      roomId: toRoomId,
      senderId: userId,
      senderName: user?.name,
      isGroup: targetRoom?.isGroup ?? true,
      roomName: targetRoom?.name ?? "chat",
    });
    // Return the new message with seenBy (empty)
    const [result] = await db.select(MSG_SELECT).from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.senderId, usersTable.id))
      .where(eq(chatMessagesTable.id, newMsg.id));
    res.status(201).json({ ...result, seenBy: [] });
  } catch (err) { console.error(err); res.status(500).json({ error: "InternalServerError" }); }
});

export default router;
