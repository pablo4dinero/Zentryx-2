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

export function EditGroupModal({ room, users, currentUserId, onClose, onSave }: {
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
