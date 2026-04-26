import { useState, useEffect, useRef } from "react";
import {
  Calendar, Plus, MapPin, Clock, Users, Trash2, Edit3, Check, X,
  ChevronLeft, ChevronRight, CalendarDays, Star, Zap, BookOpen,
  GraduationCap, PartyPopper, AlertCircle, Briefcase, Coffee,
  Filter, Search
} from "lucide-react";
import { format, isSameDay, isSameMonth, isToday, isPast, isFuture, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL;

const COUNTRY_ISO: Record<string, string> = {
  "nigeria": "NG", "united states": "US", "usa": "US", "uk": "GB", "united kingdom": "GB",
  "canada": "CA", "australia": "AU", "germany": "DE", "france": "FR", "india": "IN",
  "south africa": "ZA", "kenya": "KE", "ghana": "GH", "egypt": "EG", "brazil": "BR",
  "mexico": "MX", "spain": "ES", "italy": "IT", "netherlands": "NL", "sweden": "SE",
  "norway": "NO", "denmark": "DK", "finland": "FI", "portugal": "PT", "poland": "PL",
  "switzerland": "CH", "austria": "AT", "belgium": "BE", "ireland": "IE", "new zealand": "NZ",
  "singapore": "SG", "malaysia": "MY", "indonesia": "ID", "philippines": "PH", "japan": "JP",
  "china": "CN", "south korea": "KR", "united arab emirates": "AE", "uae": "AE",
};

function getCountryCode(country: string | undefined): string {
  if (!country) return "NG";
  return COUNTRY_ISO[country.toLowerCase().trim()] || "NG";
}

async function fetchPublicHolidays(year: number, countryCode: string): Promise<{ date: string; localName: string; name: string }[]> {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const EVENT_TYPES = [
  { value: "general", label: "General", icon: CalendarDays, color: "#6c5ce7" },
  { value: "meeting", label: "Meeting", icon: Briefcase, color: "#0984e3" },
  { value: "workshop", label: "Workshop", icon: Zap, color: "#e17055" },
  { value: "review", label: "Review", icon: BookOpen, color: "#00b894" },
  { value: "celebration", label: "Celebration", icon: PartyPopper, color: "#fd79a8" },
  { value: "deadline", label: "Deadline", icon: AlertCircle, color: "#d63031" },
  { value: "training", label: "Training", icon: GraduationCap, color: "#fdcb6e" },
  { value: "conference", label: "Conference", icon: Coffee, color: "#74b9ff" },
];

const COLOR_OPTIONS = [
  "#6c5ce7", "#0984e3", "#00b894", "#e17055", "#fd79a8",
  "#d63031", "#fdcb6e", "#74b9ff", "#00cec9", "#55efc4",
];

function getEventType(type: string) {
  return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[0];
}

function useApi() {
  const h = () => ({ Authorization: `Bearer ${localStorage.getItem("rd_token")}` });
  const get = (p: string) => fetch(`${BASE}api${p}`, { headers: h() }).then(r => r.json());
  const post = (p: string, b: any) => fetch(`${BASE}api${p}`, { method: "POST", headers: { ...h(), "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
  const patch = (p: string, b: any) => fetch(`${BASE}api${p}`, { method: "PATCH", headers: { ...h(), "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
  const del = (p: string) => fetch(`${BASE}api${p}`, { method: "DELETE", headers: h() }).then(r => r.json());
  return { get, post, patch, del };
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function MiniCalendar({ events, selectedDate, onSelectDate, currentMonth, onMonthChange, holidays = [] }: {
  events: any[]; selectedDate: Date | null; onSelectDate: (d: Date) => void;
  currentMonth: Date; onMonthChange: (d: Date) => void;
  holidays?: { date: string; name: string; localName: string }[];
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);

  const getEventColors = (d: Date) =>
    [...new Set(events.filter(e => isSameDay(new Date(e.startDate), d)).map(e => e.color))].slice(0, 3);
  const getHoliday = (d: Date) => holidays.find(h => isSameDay(parseISO(h.date), d));

  return (
    <div className="glass-card rounded-2xl p-5 select-none">
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => onMonthChange(subMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-display font-bold text-foreground text-base">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button onClick={() => onMonthChange(addMonths(currentMonth, 1))}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`p-${i}`} />)}
        {days.map(day => {
          const eventColors = getEventColors(day);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const todayDay = isToday(day);
          const notCurrentMonth = !isSameMonth(day, currentMonth);
          const holiday = getHoliday(day);
          return (
            <button key={day.toISOString()} onClick={() => onSelectDate(day)}
              title={holiday ? `🎉 ${holiday.localName || holiday.name}` : undefined}
              className={`relative flex flex-col items-center justify-center h-9 w-full rounded-xl text-sm font-medium transition-all
                ${isSelected ? "bg-primary text-white shadow-lg shadow-primary/30" : todayDay ? "bg-primary/15 text-primary ring-1 ring-primary/30" : holiday ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20" : "hover:bg-white/8 text-foreground"}
                ${notCurrentMonth ? "opacity-30" : ""}
              `}>
              <span className="leading-none">{format(day, "d")}</span>
              {!isSelected && (
                <div className="flex gap-0.5 mt-0.5 items-center">
                  {holiday && <span className="text-[8px]">🎉</span>}
                  {eventColors.slice(0, 2).map((c, i) => (
                    <span key={i} className="w-1 h-1 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {holidays.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1">
            <span>🎉</span> Public holidays highlighted in amber
          </p>
        </div>
      )}

      <button onClick={() => { onSelectDate(new Date()); onMonthChange(new Date()); }}
        className="mt-2 w-full text-center text-xs text-primary hover:text-primary/80 font-medium transition-colors py-1">
        Jump to Today
      </button>
    </div>
  );
}

function EventCard({ event, users, onEdit, onDelete, compact = false }: {
  event: any; users: any[]; onEdit: (e: any) => void; onDelete: (id: number) => void; compact?: boolean;
}) {
  const typeInfo = getEventType(event.eventType);
  const Icon = typeInfo.icon;
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;
  const passed = isPast(start);
  const today = isToday(start);
  const attendees = (event.attendees || []).slice(0, 4);
  const extraCount = (event.attendees || []).length - 4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-2xl p-4 border-l-4 group hover:bg-white/[0.03] transition-all ${passed && !today ? "opacity-60" : ""}`}
      style={{ borderLeftColor: event.color }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: `${event.color}20` }}>
            <Icon className="w-5 h-5" style={{ color: event.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-foreground text-sm leading-tight">{event.title}</h3>
              {today && <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/20">Today</Badge>}
              {passed && !today && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Past</Badge>}
            </div>
            {event.description && !compact && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{event.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {format(start, "MMM d, yyyy · h:mm a")}
                {end && ` → ${format(end, "h:mm a")}`}
              </span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{event.location}
                </span>
              )}
            </div>
            {attendees.length > 0 && (
              <div className="flex items-center gap-1.5 mt-2.5">
                <Users className="w-3 h-3 text-muted-foreground" />
                <div className="flex -space-x-2">
                  {attendees.map((a: any, i: number) => (
                    <div key={a.id} title={a.name}
                      className="w-6 h-6 rounded-full bg-gradient-to-br from-secondary/60 to-primary/60 flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background">
                      {a.name.charAt(0)}
                    </div>
                  ))}
                  {extraCount > 0 && (
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-muted-foreground ring-2 ring-background">
                      +{extraCount}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">{(event.attendees || []).length} attendee{(event.attendees || []).length !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => onEdit(event)} className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(event.id)} className="p-1.5 hover:bg-destructive/15 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const EMPTY_FORM = {
  title: "", description: "", startDate: "", startTime: "09:00", endDate: "", endTime: "10:00",
  location: "", attendeeIds: [] as number[], eventType: "general", color: "#6c5ce7",
};

function EventFormModal({ open, onClose, users, onSave, initial }: {
  open: boolean; onClose: () => void; users: any[]; onSave: (d: any) => void; initial?: any;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleAttendee = (id: number) => setF("attendeeIds", form.attendeeIds.includes(id) ? form.attendeeIds.filter((x: number) => x !== id) : [...form.attendeeIds, id]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const start = new Date(initial.startDate);
      const end = initial.endDate ? new Date(initial.endDate) : null;
      setForm({
        title: initial.title || "",
        description: initial.description || "",
        startDate: format(start, "yyyy-MM-dd"),
        startTime: format(start, "HH:mm"),
        endDate: end ? format(end, "yyyy-MM-dd") : "",
        endTime: end ? format(end, "HH:mm") : "10:00",
        location: initial.location || "",
        attendeeIds: initial.attendeeIds || [],
        eventType: initial.eventType || "general",
        color: initial.color || "#6c5ce7",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.startDate) return;
    const startDate = `${form.startDate}T${form.startTime}:00`;
    const endDate = form.endDate ? `${form.endDate}T${form.endTime}:00` : null;
    onSave({ title: form.title, description: form.description || null, startDate, endDate, location: form.location || null, attendeeIds: form.attendeeIds, eventType: form.eventType, color: form.color });
  };

  const inputCls = "flex h-10 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] glass-panel border-white/10 bg-card/95 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{initial ? "Edit Event" : "Create New Event"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Event Title *</label>
            <input required value={form.title} onChange={e => setF("title", e.target.value)}
              placeholder="e.g. Q2 Product Review" className={inputCls} autoFocus />
          </div>

          {/* Type + Color row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Event Type</label>
              <select value={form.eventType} onChange={e => { setF("eventType", e.target.value); setF("color", getEventType(e.target.value).color); }}
                className={inputCls}>
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value} className="bg-card">{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Colour</label>
              <div className="flex flex-wrap gap-2 items-center pt-1">
                {COLOR_OPTIONS.map(c => (
                  <button key={c} type="button" onClick={() => setF("color", c)}
                    className={`w-6 h-6 rounded-full transition-all ring-offset-2 ring-offset-card ${form.color === c ? "ring-2 ring-white scale-110" : "hover:scale-110"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* Date/Time row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Start Date *</label>
              <input required type="date" value={form.startDate} onChange={e => setF("startDate", e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Start Time</label>
              <input type="time" value={form.startTime} onChange={e => setF("startTime", e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End Date</label>
              <input type="date" value={form.endDate} onChange={e => setF("endDate", e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">End Time</label>
              <input type="time" value={form.endTime} onChange={e => setF("endTime", e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />Location</label>
            <input value={form.location} onChange={e => setF("location", e.target.value)}
              placeholder="Conference Room A, Zoom link, etc." className={inputCls} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <textarea value={form.description} onChange={e => setF("description", e.target.value)}
              placeholder="What's this event about?" rows={3}
              className="flex w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground resize-none" />
          </div>

          {/* Attendees */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Attendees ({form.attendeeIds.length} selected)</label>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar pr-1">
              {users.map(u => (
                <button key={u.id} type="button" onClick={() => toggleAttendee(u.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition-all ${form.attendeeIds.includes(u.id) ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"}`}>
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center font-bold text-[9px]">{u.name.charAt(0)}</span>
                  {u.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="gap-2" disabled={!form.title.trim() || !form.startDate}>
              <CalendarDays className="w-4 h-4" />
              {initial ? "Save Changes" : "Create Event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const api = useApi();
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [tab, setTab] = useState<"upcoming" | "today" | "past" | "all">("upcoming");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [searchQ, setSearchQ] = useState("");
  const [holidays, setHolidays] = useState<{ date: string; name: string; localName: string }[]>([]);
  const [holidayCountry, setHolidayCountry] = useState("NG");

  useEffect(() => {
    const token = localStorage.getItem("rd_token");
    Promise.all([
      api.get("/events"),
      api.get("/users"),
      fetch(`${BASE}api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([evts, usrs, me]) => {
      setEvents(Array.isArray(evts) ? evts : []);
      setUsers(Array.isArray(usrs) ? usrs : []);
      const code = getCountryCode(me?.country);
      setHolidayCountry(code);
      const year = new Date().getFullYear();
      fetchPublicHolidays(year, code).then(h => setHolidays(h));
    }).finally(() => setLoading(false));
  }, []);

  const refresh = () => api.get("/events").then(d => setEvents(Array.isArray(d) ? d : []));

  const handleCreate = async (data: any) => {
    const ev = await api.post("/events", data);
    if (ev?.id) {
      await refresh();
      setModalOpen(false);
      toast({ title: "Event created!" });
    }
  };

  const handleEdit = async (data: any) => {
    await api.patch(`/events/${editingEvent.id}`, data);
    await refresh();
    setEditingEvent(null);
    toast({ title: "Event updated" });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this event?")) return;
    await api.del(`/events/${id}`);
    setEvents(prev => prev.filter(e => e.id !== id));
    toast({ title: "Event deleted" });
  };

  const now = new Date();
  const today = events.filter(e => isToday(new Date(e.startDate)));
  const upcoming = events.filter(e => isFuture(new Date(e.startDate)) && !isToday(new Date(e.startDate)));
  const past = events.filter(e => isPast(new Date(e.startDate)) && !isToday(new Date(e.startDate)));

  const dayEvents = selectedDate ? events.filter(e => isSameDay(new Date(e.startDate), selectedDate)) : [];

  const filterBySearch = (list: any[]) => searchQ.trim()
    ? list.filter(e => e.title.toLowerCase().includes(searchQ.toLowerCase()) || (e.description || "").toLowerCase().includes(searchQ.toLowerCase()) || (e.location || "").toLowerCase().includes(searchQ.toLowerCase()))
    : list;

  const TABS = [
    { id: "upcoming", label: "Upcoming", count: upcoming.length, color: "text-blue-400" },
    { id: "today", label: "Today", count: today.length, color: "text-green-400" },
    { id: "past", label: "Past", count: past.length, color: "text-muted-foreground" },
    { id: "all", label: "All Events", count: events.length, color: "text-primary" },
  ];

  const currentList = filterBySearch(tab === "upcoming" ? upcoming : tab === "today" ? today : tab === "past" ? past : events);

  const upcomingThisMonth = events.filter(e => isSameMonth(new Date(e.startDate), currentMonth) && isFuture(new Date(e.startDate)));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Events</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {upcoming.length} upcoming · {today.length} today · {past.length} past
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditingEvent(null); setModalOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" /> New Event
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
        {/* Left: Calendar + mini upcoming */}
        <div className="space-y-4">
          <MiniCalendar
            events={events}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            currentMonth={currentMonth}
            onMonthChange={setCurrentMonth}
            holidays={holidays}
          />

          {/* Public holidays in this month */}
          {(() => {
            const monthHols = holidays.filter(h => {
              const d = parseISO(h.date);
              return d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth();
            });
            if (!monthHols.length) return null;
            return (
              <div className="glass-card rounded-2xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  🎉 Public Holidays ({holidayCountry})
                </p>
                <div className="space-y-2">
                  {monthHols.map(h => (
                    <div key={h.date} className="flex items-start gap-2 text-xs">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-400 font-bold mt-0.5">
                        {parseISO(h.date).getDate()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{h.localName || h.name}</p>
                        {h.localName !== h.name && <p className="text-[10px] text-muted-foreground truncate">{h.name}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Selected day events */}
          {selectedDate && (
            <div className="glass-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {isToday(selectedDate) ? "Today" : format(selectedDate, "EEEE, MMM d")}
                </h3>
                {dayEvents.length > 0 && (
                  <span className="text-xs text-muted-foreground">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
                )}
              </div>
              {dayEvents.length === 0 ? (
                <div className="text-center py-6">
                  <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground opacity-20 mb-2" />
                  <p className="text-xs text-muted-foreground">No events this day</p>
                  <button onClick={() => setModalOpen(true)}
                    className="mt-2 text-xs text-primary hover:underline">+ Add one</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map(ev => {
                    const typeInfo = getEventType(ev.eventType);
                    const Icon = typeInfo.icon;
                    return (
                      <div key={ev.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/8 transition-colors group"
                        style={{ borderLeftColor: ev.color, borderLeftWidth: 3 }}>
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ev.color}20` }}>
                          <Icon className="w-3.5 h-3.5" style={{ color: ev.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{ev.title}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(ev.startDate), "h:mm a")}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditingEvent(ev)} className="p-1 text-muted-foreground hover:text-foreground"><Edit3 className="w-3 h-3" /></button>
                          <button onClick={() => handleDelete(ev.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Type Legend */}
          <div className="glass-card rounded-2xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Event Types</p>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map(t => {
                const Icon = t.icon;
                const count = events.filter(e => e.eventType === t.value).length;
                if (count === 0) return null;
                return (
                  <div key={t.value} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.color}20` }}>
                      <Icon className="w-3 h-3" style={{ color: t.color }} />
                    </div>
                    <span className="capitalize truncate">{t.label}</span>
                    <span className="ml-auto text-[10px] bg-white/5 rounded-full px-1.5">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Events list */}
        <div className="space-y-4 min-w-0">
          {/* Tabs + Search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex p-1 bg-white/5 rounded-xl gap-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${tab === t.id ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                  {t.count > 0 && <span className={`text-[10px] font-bold ${tab === t.id ? "text-white/70" : t.color}`}>{t.count}</span>}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-32">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search events..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>

          {/* Events list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="glass-card rounded-2xl h-28 animate-pulse" />)}
            </div>
          ) : currentList.length === 0 ? (
            <div className="glass-card rounded-2xl p-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-primary opacity-60" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {searchQ ? "No matching events" : tab === "upcoming" ? "No upcoming events" : tab === "today" ? "Nothing scheduled today" : tab === "past" ? "No past events" : "No events yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {searchQ ? "Try a different search term" : "Create your first event to get started"}
              </p>
              {!searchQ && (
                <Button onClick={() => setModalOpen(true)} size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> Create Event
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {currentList.map((ev, i) => (
                  <EventCard key={ev.id} event={ev} users={users} onEdit={setEditingEvent} onDelete={handleDelete} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Create modal */}
      <EventFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        users={users}
        onSave={handleCreate}
      />

      {/* Edit modal */}
      <EventFormModal
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        users={users}
        onSave={handleEdit}
        initial={editingEvent}
      />
    </div>
  );
}
