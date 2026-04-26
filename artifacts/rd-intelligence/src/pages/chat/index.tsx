import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Plus, ImageIcon, Mic, MicOff, Users, Lock, Video, Hash,
  MoreVertical, StopCircle, Trash2, Pin, PinOff, LogOut, X,
  MessageSquare, AtSign, ChevronRight, FileText, Download, ZoomIn, Paperclip, ArrowDown,
  Check, CheckCheck, Clock, Search
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";

const BASE = import.meta.env.BASE_URL;

function useApi() {
  const token = () => localStorage.getItem("rd_token");
  const authHeader = () => ({ Authorization: `Bearer ${token()}` });

  // Always bypass the browser cache so 304s never cause empty-body parse failures
  const get = (path: string) =>
    fetch(`${BASE}api${path}`, {
      headers: { ...authHeader(), "Cache-Control": "no-cache" },
      cache: "no-store",
    }).then(r => {
      if (!r.ok) return null;           // auth errors / 5xx — caller guards with Array.isArray
      return r.json().catch(() => null); // empty body safety net
    });

  const post = (path: string, body: any) =>
    fetch(`${BASE}api${path}`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const postForm = (path: string, data: FormData) =>
    fetch(`${BASE}api${path}`, { method: "POST", headers: authHeader(), body: data }).then(r => r.json());

  const del = (path: string) =>
    fetch(`${BASE}api${path}`, { method: "DELETE", headers: authHeader() }).then(r => r.json());

  return { get, post, postForm, del, token };
}

function usePinnedRooms() {
  const key = "rd_pinned_rooms";
  const [pins, setPins] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });
  const toggle = useCallback((id: number) => {
    setPins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, []);
  const isPinned = (id: number) => pins.includes(id);
  return { isPinned, toggle };
}

function usePinnedMessages(roomId: number) {
  const key = `rd_pinned_msgs_${roomId}`;
  const [pins, setPins] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { setPins(JSON.parse(localStorage.getItem(key) || "[]")); } catch { setPins([]); }
  }, [roomId]);
  const toggle = useCallback((id: number) => {
    setPins(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(`rd_pinned_msgs_${roomId}`, JSON.stringify(next));
      return next;
    });
  }, [roomId]);
  const isPinned = (id: number) => pins.includes(id);
  return { isPinned, toggle };
}

function RoomContextMenu({ room, isPinned, onPin, onDelete, onLeave, isCreator }: {
  room: any; isPinned: boolean; onPin: () => void;
  onDelete: () => void; onLeave: () => void; isCreator: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground opacity-0 group-hover/room:opacity-100 transition-all"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className="absolute left-full top-0 ml-1 w-44 glass-panel border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <button onClick={() => { onPin(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
              {isPinned ? <PinOff className="w-4 h-4 text-amber-400" /> : <Pin className="w-4 h-4 text-amber-400" />}
              {isPinned ? "Unpin" : "Pin to Top"}
            </button>
            <div className="border-t border-white/5" />
            {isCreator ? (
              <button onClick={() => { onDelete(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete Channel
              </button>
            ) : (
              <button onClick={() => { onLeave(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors">
                <LogOut className="w-4 h-4" /> Leave Channel
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageContextMenu({ msg, isOwn, isPinned, onDelete, onPin }: {
  msg: any; isOwn: boolean; isPinned: boolean; onDelete: () => void; onPin: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground opacity-0 group-hover/msg:opacity-100 transition-all">
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.12 }}
            className={`absolute ${isOwn ? "right-0" : "left-0"} bottom-full mb-1 w-44 glass-panel border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden`}
          >
            <button onClick={() => { onPin(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
              {isPinned ? <PinOff className="w-4 h-4 text-amber-400" /> : <Pin className="w-4 h-4 text-amber-400" />}
              {isPinned ? "Unpin Message" : "Pin Message"}
            </button>
            {isOwn && (
              <>
                <div className="border-t border-white/5" />
                <button onClick={() => { onDelete(); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-4 h-4" /> Delete Message
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ChatRoom() {
  const api = useApi();
  const { toast } = useToast();
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [showPinnedMsgs, setShowPinnedMsgs] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [roomMeta, setRoomMeta] = useState<Record<number, { lastMessageAt: string; lastMessagePreview: string | null; lastMessageType: string | null; hasUnread: boolean }>>({});
  const [peopleSort, setPeopleSort] = useState<"recent" | "role" | "alpha">("recent");
  const [peopleSortOpen, setPeopleSortOpen] = useState(false);

  // Cache messages per room so switching rooms restores instantly and bad fetches don't wipe history
  const msgCacheRef = useRef<Record<number, any[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLInputElement>(null);
  const justSwitchedRoomRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  };

  const { isPinned: isRoomPinned, toggle: toggleRoomPin } = usePinnedRooms();
  const { isPinned: isMsgPinned, toggle: toggleMsgPin } = usePinnedMessages(activeRoom?.id || 0);

  const currentUserId = (() => {
    try { return JSON.parse(atob(localStorage.getItem("rd_token")?.split(".")[1] || "")).userId; } catch { return null; }
  })();

  const refreshRooms = useCallback(() => {
    api.get("/chat/rooms").then((r: any[]) => {
      const list = Array.isArray(r) ? r : [];
      setRooms(list);
      const meta: typeof roomMeta = {};
      list.forEach((room: any) => {
        meta[room.id] = {
          lastMessageAt: room.lastMessageAt,
          lastMessagePreview: room.lastMessagePreview,
          lastMessageType: room.lastMessageType,
          hasUnread: room.hasUnread,
        };
      });
      setRoomMeta(meta);
    });
  }, []);

  useEffect(() => {
    localStorage.removeItem("rd_chat_unread");
    Promise.all([api.get("/chat/rooms"), api.get("/chat/users")]).then(([r, u]) => {
      const list = Array.isArray(r) ? r : [];
      setRooms(list);
      setUsers(Array.isArray(u) ? u : []);
      const meta: typeof roomMeta = {};
      list.forEach((room: any) => {
        meta[room.id] = {
          lastMessageAt: room.lastMessageAt,
          lastMessagePreview: room.lastMessagePreview,
          lastMessageType: room.lastMessageType,
          hasUnread: room.hasUnread,
        };
      });
      setRoomMeta(meta);
      const channels = list.filter((room: any) => room.isGroup);
      if (channels.length > 0) selectRoom(channels[0]);
      else if (list.length > 0) selectRoom(list[0]);
      else setLoading(false);
    });
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const loadMessages = useCallback((roomId: number) => {
    api.get(`/chat/rooms/${roomId}/messages?limit=100`).then((msgs: any) => {
      // Guard: only accept a genuine array — null / error responses are ignored
      if (!Array.isArray(msgs)) return;
      const msgList: any[] = msgs;
      // Update the per-room cache so switching back restores history instantly
      msgCacheRef.current[roomId] = msgList;
      setMessages(prev => {
        const optimistic = prev.filter((m: any) => m._sending);
        const merged = [...msgList, ...optimistic.filter((o: any) => !msgList.find((m: any) => m.content === o.content))];
        return merged;
      });
      // On first load after switching rooms, scroll to bottom
      if (justSwitchedRoomRef.current) {
        justSwitchedRoomRef.current = false;
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        });
      }
      refreshRooms();
    }).catch(() => {
      // Network / parse error — silently keep whatever messages are already displayed
    });
  }, [currentUserId, refreshRooms]);

  const selectRoom = (room: any) => {
    justSwitchedRoomRef.current = true;
    setActiveRoom(room);
    // Restore cached messages instantly to avoid a blank flash; fresh data arrives via loadMessages
    setMessages(msgCacheRef.current[room.id] ?? []);
    setShowPinnedMsgs(false);
    if (pollRef.current) clearInterval(pollRef.current);
    loadMessages(room.id);
    pollRef.current = setInterval(() => loadMessages(room.id), 1500);
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeRoom) return;
    const content = newMsg;
    const tempId = `temp_${Date.now()}`;
    const optimistic = { _tempId: tempId, _sending: true, id: tempId, roomId: activeRoom.id, content, messageType: "text", senderId: currentUserId, senderName: "You", createdAt: new Date().toISOString(), seenBy: [] };
    setMessages(prev => [...prev, optimistic]);
    setNewMsg("");
    setSending(true);
    try {
      const msg = await api.post(`/chat/rooms/${activeRoom.id}/messages`, { content, messageType: "text" });
      setMessages(prev => prev.map((m: any) => m._tempId === tempId ? { ...msg, seenBy: msg.seenBy || [] } : m));
      refreshRooms();
    } catch {
      setMessages(prev => prev.filter((m: any) => m._tempId !== tempId));
      setNewMsg(content);
      toast({ title: "Failed to send message", variant: "destructive" });
    } finally { setSending(false); }
  };

  const deleteMessage = async (msgId: number) => {
    await api.del(`/chat/rooms/${activeRoom.id}/messages/${msgId}`);
    setMessages(prev => prev.filter((m: any) => m.id !== msgId));
    toast({ title: "Message deleted" });
  };

  const deleteRoom = async (room: any) => {
    if (!confirm(`Are you sure you want to ${room.createdById === currentUserId ? "delete" : "leave"} "${room.name}"?`)) return;
    await api.del(`/chat/rooms/${room.id}`);
    setRooms(prev => prev.filter((r: any) => r.id !== room.id));
    if (activeRoom?.id === room.id) {
      setActiveRoom(null);
      setMessages([]);
      if (pollRef.current) clearInterval(pollRef.current);
    }
    toast({ title: room.createdById === currentUserId ? "Channel deleted" : "Left channel" });
  };

  const uploadFile = async (file: File, messageType: string) => {
    if (!activeRoom) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("messageType", messageType);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/chat/rooms/${activeRoom.id}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
        body: formData,
      });
      if (res.status === 413) {
        toast({ title: "File too large", description: "Please choose a file under 5 MB.", variant: "destructive" });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Upload failed", description: err.message || "Something went wrong.", variant: "destructive" });
        return;
      }
      const msg = await res.json();
      setMessages(prev => [...prev.filter((m: any) => m.id !== msg.id), msg]);
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose a file under 5 MB.", variant: "destructive" });
      e.target.value = "";
      return;
    }
    let type: string;
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("audio/")) type = "voice_note";
    else type = "document";
    uploadFile(file, type);
    e.target.value = "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        await uploadFile(file, "voice_note");
        setIsRecording(false);
      };
      mr.start();
      setMediaRecorder(mr);
      setIsRecording(true);
    } catch { toast({ title: "Microphone access denied", variant: "destructive" }); }
  };

  const stopRecording = () => { mediaRecorder?.stop(); };

  const startVideoMeeting = () => {
    const roomName = `zentryx-${activeRoom?.name?.replace(/\s+/g, '-').toLowerCase() || 'meeting'}-${Date.now()}`;
    window.open(`https://meet.jit.si/${roomName}`, "_blank");
    toast({ title: "Video meeting started", description: "Jitsi Meet opened in a new tab." });
  };

  const createGroupRoom = async (name: string, memberIds: number[]) => {
    const room = await api.post("/chat/rooms", { name, isGroup: true, memberIds });
    setRooms(prev => [...prev, room]);
    selectRoom(room);
  };

  const createPrivateRoom = async (userId: number, userName: string) => {
    const room = await api.post("/chat/rooms", { name: userName, isGroup: false, memberIds: [userId] });
    setRooms(prev => { const exists = prev.find((r: any) => r.id === room.id); return exists ? prev : [...prev, room]; });
    selectRoom(room);
  };

  const insertMention = (user: any) => {
    const before = newMsg.slice(0, mentionStart);
    const after = newMsg.slice(mentionStart + 1 + (mentionQuery?.length || 0));
    setNewMsg(before + `@${user.name} ` + after);
    setMentionQuery(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleMsgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewMsg(val);
    const cursor = e.target.selectionStart || 0;
    const textBefore = val.slice(0, cursor);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx !== -1) {
      const query = textBefore.slice(atIdx + 1);
      if (!query.includes(" ") && !query.includes("\n")) { setMentionQuery(query); setMentionStart(atIdx); return; }
    }
    setMentionQuery(null);
  };

  const filteredMentionUsers = mentionQuery !== null
    ? users.filter(u => u.id !== currentUserId && u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  const getClearKey = (roomId: number) => `rd_cleared_at_${roomId}_${currentUserId}`;

  const clearRoomHistory = () => {
    if (!activeRoom) return;
    localStorage.setItem(getClearKey(activeRoom.id), new Date().toISOString());
    setMessages([]);
    toast({ title: "Chat history cleared", description: "Only new messages will be shown." });
  };

  const visibleMessages = (() => {
    if (!activeRoom) return messages;
    const cleared = localStorage.getItem(getClearKey(activeRoom.id));
    if (!cleared) return messages;
    const clearedAt = new Date(cleared);
    return messages.filter((m: any) => new Date(m.createdAt) > clearedAt);
  })();

  const sortRooms = (list: any[]) => {
    const pinned = list.filter(r => isRoomPinned(r.id));
    const rest = list.filter(r => !isRoomPinned(r.id));
    return [...pinned, ...rest];
  };

  const channels = sortRooms(rooms.filter((r: any) => r.isGroup));
  const dmRooms = rooms.filter((r: any) => !r.isGroup);

  // Build people list: all users with DM room info, sorted by chosen mode
  const peopleList = users.filter((u: any) => u.id !== currentUserId).map((u: any) => {
    const dmRoom = dmRooms.find((r: any) => r.name === u.name || r.name === u.name.split(" ")[0]);
    const meta = dmRoom ? roomMeta[dmRoom.id] : null;
    return { ...u, dmRoom, lastMessageAt: meta?.lastMessageAt ?? null, lastPreview: meta?.lastMessagePreview ?? null, lastPreviewType: meta?.lastMessageType ?? null, hasUnread: meta?.hasUnread ?? false };
  }).sort((a, b) => {
    if (peopleSort === "alpha") return a.name.localeCompare(b.name);
    if (peopleSort === "role") return (a.role ?? "").localeCompare(b.role ?? "") || a.name.localeCompare(b.name);
    // "recent" — most recent DM first, then alphabetical
    if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    if (a.lastMessageAt) return -1;
    if (b.lastMessageAt) return 1;
    return a.name.localeCompare(b.name);
  });

  const searchLower = sidebarSearch.toLowerCase();
  const filteredChannels = searchLower ? channels.filter((r: any) => r.name.toLowerCase().includes(searchLower)) : channels;
  const filteredPeople = searchLower ? peopleList.filter((u: any) => u.name.toLowerCase().includes(searchLower)) : peopleList;

  const pinnedMessages = visibleMessages.filter((m: any) => isMsgPinned(m.id));

  if (loading && rooms.length === 0) return <PageLoader />;

  return (
    <>
    {/* Image Lightbox */}
    <AnimatePresence>
      {lightboxImg && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setLightboxImg(null)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={lightboxImg}
              alt="Full size"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            />
            <button
              onClick={() => setLightboxImg(null)}
              className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 flex items-center justify-center text-white transition-colors shadow-lg"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <a
              href={lightboxImg}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/70 hover:bg-black/90 border border-white/20 text-white text-xs font-medium shadow-lg transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <div className="flex h-[calc(100vh-10rem)] gap-0 rounded-2xl overflow-hidden glass-card border border-white/5">
      {/* Sidebar */}
      <div className="w-72 shrink-0 border-r border-white/5 flex flex-col bg-white/[0.02]">
        <div className="p-3 border-b border-white/5 flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-foreground">Chat</h2>
          <CreateGroupModal users={users} onCreate={createGroupRoom} />
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-white/5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder="Search people or channels…"
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          {/* Channels */}
          {filteredChannels.length > 0 && (
            <>
              <div className="px-3 mb-1 mt-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Channels</p>
              </div>
              {filteredChannels.map((room: any) => (
                <div key={room.id} className={`group/room flex items-center gap-0.5 mx-1 rounded-xl transition-colors ${activeRoom?.id === room.id ? "bg-primary/10" : "hover:bg-white/5"}`}>
                  <button onClick={() => selectRoom(room)}
                    className={`flex-1 flex items-center gap-2 px-2.5 py-2 text-sm text-left transition-colors ${activeRoom?.id === room.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    <div className="relative shrink-0">
                      <Hash className="w-4 h-4" />
                      {isRoomPinned(room.id) && <Pin className="w-2.5 h-2.5 text-amber-400 absolute -top-1 -right-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm">{room.name}</span>
                        {roomMeta[room.id]?.hasUnread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      {roomMeta[room.id]?.lastMessagePreview && (
                        <p className="text-[10px] text-muted-foreground truncate">{roomMeta[room.id].lastMessagePreview}</p>
                      )}
                    </div>
                  </button>
                  <RoomContextMenu room={room} isPinned={isRoomPinned(room.id)} onPin={() => toggleRoomPin(room.id)} onDelete={() => deleteRoom(room)} onLeave={() => deleteRoom(room)} isCreator={room.createdById === currentUserId} />
                </div>
              ))}
            </>
          )}

          {/* People — sort controls */}
          <div className="px-3 mb-1 mt-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">People</p>
            <div className="relative">
              <button
                onClick={() => setPeopleSortOpen(v => !v)}
                className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 px-1.5 py-0.5 rounded-md hover:bg-white/5 transition-colors"
                title="Sort people"
              >
                {peopleSort === "recent" ? "Recent" : peopleSort === "role" ? "Role" : "A–Z"}
                <ChevronRight className="w-2.5 h-2.5 rotate-90" />
              </button>
              {peopleSortOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-white/10 rounded-xl shadow-xl overflow-hidden text-xs w-32">
                  {(["recent", "role", "alpha"] as const).map(opt => (
                    <button key={opt} onClick={() => { setPeopleSort(opt); setPeopleSortOpen(false); }}
                      className={`w-full text-left px-3 py-2 transition-colors hover:bg-white/5 ${peopleSort === opt ? "text-primary font-medium" : "text-muted-foreground"}`}>
                      {opt === "recent" ? "Recent chats" : opt === "role" ? "Job roles" : "Alphabetical"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {filteredPeople.length === 0 && (
            <p className="px-4 text-xs text-muted-foreground italic py-1">No users found</p>
          )}
          {filteredPeople.map((person: any) => {
            const isActive = activeRoom && person.dmRoom && activeRoom.id === person.dmRoom.id;
            return (
              <button key={person.id}
                onClick={() => createPrivateRoom(person.id, person.name)}
                className={`w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}
              >
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[11px] font-bold">
                    {person.name.charAt(0)}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background ${person.isActive ? "bg-green-400" : "bg-slate-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium">{person.name}</span>
                    {person.hasUnread && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
                  {person.lastPreview ? (
                    <p className="text-[10px] text-muted-foreground truncate">
                      {person.lastPreviewType === "image" ? "📷 Image" : person.lastPreviewType === "voice_note" ? "🎤 Voice note" : person.lastPreview}
                    </p>
                  ) : person.role ? (
                    <p className="text-[10px] text-muted-foreground/70 truncate capitalize">{person.role}</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">Tap to message</p>
                  )}
                </div>
                {person.lastMessageAt && !isNaN(new Date(person.lastMessageAt).getTime()) && (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {format(new Date(person.lastMessageAt), "h:mm a")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeRoom ? (
          <>
            <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {activeRoom.isGroup ? <Hash className="w-5 h-5 text-primary" /> : <Lock className="w-5 h-5 text-primary" />}
                <h3 className="font-semibold text-foreground">{activeRoom.name}</h3>
                {isRoomPinned(activeRoom.id) && <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full"><Pin className="w-2.5 h-2.5" />Pinned</span>}
              </div>
              <div className="flex items-center gap-2">
                {pinnedMessages.length > 0 && (
                  <button
                    onClick={() => setShowPinnedMsgs(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showPinnedMsgs ? "bg-amber-400/20 text-amber-400" : "bg-white/5 text-muted-foreground hover:text-foreground"}`}
                  >
                    <Pin className="w-3.5 h-3.5" /> {pinnedMessages.length} Pinned
                  </button>
                )}
                <button onClick={clearRoomHistory}
                  title="Clear chat history (only for you)"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 rounded-lg text-sm font-medium transition-colors">
                  <Trash2 className="w-4 h-4" /> Clear
                </button>
                <button onClick={startVideoMeeting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition-colors">
                  <Video className="w-4 h-4" /> Meeting
                </button>
              </div>
            </div>

            {/* Pinned messages panel */}
            <AnimatePresence>
              {showPinnedMsgs && pinnedMessages.length > 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="border-b border-amber-400/10 bg-amber-400/5 overflow-hidden shrink-0">
                  <div className="p-3 max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Pin className="w-3 h-3" /> Pinned Messages
                    </p>
                    {pinnedMessages.map((m: any) => (
                      <div key={m.id} className="flex items-start gap-2 text-xs bg-amber-400/5 rounded-lg p-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[8px] font-bold shrink-0">{m.senderName?.charAt(0)}</div>
                        <div>
                          <span className="font-medium text-amber-300 mr-1">{m.senderName}:</span>
                          <span className="text-muted-foreground">{m.content?.slice(0, 100)}{m.content?.length > 100 ? "..." : ""}</span>
                        </div>
                        <button onClick={() => toggleMsgPin(m.id)} className="ml-auto shrink-0 text-muted-foreground hover:text-amber-400">
                          <PinOff className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={scrollContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-1 relative">
              {!isAtBottom && (
                <button
                  onClick={scrollToBottom}
                  className="sticky top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-white text-xs font-medium shadow-lg z-10 hover:bg-primary/90 transition-all w-fit mx-auto"
                >
                  <ArrowDown className="w-3.5 h-3.5" /> Jump to latest
                </button>
              )}
              {visibleMessages.map((msg: any, i: number) => {
                const isOwn = msg.senderId === currentUserId;
                const showName = !isOwn && (i === 0 || visibleMessages[i - 1].senderId !== msg.senderId);
                const pinned = isMsgPinned(msg.id);
                return (
                  <div key={msg.id} className={`flex gap-3 group/msg py-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                    {!isOwn && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                        {msg.senderName?.charAt(0) || "?"}
                      </div>
                    )}
                    <div className={`max-w-[65%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {showName && !isOwn && (
                        <span className="text-xs text-muted-foreground font-medium">{msg.senderName}</span>
                      )}
                      <div className={`relative group/bubble rounded-2xl px-4 py-2.5 ${isOwn ? "bg-primary text-white rounded-tr-sm" : "bg-white/8 text-foreground rounded-tl-sm"} ${pinned ? "ring-1 ring-amber-400/30" : ""}`}>
                        {pinned && <Pin className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />}
                        <MsgContent msg={msg} isOwn={isOwn} base={BASE} onImageClick={setLightboxImg} />
                      </div>
                      <div className={`flex items-center gap-1 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(msg.createdAt), "h:mm a")}</span>
                        {isOwn && (
                          <span className="flex items-center">
                            {msg._sending
                              ? <Clock className="w-3 h-3 text-muted-foreground animate-pulse" />
                              : (msg.seenBy?.length > 0)
                                ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" title="Seen" />
                                : <Check className="w-3 h-3 text-muted-foreground" title="Sent" />
                            }
                          </span>
                        )}
                        <MessageContextMenu
                          msg={msg}
                          isOwn={isOwn}
                          isPinned={isMsgPinned(msg.id)}
                          onDelete={() => deleteMessage(msg.id)}
                          onPin={() => toggleMsgPin(msg.id)}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Hash className="w-12 h-12 text-muted-foreground opacity-20 mb-4" />
                  <p className="text-muted-foreground text-sm">No messages yet. Say hello!</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/5 shrink-0">
              <div className="relative">
                {mentionQuery !== null && filteredMentionUsers.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-0 w-64 glass-panel border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/5 text-xs text-muted-foreground flex items-center gap-2">
                      <AtSign className="w-3.5 h-3.5 text-primary" /> Mention
                      {mentionQuery && <span className="text-primary font-mono">"{mentionQuery}"</span>}
                    </div>
                    {filteredMentionUsers.map((u: any) => (
                      <button key={u.id} onMouseDown={e => { e.preventDefault(); insertMention(u); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{u.name.charAt(0)}</div>
                        <span className="text-sm text-foreground">{u.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto capitalize">{u.role?.replace(/_/g, ' ')}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="*/*" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors" title="Attach image or document">
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`p-2 rounded-lg transition-colors ${isRecording ? "text-destructive bg-destructive/10 hover:bg-destructive/20" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}
                      title={isRecording ? "Stop recording" : "Record voice note"}
                    >
                      {isRecording ? <StopCircle className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                    </button>
                  </div>
                  <input
                    ref={textareaRef}
                    value={newMsg}
                    onChange={handleMsgChange}
                    onKeyDown={e => {
                      if (mentionQuery !== null && e.key === "Escape") { setMentionQuery(null); return; }
                      if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) { e.preventDefault(); sendMessage(); }
                    }}
                    placeholder={isRecording ? "Recording voice note..." : `Message ${activeRoom.name}... (@ to mention)`}
                    disabled={isRecording}
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground disabled:opacity-50"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMsg.trim() || sending}
                    className="p-2.5 bg-primary hover:bg-primary/80 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {isRecording && (
                <p className="text-xs text-destructive mt-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /> Recording voice note...
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-muted-foreground opacity-20 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Select a channel or team member</h3>
              <p className="text-muted-foreground text-sm mt-1">Choose from the sidebar to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function MsgContent({ msg, isOwn, base, onImageClick }: {
  msg: any; isOwn: boolean; base: string; onImageClick: (src: string) => void;
}) {
  if (msg.messageType === "text") {
    return <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>;
  }
  if (msg.messageType === "image") {
    const src = `${base}api${msg.fileUrl?.replace('/api', '')}`;
    return (
      <div className="relative group/img">
        <button onClick={() => onImageClick(src)} className="block focus:outline-none">
          <img
            src={src}
            alt={msg.fileName || "image"}
            className="max-w-[260px] w-full rounded-xl object-contain cursor-zoom-in"
            style={{ maxHeight: "320px" }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 rounded-xl transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
            <ZoomIn className="w-6 h-6 text-white drop-shadow" />
          </div>
        </button>
      </div>
    );
  }
  if (msg.messageType === "voice_note") {
    return (
      <div className="flex items-center gap-2 py-1">
        <Mic className="w-4 h-4 text-primary" />
        <audio controls src={`${base}api${msg.fileUrl?.replace('/api', '')}`} className="h-8 max-w-xs" />
      </div>
    );
  }
  if (msg.messageType === "document") {
    const src = `${base}api${msg.fileUrl?.replace('/api', '')}`;
    const name = msg.fileName || "document";
    const ext = name.split('.').pop()?.toLowerCase() || "";
    let iconColor = "text-blue-400";
    if (ext === "pdf") iconColor = "text-red-400";
    else if (["xls","xlsx","csv"].includes(ext)) iconColor = "text-green-400";
    else if (["doc","docx"].includes(ext)) iconColor = "text-blue-500";
    else if (["ppt","pptx"].includes(ext)) iconColor = "text-orange-400";
    return (
      <div className="min-w-[220px] max-w-xs">
        <div className={`flex items-center gap-3 p-3 rounded-xl mb-2 ${isOwn ? "bg-white/10" : "bg-white/5"} border border-white/10`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isOwn ? "bg-white/15" : "bg-white/8"}`}>
            <FileText className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={name}>{name}</p>
            <p className="text-[11px] opacity-60 uppercase">{ext} file</p>
          </div>
        </div>
        <a
          href={src}
          download={name}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors w-full justify-center ${isOwn ? "bg-white/15 hover:bg-white/25 text-white" : "bg-primary/10 hover:bg-primary/20 text-primary"}`}
        >
          <Download className="w-3.5 h-3.5" /> Download
        </a>
      </div>
    );
  }
  return null;
}

function CreateGroupModal({ users, onCreate }: { users: any[]; onCreate: (name: string, memberIds: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="Create channel">
          <Plus className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px] glass-panel border-white/10">
        <DialogHeader><DialogTitle>Create Group Channel</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. project-alpha" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Add Members</label>
            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {users.map((u: any) => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selected.includes(u.id) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"}`}>
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{u.name.charAt(0)}</div>
                  {u.name}
                  <span className="ml-auto text-xs opacity-60">{u.role?.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!name.trim()} onClick={() => { onCreate(name, selected); setOpen(false); setName(""); setSelected([]); }}>
              Create Channel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
