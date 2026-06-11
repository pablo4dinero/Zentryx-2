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

export function CreateGroupModal({ users, onCreate }: { users: any[]; onCreate: (name: string, memberIds: number[]) => void }) {
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

