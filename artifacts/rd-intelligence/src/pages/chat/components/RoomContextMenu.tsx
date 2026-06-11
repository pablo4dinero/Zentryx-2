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

export function RoomContextMenu({ room, isPinned, onPin, onDelete, onLeave, onEdit, isCreator }: {
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

