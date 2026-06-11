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

export function MsgContent({ msg, isOwn, base, onImageClick, forceWhiteText }: {
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

