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

export function MessageContextMenu({ msg, isOwn, isPinned, onDelete, onPin, onSelect, onForward, isSelected }: {
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

