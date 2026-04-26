import { useListNotifications, useMarkNotificationRead } from "@workspace/api-client-react";
import { PageLoader } from "@/components/ui/spinner";
import { Bell, Check, Clock, Info, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markReadMut = useMarkNotificationRead();
  const queryClient = useQueryClient();

  if (isLoading) return <PageLoader />;

  const getIcon = (type: string) => {
    switch (type) {
      case 'deadline': return <Clock className="w-5 h-5 text-orange-400" />;
      case 'system': return <AlertCircle className="w-5 h-5 text-destructive" />;
      default: return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const handleMarkRead = (id: number) => {
    markReadMut.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] })
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3 border-b border-white/10 pb-4">
        <div className="p-3 bg-primary/10 rounded-xl text-primary">
          <Bell className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground">Stay updated on your projects.</p>
        </div>
      </div>

      <div className="space-y-3">
        {notifications?.length === 0 ? (
          <p className="text-muted-foreground text-center py-10">You're all caught up!</p>
        ) : (
          notifications?.map(note => (
            <div 
              key={note.id} 
              className={`glass-card p-4 rounded-xl flex gap-4 transition-all ${note.isRead ? 'opacity-60 grayscale-[50%]' : 'border-l-4 border-l-primary'}`}
            >
              <div className="mt-1">
                {getIcon(note.type)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h4 className={`font-semibold ${note.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>{note.title}</h4>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                    {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{note.message}</p>
              </div>
              {!note.isRead && (
                <button 
                  onClick={() => handleMarkRead(note.id)}
                  className="p-2 hover:bg-white/10 rounded-lg h-fit text-muted-foreground hover:text-green-400 transition-colors"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
