import { useListNotifications, useMarkNotificationRead } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import { Bell, Check, CheckCheck, Clock, Info, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme";
import { useRouter } from "wouter";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markReadMut = useMarkNotificationRead();
  const queryClient = useQueryClient();
  const { theme } = useTheme();
  const [, navigate] = useRouter();
  const [optimisticNotifs, setOptimisticNotifs] = useState<any[]>([]);
  const isLight = theme === "light";

  const displayNotifs = optimisticNotifs.length > 0 ? optimisticNotifs : (notifications ?? []);
  const list = displayNotifs;
  const unread = list.filter(n => !n.isRead);

  // Sync optimistic updates with server data
  useEffect(() => {
    if (optimisticNotifs.length === 0 && notifications) {
      setOptimisticNotifs(notifications);
    }
  }, [notifications]);

  if (isLoading) return <PageLoader />;

  const getIcon = (type: string) => {
    switch (type) {
      case 'deadline': return <Clock className={cn("w-5 h-5", isLight ? "text-orange-600" : "text-orange-400")} />;
      case 'system':   return <AlertCircle className={cn("w-5 h-5", isLight ? "text-rose-600" : "text-destructive")} />;
      default:         return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const handleMarkRead = (id: number) => {
    // Optimistic update
    setOptimisticNotifs(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    markReadMut.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
    });
  };

  const handleNotificationClick = (notif: any) => {
    // Mark as read
    handleMarkRead(notif.id);
    // Navigate if link is available
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkAll = () => {
    // Optimistic update
    setOptimisticNotifs(prev => prev.map(n => ({ ...n, isRead: true })));
    unread.forEach(n => markReadMut.mutate({ id: n.id }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className={cn("flex items-center gap-3 border-b pb-4", isLight ? "border-slate-200" : "border-white/10")}>
        <div className={cn("p-3 rounded-xl text-primary", isLight ? "bg-primary/10" : "bg-primary/10")}>
          <Bell className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className={cn("text-2xl font-display font-bold", isLight ? "text-slate-900" : "text-foreground")}>Notifications</h1>
          <p className={cn("text-sm", isLight ? "text-slate-500" : "text-muted-foreground")}>Stay updated on your projects.</p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={handleMarkAll}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors",
              isLight
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "bg-primary/15 text-primary hover:bg-primary/25",
            )}
            title="Mark all as read"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
            <span className={cn("ml-1 text-[10px] px-1.5 py-0.5 rounded-full", isLight ? "bg-primary/20 text-primary" : "bg-primary/30 text-white")}>{unread.length}</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {list.length === 0 ? (
          <p className={cn("text-center py-10", isLight ? "text-slate-500" : "text-muted-foreground")}>You're all caught up!</p>
        ) : (
          list.map(note => (
            <button
              key={note.id}
              onClick={() => handleNotificationClick(note)}
              className={cn(
                "w-full p-4 rounded-xl flex gap-4 transition-all text-left",
                isLight
                  ? cn("bg-white border", note.isRead ? "border-slate-200" : "border-l-4 border-l-primary border-slate-200 shadow-sm hover:shadow-md")
                  : cn("glass-card", note.isRead ? "opacity-60" : "border-l-4 border-l-primary hover:bg-white/10"),
              )}
            >
              <div className="mt-1">{getIcon(note.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1 gap-3">
                  <h4 className={cn(
                    "font-semibold",
                    note.isRead
                      ? (isLight ? "text-slate-500" : "text-muted-foreground")
                      : (isLight ? "text-slate-900" : "text-foreground"),
                  )}>
                    {note.title}
                  </h4>
                  <span className={cn("text-xs whitespace-nowrap", isLight ? "text-slate-400" : "text-muted-foreground")}>
                    {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className={cn(
                  "text-sm leading-relaxed",
                  isLight ? (note.isRead ? "text-slate-500" : "text-slate-700") : "text-muted-foreground",
                )}>
                  {note.message}
                </p>
              </div>
              {!note.isRead && (
                <div
                  onClick={(e) => { e.stopPropagation(); handleMarkRead(note.id); }}
                  className={cn(
                    "p-2 rounded-lg h-fit transition-colors cursor-pointer",
                    isLight
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100"
                      : "hover:bg-white/10 text-muted-foreground hover:text-emerald-400",
                  )}
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
