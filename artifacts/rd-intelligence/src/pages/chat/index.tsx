import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send, Plus, ImageIcon, Mic, MicOff, Users, Lock, Video, Hash,
  MoreVertical, StopCircle, Trash2, Pin, PinOff, LogOut, X,
  MessageSquare, AtSign, ChevronRight, ArrowLeft, FileText, Download, ZoomIn, Paperclip, ArrowDown,
  Check, CheckCheck, Clock, Search, Pencil, UserPlus, UserMinus,
  UserCircle, Phone, Briefcase, Building2, Mail, ShieldCheck, Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageLoader } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useCall } from "@/lib/call";

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

  const patch = (path: string, body: any) =>
    fetch(`${BASE}api${path}`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const postForm = (path: string, data: FormData) =>
    fetch(`${BASE}api${path}`, { method: "POST", headers: authHeader(), body: data }).then(r => r.json());

  const del = (path: string) =>
    fetch(`${BASE}api${path}`, { method: "DELETE", headers: authHeader() }).then(r => r.json());

  return { get, post, patch, postForm, del, token };
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

function RoomContextMenu({ room, isPinned, onPin, onDelete, onLeave, onEdit, isCreator }: {
  room: any; isPinned: boolean; onPin: () => void;
  onDelete: () => void; onLeave: () => void; onEdit?: () => void; isCreator: boolean;
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
            className="absolute right-0 top-full mt-1 w-44 glass-panel border border-white/10 rounded-xl shadow-2xl z-[80] overflow-hidden"
          >
            <button onClick={() => { onPin(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
              {isPinned ? <PinOff className="w-4 h-4 text-amber-400" /> : <Pin className="w-4 h-4 text-amber-400" />}
              {isPinned ? "Unpin" : "Pin to Top"}
            </button>
            {isCreator && onEdit && room.isGroup && (
              <>
                <div className="border-t border-white/5" />
                <button onClick={() => { onEdit(); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
                  <Pencil className="w-4 h-4 text-primary" /> Edit Channel
                </button>
              </>
            )}
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

function MessageContextMenu({ msg, isOwn, isPinned, onDelete, onPin, onSelect, onForward, isSelected }: {
  msg: any; isOwn: boolean; isPinned: boolean; onDelete: () => void; onPin: () => void; onSelect?: () => void; onForward?: () => void; isSelected?: boolean;
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
            <div className="border-t border-white/5" />
            {onSelect && (
              <button onClick={() => { onSelect(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
                <Check className="w-4 h-4" /> {isSelected ? "Deselect" : "Select"}
              </button>
            )}
            {onForward && (
              <button onClick={() => { onForward(); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors">
                <Share2 className="w-4 h-4" /> Forward
              </button>
            )}
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
  const { startCall, wsSend, onWsMessage } = useCall();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [rooms, setRooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  // The superadmin is unlisted (never in /chat/users) but still reachable
  // via a dedicated "Administrator" entry. This holds their minimal identity.
  const [adminContact, setAdminContact] = useState<{ id: number; name: string; avatar: string | null } | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<any>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardingMsg, setForwardingMsg] = useState<any>(null);

  // Below lg: (1024 px) we render either the sidebar (people + channels)
  // OR the chat panel — never both — so the chat feels like a phone chat
  // app. Conditional rendering instead of CSS classes so PWA caching /
  // theme overrides cannot leak the wrong panel in.
  const [isBelowLg, setIsBelowLg] = useState<boolean>(
    typeof window !== "undefined" ? window.innerWidth < 1024 : false,
  );
  useEffect(() => {
    const onResize = () => setIsBelowLg(window.innerWidth < 1024);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const showSidebar = !isBelowLg || !activeRoom;
  const showChatPanel = !isBelowLg || !!activeRoom;
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
  const [forwardSearch, setForwardSearch] = useState("");
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

  // Always land on the newest message when a room is opened/switched. A
  // double rAF lets the freshly-rendered rows lay out before we jump, so the
  // view reliably starts at the bottom instead of needing a manual scroll.
  useEffect(() => {
    if (!activeRoom) return;
    const id = activeRoom.id;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (activeRoom?.id === id) {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
        setIsAtBottom(true);
      }
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id]);

  // Keep pinned to the bottom as new messages arrive, but only if the user
  // is already near the bottom (don't yank them up while reading history).
  useEffect(() => {
    if (isAtBottom) messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // ── Typing indicators (over the call WebSocket) ──────────────────────────
  // typingByRoom[roomId] = { name, at } — who is currently typing in a room.
  const [typingByRoom, setTypingByRoom] = useState<Record<number, { name: string; at: number }>>({});
  const typingSentAtRef = useRef(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = onWsMessage((msg: any) => {
      if (msg?.type !== "chat:typing" || typeof msg.roomId !== "number") return;
      setTypingByRoom(prev => {
        const next = { ...prev };
        if (msg.typing) next[msg.roomId] = { name: msg.fromName || "Someone", at: Date.now() };
        else delete next[msg.roomId];
        return next;
      });
    });
    return off;
  }, [onWsMessage]);

  // Expire stale "typing" flags in case a stop event was missed.
  useEffect(() => {
    const id = setInterval(() => {
      setTypingByRoom(prev => {
        const now = Date.now();
        let changed = false;
        const next: typeof prev = {};
        for (const k in prev) {
          if (now - prev[k].at < 6000) next[k] = prev[k]; else changed = true;
        }
        return changed ? next : prev;
      });
    }, 2500);
    return () => clearInterval(id);
  }, []);

  // Tell the other member(s) of the active room that we're typing. Throttled,
  // with an auto "stopped typing" after a short idle gap.
  const notifyTyping = () => {
    if (!activeRoom || !Array.isArray(activeRoom.memberUserIds)) return;
    const recipients = activeRoom.memberUserIds.filter((id: number) => id !== currentUserId);
    if (recipients.length === 0) return;
    const now = Date.now();
    if (now - typingSentAtRef.current > 1500) {
      typingSentAtRef.current = now;
      recipients.forEach((id: number) => wsSend({ type: "chat:typing", toUserId: id, roomId: activeRoom.id, typing: true }));
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      typingSentAtRef.current = 0;
      recipients.forEach((id: number) => wsSend({ type: "chat:typing", toUserId: id, roomId: activeRoom.id, typing: false }));
    }, 2000);
  };

  const activeTyping = activeRoom ? typingByRoom[activeRoom.id] : null;

  const { isPinned: isRoomPinned, toggle: toggleRoomPin } = usePinnedRooms();
  const { isPinned: isMsgPinned, toggle: toggleMsgPin } = usePinnedMessages(activeRoom?.id || 0);
  const [profileUser, setProfileUser] = useState<any | null>(null);

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
    api.get("/chat/admin-contact").then((c: any) => { if (c && typeof c.id === "number") setAdminContact(c); }).catch(() => {});
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
      // On phone + tablet (below lg, 1024 px) we leave the chat empty so
      // the user lands on the people + channels list first — they then
      // tap a row to open the conversation. On desktop we keep the old
      // behaviour and auto-open the first channel so the layout doesn't
      // start with an empty pane.
      const onMobile = typeof window !== "undefined" && window.innerWidth < 1024;
      const channels = list.filter((room: any) => room.isGroup);
      if (onMobile) {
        setLoading(false);
      } else if (channels.length > 0) {
        selectRoom(channels[0]);
      } else if (list.length > 0) {
        selectRoom(list[0]);
      } else {
        setLoading(false);
      }
    });
    // Poll users every 10 seconds to refresh online status
    pollRef.current = setInterval(() => {
      api.get("/chat/users").then((u: any) => {
        if (Array.isArray(u)) setUsers(u);
      }).catch(() => {});
    }, 10 * 1000);
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
    // Clear our "typing" flag for the other side immediately on send.
    if (typingStopTimerRef.current) { clearTimeout(typingStopTimerRef.current); typingStopTimerRef.current = null; }
    typingSentAtRef.current = 0;
    if (Array.isArray(activeRoom.memberUserIds)) {
      activeRoom.memberUserIds
        .filter((id: number) => id !== currentUserId)
        .forEach((id: number) => wsSend({ type: "chat:typing", toUserId: id, roomId: activeRoom.id, typing: false }));
    }
    const tempId = `temp_${Date.now()}`;
    const optimistic = { _tempId: tempId, _sending: true, id: tempId, roomId: activeRoom.id, content, messageType: "text", senderId: currentUserId, senderName: "You", createdAt: new Date().toISOString(), seenBy: [] };
    setMessages(prev => [...prev, optimistic]);
    setNewMsg("");
    setSending(true);
    try {
      const msg = await api.post(`/chat/rooms/${activeRoom.id}/messages`, { content, messageType: "text" });
      setMessages(prev => prev.map((m: any) => m._tempId === tempId ? { ...msg, seenBy: msg.seenBy || [] } : m));
      // Update user's online status
      api.post("/chat/users/update-activity", {}).catch(() => {});
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

  const bulkDeleteMessages = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} message(s)? This cannot be undone.`)) return;
    try {
      await api.del(`/chat/rooms/${activeRoom.id}/messages`, { messageIds: Array.from(selectedIds) });
      setMessages(prev => prev.filter((m: any) => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      setSelectMode(false);
      toast({ title: `Deleted ${selectedIds.size} message(s)` });
    } catch {
      toast({ title: "Failed to delete messages", variant: "destructive" });
    }
  };

  const forwardMessage = async (msg: any, toRoomId: number) => {
    try {
      await api.post(`/chat/rooms/${activeRoom.id}/messages/${msg.id}/forward`, { toRoomId });
      setForwardModalOpen(false);
      setForwardingMsg(null);
      toast({ title: "Message forwarded" });
    } catch {
      toast({ title: "Failed to forward message", variant: "destructive" });
    }
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

  const editGroupRoom = async (roomId: number, name: string, memberIds: number[]) => {
    const updated = await api.patch(`/chat/rooms/${roomId}`, { name, memberIds });
    if (!updated || updated.error) {
      toast({ title: "Could not save changes", description: updated?.error || "Try again.", variant: "destructive" });
      return;
    }
    setRooms(prev => prev.map((r: any) => r.id === roomId ? { ...r, ...updated } : r));
    if (activeRoom?.id === roomId) setActiveRoom((prev: any) => prev ? { ...prev, ...updated } : prev);
    toast({ title: "Channel updated" });
  };

  const [editingRoom, setEditingRoom] = useState<any>(null);

  const createPrivateRoom = async (userId: number, userName: string) => {
    const room = await api.post("/chat/rooms", { name: userName, isGroup: false, memberIds: [userId] });
    setRooms(prev => { const exists = prev.find((r: any) => r.id === room.id); return exists ? prev : [...prev, room]; });
    selectRoom(room);
  };

  // Open (or create) the 1:1 conversation with the unlisted superadmin.
  const openAdminDm = async () => {
    const room = await api.post("/chat/admin-dm", {});
    if (!room || !room.id) return;
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
    if (val.trim()) notifyTyping();
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

  // The superadmin is unlisted, so their DM (whether started by us or by
  // them) never matches a row in `peopleList`. Surface it through a single
  // always-present "Administrator" entry instead, matched by their id.
  // Gated on showAdminContact so it never mis-matches in the superadmin's
  // own session (where adminContact is themselves).
  const showAdminContact = !!adminContact && adminContact.id !== currentUserId;
  const adminDmRoom = showAdminContact
    ? dmRooms.find((r: any) => Array.isArray(r.memberUserIds)
        && r.memberUserIds.includes(adminContact!.id)
        && r.memberUserIds.includes(currentUserId))
    : null;
  const adminMeta = adminDmRoom ? roomMeta[adminDmRoom.id] : null;

  // Helper: check if user is online (active within last 30 seconds)
  const isUserOnline = (lastActiveAt: string | null | undefined) => {
    if (!lastActiveAt) return false;
    const lastActive = new Date(lastActiveAt).getTime();
    const now = Date.now();
    return now - lastActive < 30 * 1000; // 30 seconds
  };

  // Build people list: all users with DM room info, sorted by chosen mode
  const peopleList = users.filter((u: any) => u.id !== currentUserId).map((u: any) => {
    // Match the DM room by membership (server now returns memberUserIds for
    // every room). The old name-based match merged any two users that shared
    // a first name (e.g. two "Paul"s) into the same conversation thread.
    const dmRoom = dmRooms.find((r: any) =>
      Array.isArray(r.memberUserIds)
        ? r.memberUserIds.includes(u.id) && r.memberUserIds.includes(currentUserId) && r.memberUserIds.length === 2
        : (r.name === u.name || r.name === u.name.split(" ")[0]),
    );
    const meta = dmRoom ? roomMeta[dmRoom.id] : null;
    const isOnline = isUserOnline(u.lastActiveAt);
    return { ...u, dmRoom, lastMessageAt: meta?.lastMessageAt ?? null, lastPreview: meta?.lastMessagePreview ?? null, lastPreviewType: meta?.lastMessageType ?? null, hasUnread: meta?.hasUnread ?? false, isOnline };
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
  // Without a search term, only show people the current user has actually
  // talked to (DM exists / last message timestamp / unread mark). This stops
  // the sidebar from listing every account on the platform by default. Users
  // can still discover anyone else by typing their name into the search box.
  const filteredPeople = searchLower
    ? peopleList.filter((u: any) =>
        u.name.toLowerCase().includes(searchLower)
        || (u.email ?? "").toLowerCase().includes(searchLower),
      )
    : peopleList.filter((u: any) => u.dmRoom || u.lastMessageAt || u.hasUnread);

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

    <div className={cn(
      // h-full (not h-[calc(100vh-...)]) so on mobile the chat fits inside
      // the AppLayout scroll area instead of overflowing the visible
      // viewport — overflowing was pushing the topbar off-screen on
      // phones and making it impossible to navigate away from /chat.
      "flex h-full gap-0 lg:rounded-2xl overflow-hidden lg:border relative",
      isLight ? "bg-white lg:border-slate-200" : "glass-card lg:border-white/5",
    )}>
      {/* Sidebar — kept in the DOM at all times so switching panels is
          instant (no aurora SVG remount, no message-list remount). We
          just flip `display` via inline style. Inline beats every class
          and survives PWA caching. `min-h-0` lets the inner people list
          actually overflow and scroll on phone/tablet. */}
      <div
        className={cn(
          "shrink-0 border-r border-white/5 flex-col bg-white/[0.02] min-h-0 h-full",
          isBelowLg ? "w-full" : "w-72",
        )}
        style={{
          display: showSidebar ? "flex" : "none",
          width: isBelowLg ? "100%" : undefined,
        }}
      >
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
                  <RoomContextMenu room={room} isPinned={isRoomPinned(room.id)} onPin={() => toggleRoomPin(room.id)} onDelete={() => deleteRoom(room)} onLeave={() => deleteRoom(room)} onEdit={() => setEditingRoom(room)} isCreator={room.createdById === currentUserId} />
                </div>
              ))}
            </>
          )}

          {/* Administrator — unlisted superadmin, always reachable */}
          {showAdminContact && (
            <>
              <div className="px-3 mb-1 mt-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Support</p>
              </div>
              <button
                onClick={openAdminDm}
                style={adminDmRoom && activeRoom?.id === adminDmRoom.id && isLight ? { color: "#ffffff" } : undefined}
                className={cn(
                  "relative w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left transition-all",
                  adminDmRoom && activeRoom?.id === adminDmRoom.id
                    ? isLight
                      ? "bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25"
                      : "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : isLight
                      ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <div className="relative shrink-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-md">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-sm font-medium">Administrator</span>
                    {adminMeta?.hasUnread && (
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        adminDmRoom && activeRoom?.id === adminDmRoom.id && isLight ? "bg-white" : "bg-primary",
                      )} />
                    )}
                  </div>
                  <p className={cn(
                    "text-[10px] truncate",
                    adminDmRoom && activeRoom?.id === adminDmRoom.id
                      ? isLight ? "text-white/85" : "text-primary/70"
                      : "text-muted-foreground",
                  )}>
                    {adminMeta?.lastMessagePreview
                      ? (adminMeta.lastMessageType === "image" ? "📷 Image" : adminMeta.lastMessageType === "voice_note" ? "🎤 Voice note" : adminMeta.lastMessagePreview)
                      : "Message the administrator"}
                  </p>
                </div>
              </button>
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
            // Active-DM row design:
            //   Light mode → solid indigo→violet gradient with white text,
            //   matching the new chat-bubble gradient for visual continuity.
            //   Dark mode → subtle primary tint (the existing look).
            // Inline color override on the row guarantees white text in
            // light mode regardless of cascade.
            return (
              <button key={person.id}
                onClick={() => createPrivateRoom(person.id, person.name)}
                style={isActive && isLight ? { color: "#ffffff" } : undefined}
                className={cn(
                  "relative w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left transition-all",
                  isActive
                    ? isLight
                      ? "bg-gradient-to-r from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25"
                      : "bg-primary/15 text-primary ring-1 ring-primary/30 shadow-[inset_0_0_0_1px_rgba(124,77,255,0.15)]"
                    : isLight
                      ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                {isActive && (
                  <span className={cn(
                    "absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full",
                    isLight ? "bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.6)]" : "bg-primary shadow-[0_0_8px_rgba(124,77,255,0.6)]",
                  )} />
                )}
                <div className="relative shrink-0">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-shadow",
                    isActive
                      ? isLight
                        ? "bg-white/25 text-white shadow ring-1 ring-white/40"
                        : "bg-gradient-to-tr from-primary to-accent text-white shadow-md shadow-primary/30"
                      : "bg-gradient-to-tr from-secondary/50 to-primary/50 text-white",
                  )}>
                    {person.name.charAt(0)}
                  </div>
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border",
                    isActive && isLight ? "border-indigo-600" : isLight ? "border-white" : "border-background",
                    person.isOnline ? "bg-green-400" : "bg-red-500",
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "truncate text-sm",
                      isActive ? "font-semibold" : "font-medium",
                    )}>
                      {person.name}
                    </span>
                    {person.hasUnread && (
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        isActive && isLight ? "bg-white" : "bg-primary",
                      )} />
                    )}
                  </div>
                  {person.lastPreview ? (
                    <p className={cn(
                      "text-[10px] truncate",
                      isActive
                        ? isLight ? "text-white/85" : "text-primary/70"
                        : "text-muted-foreground",
                    )}>
                      {person.lastPreviewType === "image" ? "📷 Image" : person.lastPreviewType === "voice_note" ? "🎤 Voice note" : person.lastPreview}
                    </p>
                  ) : (
                    <p className={cn(
                      "text-[10px] truncate",
                      isActive
                        ? isLight ? "text-white/80" : "text-primary/70"
                        : "text-muted-foreground/80",
                    )}>
                      {person.email ?? (person.role ? person.role.replace(/_/g, " ") : "Tap to message")}
                    </p>
                  )}
                </div>
                {isActive ? (
                  <span
                    style={isLight ? { color: "#ffffff" } : undefined}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border",
                      isLight
                        ? "bg-white/20 border-white/40"
                        : "bg-primary/20 border-primary/40 text-primary",
                    )}
                  >
                    <span className={cn(
                      "w-1 h-1 rounded-full animate-pulse",
                      isActive && isLight ? "bg-white" : "bg-primary",
                    )} />
                    Active
                  </span>
                ) : person.lastMessageAt && !isNaN(new Date(person.lastMessageAt).getTime()) ? (
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {format(new Date(person.lastMessageAt), "h:mm a")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chat — kept in the DOM, toggled via inline display so the
          aurora background + message list don't have to re-render on
          every panel switch. Switching now feels instant. */}
      <div
        className="flex-1 min-w-0 relative flex-col"
        style={{ display: showChatPanel ? "flex" : "none" }}
      >
        {/* Background — softly pulsing aurora gradient with three layered
            SVG waves drifting horizontally at different speeds. Calmer and
            more "official" than the previous dot-grid; tuned to the brand
            palette for both themes. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div aria-hidden className={cn("absolute inset-0", isLight ? "chat-aurora-light" : "chat-aurora-dark")} />
          <svg
            aria-hidden
            className="absolute inset-x-0 bottom-0 w-full h-48 opacity-50"
            viewBox="0 0 1440 240"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="chatWaveA" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={isLight ? "#a78bfa" : "#7c4dff"} stopOpacity="0.18" />
                <stop offset="100%" stopColor={isLight ? "#22d3ee" : "#38bdf8"} stopOpacity="0.18" />
              </linearGradient>
              <linearGradient id="chatWaveB" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor={isLight ? "#f0abfc" : "#ec4899"} stopOpacity="0.14" />
                <stop offset="100%" stopColor={isLight ? "#818cf8" : "#7c4dff"} stopOpacity="0.14" />
              </linearGradient>
            </defs>
            <path
              className="chat-wave chat-wave-a"
              fill="url(#chatWaveA)"
              d="M0,160 C240,200 480,80 720,128 C960,176 1200,80 1440,128 L1440,240 L0,240 Z"
            />
            <path
              className="chat-wave chat-wave-b"
              fill="url(#chatWaveB)"
              d="M0,180 C240,140 480,220 720,168 C960,120 1200,200 1440,160 L1440,240 L0,240 Z"
            />
          </svg>
          <div
            aria-hidden
            className={cn(
              "absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t",
              isLight ? "from-white/80 to-transparent" : "from-background/70 to-transparent",
            )}
          />
        </div>
        <div className="relative flex-1 flex flex-col min-h-0">
        {activeRoom ? (
          <>
            {(() => {
              // Resolve the DM partner three ways, in order of reliability,
              // so the View Profile button still appears for rooms whose
              // cache predates the backend change that started returning
              // memberUserIds:
              //   1. memberUserIds (preferred — exact membership)
              //   2. user whose name matches the room name (DM rooms get
              //      named after the partner on create)
              //   3. user whose first name matches the room name (legacy)
              let dmPartner: any = null;
              if (!activeRoom.isGroup) {
                if (Array.isArray(activeRoom.memberUserIds)) {
                  const otherId = activeRoom.memberUserIds.find((id: number) => id !== currentUserId);
                  if (otherId) dmPartner = users.find((u: any) => u.id === otherId) ?? null;
                }
                if (!dmPartner) {
                  dmPartner = users.find((u: any) => u.id !== currentUserId && u.name === activeRoom.name) ?? null;
                }
                if (!dmPartner) {
                  dmPartner = users.find((u: any) => u.id !== currentUserId && u.name?.split(" ")[0] === activeRoom.name) ?? null;
                }
              }
              // Who to ring for a 1:1 call. For the unlisted-admin DM the
              // partner isn't in `users`, so fall back to adminContact.
              const isAdminDm = !!adminDmRoom && activeRoom.id === adminDmRoom.id;
              const callPeerId: number | null = !activeRoom.isGroup
                ? (isAdminDm ? (adminContact?.id ?? null) : (dmPartner?.id ?? null))
                : null;
              const callPeerName: string = isAdminDm
                ? (adminContact?.name ?? "Administrator")
                : (dmPartner?.name ?? activeRoom.name);
              return (
            <div className="px-3 lg:px-6 py-3 border-b border-white/5 flex items-center justify-between shrink-0 gap-2 lg:gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  onClick={() => setActiveRoom(null)}
                  className="lg:hidden h-10 w-10 -ml-1.5 rounded-xl flex items-center justify-center text-foreground hover:bg-white/5 active:bg-white/10 transition-colors shrink-0"
                  aria-label="Back to chats"
                  title="Back to chats"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                {activeRoom.isGroup ? <Hash className="w-5 h-5 text-primary shrink-0" /> : <Lock className="w-5 h-5 text-primary shrink-0" />}
                <h3 className="font-semibold text-foreground truncate">
                  {adminDmRoom && activeRoom.id === adminDmRoom.id ? adminContact!.name : activeRoom.name}
                </h3>
                {isRoomPinned(activeRoom.id) && <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full shrink-0"><Pin className="w-2.5 h-2.5" />Pinned</span>}
                {dmPartner && (
                  <button
                    onClick={() => setProfileUser(dmPartner)}
                    title={`View ${dmPartner.name}'s profile`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors shrink-0"
                  >
                    <UserCircle className="w-3.5 h-3.5" />
                    View Profile
                  </button>
                )}
                {callPeerId && (
                  <>
                    <button
                      onClick={() => startCall(callPeerId, callPeerName, "audio")}
                      title={`Voice call ${callPeerName}`}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors shrink-0"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => startCall(callPeerId, callPeerName, "video")}
                      title={`Video call ${callPeerName}`}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 transition-colors shrink-0"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </>
                )}
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
                {activeRoom.isGroup && activeRoom.createdById === currentUserId && (
                  <button
                    onClick={() => setEditingRoom(activeRoom)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-blue-500/10 text-muted-foreground hover:text-blue-400 rounded-lg text-sm font-medium transition-colors"
                    title="Edit channel name and members"
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                )}
                <button
                  onClick={() => deleteRoom(activeRoom)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 rounded-lg text-sm font-medium transition-colors"
                  title={activeRoom.isGroup && activeRoom.createdById !== currentUserId ? "Leave this channel" : "Delete this conversation"}
                >
                  <Trash2 className="w-4 h-4" /> {activeRoom.isGroup && activeRoom.createdById !== currentUserId ? "Leave" : "Delete"}
                </button>
              </div>
            </div>
              );
            })()}

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
                const isUnread = !msg.seenBy?.includes(currentUserId) && !isOwn;
                const isFirstUnread = isUnread && (i === 0 || visibleMessages[i - 1].seenBy?.includes(currentUserId) || visibleMessages[i - 1].senderId === currentUserId);
                const isSelected = selectedIds.has(msg.id);
                return (
                  <>
                    {isFirstUnread && (
                      <div className="flex items-center gap-3 py-2 my-2">
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider px-2">New Messages</span>
                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                      </div>
                    )}
                    <div key={msg.id} className={`flex gap-3 group/msg py-0.5 ${isOwn ? "flex-row-reverse" : "flex-row"} ${isSelected ? "bg-primary/10 rounded-lg px-2" : ""}`}>
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (isSelected) next.delete(msg.id);
                          else next.add(msg.id);
                          return next;
                        })}
                        className="w-5 h-5 rounded border-white/30 bg-white/5 mt-1 shrink-0 cursor-pointer"
                      />
                    )}
                    {!isOwn && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                        {msg.senderName?.charAt(0) || "?"}
                      </div>
                    )}
                    <div className={`max-w-[65%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {showName && !isOwn && (
                        <span className="text-xs text-muted-foreground font-medium">{msg.senderName}</span>
                      )}
                      {/*
                        Bubble palette per theme. Inline style on color avoids
                        any Tailwind v4 vs class-cascade specificity issues
                        with !text-white in light mode (the previous setup
                        rendered as dark text on indigo for some users).
                        Both sent and received bubbles use white text in light
                        mode; backgrounds are rich gradients with a soft
                        shadow for depth.
                      */}
                      <div
                        style={
                          isLight || isOwn
                            ? { color: "#ffffff" }
                            : undefined
                        }
                        className={cn(
                          "chat-bubble-text relative group/bubble rounded-2xl px-4 py-2.5 text-sm font-medium",
                          // Nuclear white — wins via !important in index.css,
                          // applied whenever the bubble's background is dark
                          // enough that the text should be white (sent in any
                          // theme; received in light because the received
                          // bubble in light mode is slate-700 gradient).
                          (isOwn || isLight) && "chat-force-white",
                          isOwn
                            ? isLight
                              ? "bg-gradient-to-br from-indigo-500 to-violet-600 rounded-tr-sm shadow-md shadow-indigo-500/20"
                              : "bg-primary rounded-tr-sm shadow-sm"
                            : isLight
                              ? "bg-gradient-to-br from-slate-700 to-slate-800 rounded-tl-sm shadow-md shadow-slate-700/20"
                              : "bg-white/8 text-foreground rounded-tl-sm",
                          pinned && "ring-1 ring-amber-400/30",
                        )}
                      >
                        {pinned && <Pin className="w-3 h-3 text-amber-400 absolute -top-1 -right-1" />}
                        <MsgContent msg={msg} isOwn={isOwn} base={BASE} onImageClick={setLightboxImg} forceWhiteText={isLight || isOwn} />
                      </div>
                      <div className={`flex items-center gap-1 px-1 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(msg.createdAt), "h:mm a")}</span>
                        {isOwn && (
                          <span className="flex items-center">
                            {msg._sending
                              ? <Clock className="w-3 h-3 text-muted-foreground animate-pulse" />
                              : (msg.seenBy?.length > 0)
                                ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" aria-label="Seen" />
                                : <Check className="w-3 h-3 text-muted-foreground" aria-label="Sent" />
                            }
                          </span>
                        )}
                        <MessageContextMenu
                          msg={msg}
                          isOwn={isOwn}
                          isPinned={isMsgPinned(msg.id)}
                          onDelete={() => deleteMessage(msg.id)}
                          onPin={() => toggleMsgPin(msg.id)}
                          isSelected={isSelected}
                          onSelect={() => {
                            setSelectMode(true);
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(msg.id)) next.delete(msg.id);
                              else next.add(msg.id);
                              return next;
                            });
                          }}
                          onForward={() => {
                            setForwardingMsg(msg);
                            setForwardModalOpen(true);
                            setLightboxImg(null);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  </>
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

            {selectMode && (
              <div className="shrink-0 px-4 py-3 border-t border-white/5 bg-white/[0.02] flex items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedIds(new Set(visibleMessages.map(m => m.id)));
                  }}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  Select All
                </button>
                <span className="text-xs text-muted-foreground">
                  {selectedIds.size} selected
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground"
                >
                  Cancel
                </button>
                {selectedIds.size === 1 && (
                  <button
                    onClick={() => {
                      const msg = visibleMessages.find(m => selectedIds.has(m.id));
                      if (msg) { setForwardingMsg(msg); setForwardModalOpen(true); setLightboxImg(null); }
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400"
                  >
                    Forward
                  </button>
                )}
                <button
                  onClick={bulkDeleteMessages}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400"
                >
                  Delete ({selectedIds.size})
                </button>
              </div>
            )}

            {activeTyping && (
              <div className="px-5 pb-1 shrink-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex gap-0.5 items-end">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  <span><span className="font-medium text-foreground">{activeTyping.name}</span> is typing…</span>
                </div>
              </div>
            )}

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
    </div>

    {/* Forward Message modal */}
    <AnimatePresence>
      {forwardModalOpen && forwardingMsg && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { setForwardModalOpen(false); setForwardingMsg(null); setForwardSearch(""); }}
          className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className={cn("w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden", isLight ? "bg-white border border-slate-200" : "bg-card border border-white/10")}
          >
            <div className={cn("p-6 border-b", isLight ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/5")}>
              <h2 className={cn("text-xl font-semibold", isLight ? "text-slate-900" : "text-foreground")}>Forward Message</h2>
              <p className={cn("text-sm mt-1", isLight ? "text-slate-500" : "text-muted-foreground")}>Select a user to send this message</p>
            </div>
            <div className={cn("p-4 border-b", isLight ? "border-slate-200" : "border-white/5")}>
              <input
                type="text"
                placeholder="Search users..."
                value={forwardSearch}
                className={cn("w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50", isLight ? "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" : "border border-white/10 bg-black/20 text-foreground placeholder:text-muted-foreground")}
                onChange={(e) => setForwardSearch(e.target.value)}
              />
            </div>
            <div className="p-4 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {users.filter((u: any) => {
                const search = forwardSearch.toLowerCase();
                return u.id !== currentUserId && (
                  (u.name && u.name.toLowerCase().includes(search)) ||
                  (u.email && u.email.toLowerCase().includes(search))
                );
              }).length === 0 ? (
                <p className={cn("text-sm text-center py-8", isLight ? "text-slate-500" : "text-muted-foreground")}>
                  {forwardSearch ? "No users found" : "No users available"}
                </p>
              ) : (
                users.filter((u: any) => {
                  const search = forwardSearch.toLowerCase();
                  return u.id !== currentUserId && (
                    (u.name && u.name.toLowerCase().includes(search)) ||
                    (u.email && u.email.toLowerCase().includes(search))
                  );
                }).map((user: any) => (
                    <button
                      key={user.id}
                      onClick={() => {
                        // Create a DM with the user if not exists, then forward
                        createPrivateRoom(user.id, user.name);
                        // Find the DM room and forward after it's created
                        setTimeout(() => {
                          const dmRoom = dmRooms.find((r: any) =>
                            Array.isArray(r.memberUserIds)
                              ? r.memberUserIds.includes(user.id) && r.memberUserIds.includes(currentUserId) && r.memberUserIds.length === 2
                              : false,
                          );
                          if (dmRoom) {
                            forwardMessage(forwardingMsg, dmRoom.id);
                          }
                        }, 300);
                        setForwardModalOpen(false);
                        setForwardingMsg(null);
                      }}
                      className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left", isLight ? "hover:bg-slate-100 text-slate-900" : "hover:bg-white/5 text-foreground")}
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {user.name?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className={cn("text-xs truncate", isLight ? "text-slate-500" : "text-muted-foreground")}>{user.email}</p>
                      </div>
                      {isUserOnline(user.lastActiveAt) && (
                        <span className={cn("text-[8px] font-bold uppercase px-2 py-1 rounded-full", isLight ? "text-emerald-600 bg-emerald-50" : "text-emerald-400 bg-emerald-500/10")}>Online</span>
                      )}
                    </button>
                  ))
              )}
            </div>
            <div className={cn("p-4 border-t flex gap-2", isLight ? "border-slate-200" : "border-white/5")}>
              <button
                onClick={() => { setForwardModalOpen(false); setForwardingMsg(null); setForwardSearch(""); }}
                className={cn("flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors", isLight ? "border border-slate-200 text-slate-600 hover:bg-slate-100" : "bg-white/5 hover:bg-white/10 text-foreground")}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Edit Channel modal — rename + add/remove members. Creator only. */}
    <EditGroupModal
      room={editingRoom}
      users={users}
      currentUserId={currentUserId}
      onClose={() => setEditingRoom(null)}
      onSave={(name, memberIds) => {
        if (editingRoom) {
          editGroupRoom(editingRoom.id, name, memberIds);
          setEditingRoom(null);
        }
      }}
    />

    {/* View Profile modal — opened from the chat header for DMs. Shows the
        partner's name, role, department, phone, email, and avatar. */}
    <AnimatePresence>
      {profileUser && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setProfileUser(null)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.15 }}
            onClick={e => e.stopPropagation()}
            className={cn(
              "w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden",
              isLight ? "bg-white border-slate-200" : "bg-card border-white/10",
            )}
          >
            <div className={cn(
              "px-5 py-4 border-b flex items-start justify-between",
              isLight ? "border-slate-100 bg-slate-50" : "border-white/10 bg-white/5",
            )}>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Team profile</p>
                <h3 className={cn("text-base font-bold mt-0.5 truncate", isLight ? "text-slate-900" : "text-foreground")}>
                  {profileUser.name}
                </h3>
              </div>
              <button
                onClick={() => setProfileUser(null)}
                className={cn(
                  "p-1.5 rounded-lg shrink-0 transition-colors",
                  isLight ? "hover:bg-slate-100 text-slate-500" : "hover:bg-white/10 text-muted-foreground",
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-4 mb-5">
                {profileUser.avatar ? (
                  <img src={profileUser.avatar} alt={profileUser.name} className="w-16 h-16 rounded-2xl object-cover shadow" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xl font-bold shadow">
                    {profileUser.name?.charAt(0) ?? "?"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold truncate", isLight ? "text-slate-900" : "text-foreground")}>{profileUser.name}</p>
                  <p className={cn(
                    "text-xs capitalize",
                    isUserOnline(profileUser.lastActiveAt) ? (isLight ? "text-emerald-600" : "text-emerald-400") : "text-muted-foreground",
                  )}>
                    <span className={cn(
                      "inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle",
                      isUserOnline(profileUser.lastActiveAt) ? "bg-emerald-400" : "bg-red-500",
                    )} />
                    {isUserOnline(profileUser.lastActiveAt) ? "Active now" : "Offline"}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {(profileUser.jobPosition || profileUser.role) && (
                  <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 border", isLight ? "bg-slate-50 border-slate-100" : "bg-white/5 border-white/10")}>
                    <Briefcase className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Role</p>
                      <p className={cn("text-sm font-medium capitalize truncate", isLight ? "text-slate-900" : "text-foreground")}>
                        {(profileUser.jobPosition ?? profileUser.role ?? "").replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                )}
                {profileUser.department && (
                  <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 border", isLight ? "bg-slate-50 border-slate-100" : "bg-white/5 border-white/10")}>
                    <Building2 className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Department</p>
                      <p className={cn("text-sm font-medium truncate", isLight ? "text-slate-900" : "text-foreground")}>{profileUser.department}</p>
                    </div>
                  </div>
                )}
                {profileUser.phone && (
                  <a
                    href={`tel:${profileUser.phone}`}
                    className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors", isLight ? "bg-slate-50 border-slate-100 hover:bg-slate-100" : "bg-white/5 border-white/10 hover:bg-white/10")}
                  >
                    <Phone className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phone</p>
                      <p className={cn("text-sm font-medium truncate", isLight ? "text-slate-900" : "text-foreground")}>{profileUser.phone}</p>
                    </div>
                  </a>
                )}
                {profileUser.email && (
                  <a
                    href={`mailto:${profileUser.email}`}
                    className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors", isLight ? "bg-slate-50 border-slate-100 hover:bg-slate-100" : "bg-white/5 border-white/10 hover:bg-white/10")}
                  >
                    <Mail className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</p>
                      <p className={cn("text-sm font-medium truncate", isLight ? "text-slate-900" : "text-foreground")}>{profileUser.email}</p>
                    </div>
                  </a>
                )}
              </div>
            </div>

            <div className={cn("px-5 py-3 border-t flex justify-end", isLight ? "border-slate-100 bg-slate-50/50" : "border-white/10 bg-white/[0.02]")}>
              <button
                onClick={() => setProfileUser(null)}
                className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}

function MsgContent({ msg, isOwn, base, onImageClick, forceWhiteText }: {
  msg: any; isOwn: boolean; base: string; onImageClick: (src: string) => void; forceWhiteText?: boolean;
}) {
  if (msg.messageType === "text") {
    // Render the bubble text as a <div>, NOT a <p>. The global rule
    // `.light p { color: #334155 }` only matches <p>, so switching the tag
    // entirely bypasses the cascade fight. We still set color inline as
    // belt-and-suspenders in case any future global selector targets <div>.
    return (
      <div
        style={forceWhiteText ? { color: "#ffffff" } : undefined}
        className="text-sm whitespace-pre-wrap break-words"
      >
        {msg.content}
      </div>
    );
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
  const { theme: _cgTheme } = useTheme();
  const isCgLight = _cgTheme === "light";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="Create channel">
          <Plus className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className={cn("sm:max-w-[400px]", isCgLight ? "bg-white border-gray-200 text-gray-900" : "glass-panel border-white/10")}>
        <DialogHeader><DialogTitle className={isCgLight ? "text-gray-900" : ""}>Create Group Channel</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className={cn("text-sm font-medium", isCgLight ? "text-gray-900" : "")}>Channel Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. project-alpha"
              className={isCgLight ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white" : ""} />
          </div>
          <div className="space-y-2">
            <label className={cn("text-sm font-medium", isCgLight ? "text-gray-900" : "")}>Add Members</label>
            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {users.map((u: any) => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                    selected.includes(u.id) ? "bg-primary/10 text-primary"
                      : isCgLight ? "text-gray-700 hover:bg-gray-50 hover:text-gray-900" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}>
                  <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[10px] font-bold shrink-0">{u.name.charAt(0)}</div>
                  {u.name}
                  <span className="ml-auto text-xs opacity-60">{u.role?.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}
              className={isCgLight ? "bg-red-600 text-white border-red-600 hover:bg-red-700 hover:text-white" : ""}>Cancel</Button>
            <Button disabled={!name.trim()} onClick={() => { onCreate(name, selected); setOpen(false); setName(""); setSelected([]); }}>
              Create Channel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditGroupModal({ room, users, currentUserId, onClose, onSave }: {
  room: any | null;
  users: any[];
  currentUserId: number;
  onClose: () => void;
  onSave: (name: string, memberIds: number[]) => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const { theme } = useTheme();
  const isLight = theme === "light";

  useEffect(() => {
    if (room) {
      setName(room.name ?? "");
      const ids: number[] = Array.isArray(room.memberUserIds) ? room.memberUserIds : [];
      // The creator is always a member but doesn't show up in the
      // toggleable list — we filter them out so they can't accidentally
      // remove themselves from their own channel.
      setSelected(ids.filter(id => id !== room.createdById && id !== currentUserId));
      setSearch("");
    }
  }, [room, currentUserId]);

  if (!room) return null;

  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const filtered = users.filter((u: any) =>
    u.id !== room.createdById && (
      !search.trim() || u.name.toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <Dialog open={!!room} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className={cn("sm:max-w-[440px]", isLight ? "bg-white border-gray-200 text-gray-900" : "glass-panel border-white/10")}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", isLight ? "text-gray-900" : "")}>
            <Pencil className="w-4 h-4 text-primary" /> Edit Channel
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Channel Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Channel name"
              className={isLight ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white" : ""} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Members</label>
              <span className="text-[11px] text-muted-foreground">{selected.length + 1} selected</span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teammates…"
                className={cn("pl-8", isLight ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white" : "")} />
            </div>
            <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
              {filtered.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">No teammates match "{search}"</div>
              )}
              {filtered.map((u: any) => {
                const isSelected = selected.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => toggle(u.id)}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      isSelected ? "bg-primary/10 text-primary"
                        : isLight ? "text-gray-700 hover:bg-gray-50 hover:text-gray-900" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white text-[11px] font-bold shrink-0">{u.name.charAt(0).toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{u.name}</div>
                      {u.role && <div className="text-[10px] opacity-60 truncate capitalize">{u.role.replace(/_/g, " ")}</div>}
                    </div>
                    {isSelected ? (
                      <UserMinus className="w-3.5 h-3.5 text-destructive shrink-0" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">You are always a member of your own channel.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}
              className={isLight ? "bg-white border-gray-200 text-gray-700 hover:bg-gray-50" : ""}>Cancel</Button>
            <Button disabled={!name.trim()} onClick={() => onSave(name.trim(), selected)}>
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
