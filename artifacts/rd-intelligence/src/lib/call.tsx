import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/auth";
import { useGetCurrentUser } from "@/api-client";
import { useToast } from "@/hooks/use-toast";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, PhoneIncoming } from "lucide-react";
import { cn } from "@/lib/utils";

// ── 1:1 WebRTC calling ───────────────────────────────────────────────────
// Media (audio/video) flows peer-to-peer, encrypted, never touching our
// server. The server only relays the ring + SDP/ICE signaling over the
// /ws WebSocket. STUN-only for now (works on most networks); a TURN relay
// can be added later for strict-NAT environments.

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "active";

interface CallContextValue {
  status: CallStatus;
  peerName: string | null;
  media: "audio" | "video";
  withVideo: boolean;
  muted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (toUserId: number, toName: string, media: "audio" | "video") => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);
export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within CallProvider");
  return ctx;
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  const { data: me } = useGetCurrentUser();
  const { toast } = useToast();

  const [status, setStatus] = useState<CallStatus>("idle");
  const [peerName, setPeerName] = useState<string | null>(null);
  const [media, setMedia] = useState<"audio" | "video">("audio");
  const [withVideo, setWithVideo] = useState(false);
  const [muted, setMuted] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerIdRef = useRef<number | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingOfferRef = useRef<{ callId: string; from: number; fromName: string; media: "audio" | "video" } | null>(null);

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const teardown = useCallback(() => {
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    try { pcRef.current?.close(); } catch { /* noop */ }
    pcRef.current = null;
    stopLocalMedia();
    setRemoteStream(null);
    pendingCandidatesRef.current = [];
    callIdRef.current = null;
    peerIdRef.current = null;
    incomingOfferRef.current = null;
    setStatus("idle");
    setPeerName(null);
    setMuted(false);
    setWithVideo(false);
  }, [stopLocalMedia]);

  // Build a peer connection wired to send ICE + surface the remote stream.
  const makePeer = useCallback((peerId: number) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        send({ type: "webrtc:ice", toUserId: peerId, callId: callIdRef.current, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => { setRemoteStream(e.streams[0] ?? null); };
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") setStatus("active");
      else if (st === "failed" || st === "disconnected" || st === "closed") {
        if (callIdRef.current) toast({ title: "Call ended", description: "The connection dropped." });
        teardown();
      }
    };
    return pc;
  }, [send, teardown, toast]);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const pending = pendingCandidatesRef.current;
    pendingCandidatesRef.current = [];
    for (const c of pending) { try { await pc.addIceCandidate(c); } catch { /* noop */ } }
  }, []);

  // ── Caller ─────────────────────────────────────────────────────────────
  const startCall = useCallback(async (toUserId: number, toName: string, callMedia: "audio" | "video") => {
    if (status !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callMedia === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      peerIdRef.current = toUserId;
      const pc = makePeer(toUserId);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      setMedia(callMedia);
      setWithVideo(callMedia === "video");
      setPeerName(toName);
      setStatus("outgoing");
      send({ type: "call:invite", toUserId, callId, media: callMedia });
      // Give up ringing after 35s if still unanswered (not yet connected).
      ringTimeoutRef.current = setTimeout(() => {
        if (callIdRef.current === callId && pcRef.current?.connectionState !== "connected") {
          send({ type: "call:cancel", toUserId, callId });
          toast({ title: "No answer", description: `${toName} didn't pick up.` });
          teardown();
        }
      }, 35000);
    } catch {
      toast({ title: "Couldn't start call", description: "Microphone/camera permission is required." });
      teardown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, makePeer, send, teardown, toast]);

  // ── Callee ─────────────────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    const incoming = incomingOfferRef.current;
    if (!incoming) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: incoming.media === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const pc = makePeer(incoming.from);
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      setWithVideo(incoming.media === "video");
      setStatus("connecting");
      send({ type: "call:accept", toUserId: incoming.from, callId: incoming.callId });
    } catch {
      toast({ title: "Couldn't join call", description: "Microphone/camera permission is required." });
      send({ type: "call:reject", toUserId: incoming.from, callId: incoming.callId });
      teardown();
    }
  }, [makePeer, send, teardown, toast]);

  const rejectCall = useCallback(() => {
    const incoming = incomingOfferRef.current;
    if (incoming) send({ type: "call:reject", toUserId: incoming.from, callId: incoming.callId });
    teardown();
  }, [send, teardown]);

  const endCall = useCallback(() => {
    if (peerIdRef.current && callIdRef.current) {
      send({ type: "call:end", toUserId: peerIdRef.current, callId: callIdRef.current });
    }
    teardown();
  }, [send, teardown]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return; // audio-only call, nothing to toggle
    const next = !withVideo;
    videoTracks.forEach(t => { t.enabled = next; });
    setWithVideo(next);
  }, [withVideo]);

  // ── Signaling message handler ────────────────────────────────────────────
  const handleSignal = useCallback(async (msg: any) => {
    switch (msg.type) {
      case "call:invite": {
        // Busy — auto-decline a second incoming call.
        if (status !== "idle") {
          send({ type: "call:reject", toUserId: msg.fromUserId, callId: msg.callId });
          return;
        }
        incomingOfferRef.current = { callId: msg.callId, from: msg.fromUserId, fromName: msg.fromName, media: msg.media === "video" ? "video" : "audio" };
        callIdRef.current = msg.callId;
        peerIdRef.current = msg.fromUserId;
        setMedia(msg.media === "video" ? "video" : "audio");
        setPeerName(msg.fromName);
        setStatus("incoming");
        break;
      }
      case "call:accept": {
        // Caller side: callee picked up → create and send the offer.
        const pc = pcRef.current;
        if (!pc || msg.callId !== callIdRef.current) return;
        if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
        setStatus("connecting");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "webrtc:offer", toUserId: msg.fromUserId, callId: msg.callId, sdp: offer });
        break;
      }
      case "webrtc:offer": {
        // Callee side: got the offer → answer it.
        const pc = pcRef.current;
        if (!pc || msg.callId !== callIdRef.current) return;
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await flushCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "webrtc:answer", toUserId: msg.fromUserId, callId: msg.callId, sdp: answer });
        break;
      }
      case "webrtc:answer": {
        const pc = pcRef.current;
        if (!pc || msg.callId !== callIdRef.current) return;
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await flushCandidates();
        break;
      }
      case "webrtc:ice": {
        const pc = pcRef.current;
        if (!pc || msg.callId !== callIdRef.current || !msg.candidate) return;
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try { await pc.addIceCandidate(msg.candidate); } catch { /* noop */ }
        } else {
          pendingCandidatesRef.current.push(msg.candidate);
        }
        break;
      }
      case "call:reject": {
        if (msg.callId !== callIdRef.current) return;
        toast({ title: "Call declined", description: `${peerName ?? "They"} declined the call.` });
        teardown();
        break;
      }
      case "call:cancel": {
        if (msg.callId !== callIdRef.current) return;
        teardown();
        break;
      }
      case "call:end": {
        if (msg.callId !== callIdRef.current) return;
        toast({ title: "Call ended" });
        teardown();
        break;
      }
      case "call:unavailable": {
        if (msg.callId !== callIdRef.current) return;
        toast({ title: "Unavailable", description: `${peerName ?? "They"} are offline right now.` });
        teardown();
        break;
      }
    }
  }, [status, peerName, send, teardown, flushCandidates, toast]);

  // Keep a ref to the latest handler so the WS onmessage closure stays fresh
  // without reconnecting the socket on every state change.
  const handlerRef = useRef(handleSignal);
  useEffect(() => { handlerRef.current = handleSignal; }, [handleSignal]);

  // ── WebSocket lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !me) return;
    let closedByUs = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg?.type) handlerRef.current(msg);
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (!closedByUs) reconnectTimer = setTimeout(connect, 2000);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    };
    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { wsRef.current?.close(); } catch { /* noop */ }
      wsRef.current = null;
    };
  }, [token, me]);

  const value: CallContextValue = {
    status, peerName, media, withVideo, muted, localStream, remoteStream,
    startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}

// ── Overlay UI: incoming-call ring + in-call window ──────────────────────
function CallOverlay() {
  const { status, peerName, media, withVideo, muted, localStream, remoteStream, acceptCall, rejectCall, endCall, toggleMute, toggleVideo } = useCall();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, status]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, status]);

  if (status === "idle") return null;

  const initials = (peerName || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  // Incoming ring
  if (status === "incoming") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="w-full max-w-sm rounded-3xl bg-[#1a1a2e] border border-white/10 shadow-2xl p-8 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-2xl font-bold mb-4 animate-pulse">
            {initials}
          </div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-1.5 mb-1">
            <PhoneIncoming className="w-3.5 h-3.5" /> Incoming {media === "video" ? "video" : "voice"} call
          </p>
          <p className="text-xl font-semibold text-foreground mb-8">{peerName}</p>
          <div className="flex items-center justify-center gap-6">
            <button onClick={rejectCall} className="flex flex-col items-center gap-1.5">
              <span className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg transition-colors">
                <PhoneOff className="w-6 h-6" />
              </span>
              <span className="text-xs text-muted-foreground">Decline</span>
            </button>
            <button onClick={acceptCall} className="flex flex-col items-center gap-1.5">
              <span className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white shadow-lg transition-colors">
                <Phone className="w-6 h-6" />
              </span>
              <span className="text-xs text-muted-foreground">Accept</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Outgoing / connecting / active
  const showRemoteVideo = status === "active" && media === "video";
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl h-[70vh] max-h-[640px] rounded-3xl bg-[#0f0f1a] border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Remote video / avatar */}
        <div className="relative flex-1 flex items-center justify-center bg-black">
          <video ref={remoteVideoRef} autoPlay playsInline className={cn("w-full h-full object-cover", showRemoteVideo ? "block" : "hidden")} />
          {!showRemoteVideo && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white text-4xl font-bold">
                {initials}
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-white">{peerName}</p>
                <p className="text-sm text-white/60 mt-1">
                  {status === "outgoing" ? "Ringing…" : status === "connecting" ? "Connecting…" : media === "video" ? "Camera off" : "On call"}
                </p>
              </div>
            </div>
          )}
          {/* Local PiP */}
          {media === "video" && localStream && (
            <video ref={localVideoRef} autoPlay playsInline muted
              className={cn("absolute bottom-4 right-4 w-28 h-40 object-cover rounded-xl border border-white/20 shadow-lg bg-black", withVideo ? "block" : "hidden")} />
          )}
        </div>

        {/* Controls */}
        <div className="shrink-0 py-5 flex items-center justify-center gap-4 bg-[#15151f]">
          <button onClick={toggleMute} title={muted ? "Unmute" : "Mute"}
            className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors", muted ? "bg-white/90 text-gray-900" : "bg-white/10 text-white hover:bg-white/20")}>
            {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          {media === "video" && (
            <button onClick={toggleVideo} title={withVideo ? "Turn camera off" : "Turn camera on"}
              className={cn("w-12 h-12 rounded-full flex items-center justify-center transition-colors", !withVideo ? "bg-white/90 text-gray-900" : "bg-white/10 text-white hover:bg-white/20")}>
              {withVideo ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}
          <button onClick={endCall} title="Hang up"
            className="w-14 h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors">
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
