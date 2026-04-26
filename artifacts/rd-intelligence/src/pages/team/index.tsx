import { useState, useEffect } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { PageLoader } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Mail, Building, Plus, Edit3, Trash2, X, Check, Filter, Phone, Globe, Briefcase, Tag, ShieldCheck, KeyRound, Eye, EyeOff } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const BASE = import.meta.env.BASE_URL;

const DEFAULT_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "ceo", label: "CEO" },
  { value: "hr", label: "HR" },
  { value: "head_of_department", label: "Head of Department" },
  { value: "npd_technologist", label: "NPD Technologist" },
  { value: "head_of_product_development", label: "Head of Product Development" },
  { value: "key_account_manager", label: "Key Account Manager" },
  { value: "senior_key_account_manager", label: "Senior Key Account Manager" },
  { value: "project_manager", label: "Project Manager" },
  { value: "quality_control", label: "Quality Control" },
  { value: "graphics_designer", label: "Graphics Designer" },
  { value: "scientist", label: "Scientist" },
  { value: "analyst", label: "Analyst" },
  { value: "viewer", label: "Viewer" },
];

const CUSTOM_ROLES_KEY = "zentryx_custom_roles";

function useRoles() {
  const [customRoles, setCustomRoles] = useState<{ value: string; label: string }[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_ROLES_KEY) || "[]"); } catch { return []; }
  });
  const allRoles = [...DEFAULT_ROLES, ...customRoles.filter(cr => !DEFAULT_ROLES.find(r => r.value === cr.value))];
  const addRole = (label: string) => {
    const value = label.toLowerCase().replace(/\s+/g, "_");
    const newRole = { value, label };
    const updated = [...customRoles, newRole];
    setCustomRoles(updated);
    localStorage.setItem(CUSTOM_ROLES_KEY, JSON.stringify(updated));
    return newRole;
  };
  return { roles: allRoles, addRole };
}

const ROLE_COLORS: Record<string, string> = {
  admin: "destructive", manager: "info", npd_technologist: "success",
  head_of_product_development: "warning", project_manager: "default",
  key_account_manager: "outline", senior_key_account_manager: "outline",
  ceo: "destructive", hr: "info", head_of_department: "warning",
  quality_control: "success", graphics_designer: "default",
};

const DEFAULT_DEPARTMENTS = ["NPD", "Marketing & Sales", "Account Management"];

function useDepartments() {
  const [departments, setDepartments] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const token = localStorage.getItem("rd_token");
  useEffect(() => {
    fetch(`${BASE}api/departments`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const names = data.map((d: any) => d.name);
          setDepartments([...DEFAULT_DEPARTMENTS, ...names.filter((n: string) => !DEFAULT_DEPARTMENTS.includes(n))]);
        }
      }).catch(() => {});
  }, []);
  const addDepartment = async (name: string) => {
    await fetch(`${BASE}api/departments`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    setDepartments(prev => prev.includes(name) ? prev : [...prev, name]);
  };
  return { departments, addDepartment };
}

export default function Team() {
  const { data: users, isLoading } = useListUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { departments, addDepartment } = useDepartments();
  const { roles, addRole } = useRoles();
  const [deptFilter, setDeptFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [resetPwTarget, setResetPwTarget] = useState<{ id: number; name: string } | null>(null);
  const [resetPwInput, setResetPwInput] = useState("");
  const [resetPwLoading, setResetPwLoading] = useState(false);

  const token = localStorage.getItem("rd_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const { data: me } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      return r.json();
    },
  });

  const myRole: string = me?.role || "";
  const isAdmin = myRole === "admin";
  const isPrivileged = isAdmin || ["manager", "ceo"].includes(myRole) || myRole.includes("head");
  const myId = me?.id;

  const makeAdmin = async (id: number, name: string) => {
    if (!isPrivileged) return;
    try {
      const res = await fetch(`${BASE}api/users/${id}/make-admin`, { method: "POST", headers });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed"); }
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Promoted to Admin", description: `${name} is now an Admin.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleResetPw = async () => {
    if (!resetPwTarget || resetPwInput.length < 6) return;
    setResetPwLoading(true);
    try {
      const res = await fetch(`${BASE}api/users/${resetPwTarget.id}/reset-password`, {
        method: "POST", headers, body: JSON.stringify({ newPassword: resetPwInput }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed"); }
      toast({ title: "Password reset", description: `${resetPwTarget.name}'s password has been updated.` });
      setResetPwTarget(null);
      setResetPwInput("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setResetPwLoading(false); }
  };

  const filtered = (users || []).filter(u => {
    const matchDept = deptFilter === "all" || u.department === deptFilter;
    const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchDept && matchSearch;
  });

  const canEdit = (user: any) => isAdmin || user.id === myId;

  const handleDelete = async (id: number, name: string) => {
    if (!isAdmin) { toast({ title: "Permission denied", description: "Only admins can remove members.", variant: "destructive" }); return; }
    await fetch(`${BASE}api/users/${id}`, { method: "DELETE", headers });
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    toast({ title: "Member removed", description: `${name} has been removed from the team.` });
  };

  const startEdit = (user: any) => {
    if (!canEdit(user)) { toast({ title: "Permission denied", description: "You can only edit your own profile.", variant: "destructive" }); return; }
    setEditingUser(user.id);
    setEditForm({ name: user.name, email: user.email, role: user.role, department: user.department || "", isActive: user.isActive });
  };

  const saveEdit = async (id: number) => {
    await fetch(`${BASE}api/users/${id}`, { method: "PUT", headers, body: JSON.stringify(editForm) });
    queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    setEditingUser(null);
    toast({ title: "Profile updated", description: "Changes have been saved and applied." });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" /> Team Directory
          </h1>
          <p className="text-muted-foreground mt-1">
            {(users || []).length} member{(users || []).length !== 1 ? "s" : ""} · Manage personnel, roles, and access controls.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <AddRoleModal onAdd={addRole} />
          <AddDepartmentModal onAdd={addDepartment} />
          {isAdmin && <AddMemberModal departments={departments} roles={roles} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/users"] })} />}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-xs flex-1">
          <input type="text" placeholder="Search team..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <button onClick={() => setDeptFilter("all")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", deptFilter === "all" ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
            All
          </button>
          {departments.map(d => (
            <button key={d} onClick={() => setDeptFilter(d === deptFilter ? "all" : d)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", deptFilter === d ? "bg-primary text-white border-primary" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-white/5 uppercase border-b border-white/5">
              <tr>
                <th className="px-6 py-4 font-medium">Member</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Department</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(user => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  {editingUser === user.id ? (
                    <td className="px-6 py-3" colSpan={5}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
                        <input value={editForm.name} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))}
                          className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground" placeholder="Name" />
                        <input value={editForm.email} onChange={e => setEditForm((f: any) => ({ ...f, email: e.target.value }))}
                          className="h-9 rounded-lg border border-white/10 bg-black/30 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground" placeholder="Email" />
                        <select value={editForm.role} onChange={e => setEditForm((f: any) => ({ ...f, role: e.target.value }))}
                          disabled={!isAdmin}
                          className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm focus:outline-none text-foreground disabled:opacity-50">
                          {roles.map(r => <option key={r.value} value={r.value} className="bg-card">{r.label}</option>)}
                        </select>
                        <select value={editForm.department || ""} onChange={e => setEditForm((f: any) => ({ ...f, department: e.target.value }))}
                          disabled={!isAdmin}
                          className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm focus:outline-none text-foreground disabled:opacity-50">
                          <option value="" className="bg-card">No Department</option>
                          {departments.map(d => <option key={d} value={d} className="bg-card">{d}</option>)}
                        </select>
                        {isAdmin && (
                          <select value={String(editForm.isActive)} onChange={e => setEditForm((f: any) => ({ ...f, isActive: e.target.value === "true" }))}
                            className="h-9 rounded-lg border border-white/10 bg-black/30 px-2 text-sm focus:outline-none text-foreground">
                            <option value="true" className="bg-card">Active</option>
                            <option value="false" className="bg-card">Inactive</option>
                          </select>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(user.id)} className="p-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingUser(null)} className={cn("p-1.5 rounded-lg transition-colors", isAdmin ? "bg-red-500/10 hover:bg-red-500/20 text-red-400" : "bg-white/5 hover:bg-white/10 text-muted-foreground")}><X className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-gradient-to-tr from-secondary/50 to-primary/50 flex items-center justify-center text-white font-bold border border-white/10 shrink-0">
                            {(user as any).avatar ? (
                              <img src={(user as any).avatar} alt={user.name} className="w-full h-full object-cover" />
                            ) : user.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground">{user.name}</div>
                            {(user as any).jobPosition && (
                              <div className="text-xs text-primary/80 flex items-center gap-1 mt-0.5">
                                <Briefcase className="w-3 h-3 shrink-0" /> {(user as any).jobPosition}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Mail className="w-3 h-3 shrink-0" /> {user.email}
                            </div>
                            {(user as any).phone && (
                              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3 shrink-0" /> {(user as any).phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={(ROLE_COLORS[user.role] as any) || "outline"} className="capitalize text-xs">
                          {roles.find(r => r.value === user.role)?.label || user.role.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Building className="w-4 h-4 shrink-0" /> {user.department || 'Unassigned'}
                        </div>
                        {(user as any).country && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground/70">
                            <Globe className="w-3 h-3 shrink-0" /> {(user as any).country}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-muted'}`} />
                          <span className="text-xs text-muted-foreground">{user.isActive ? 'Active' : 'Inactive'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {canEdit(user) && (
                            <button onClick={() => startEdit(user)} className="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {isPrivileged && user.role !== "admin" && user.id !== myId && (
                            <button
                              onClick={() => makeAdmin(user.id, user.name)}
                              className="p-1.5 hover:bg-amber-500/10 rounded-lg text-muted-foreground hover:text-amber-400 transition-colors"
                              title="Make Admin"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}
                          {isPrivileged && user.id !== myId && (
                            <button
                              onClick={() => { setResetPwTarget({ id: user.id, name: user.name }); setResetPwInput(""); }}
                              className="p-1.5 hover:bg-blue-500/10 rounded-lg text-muted-foreground hover:text-blue-400 transition-colors"
                              title="Reset Password"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => handleDelete(user.id, user.name)} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="Remove">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No team members found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Reset Password Modal */}
      {resetPwTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setResetPwTarget(null); }}>
          <div className="glass-panel rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><KeyRound className="w-5 h-5 text-blue-400" /></div>
              <div>
                <p className="font-semibold text-foreground">Reset Password</p>
                <p className="text-xs text-muted-foreground">Set new password for <span className="text-foreground font-medium">{resetPwTarget.name}</span></p>
              </div>
            </div>
            <ResetPwField value={resetPwInput} onChange={setResetPwInput} />
            {resetPwInput && resetPwInput.length < 6 && <p className="text-xs text-destructive">Password must be at least 6 characters</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleResetPw}
                disabled={resetPwLoading || resetPwInput.length < 6}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {resetPwLoading ? "Saving…" : "Set New Password"}
              </button>
              <button onClick={() => setResetPwTarget(null)} className="px-4 py-2.5 text-sm rounded-xl border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResetPwField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      {/* Hidden username field stops browsers from auto-filling stored credentials */}
      <input type="text" autoComplete="username" aria-hidden="true" tabIndex={-1} readOnly
        style={{ position: "absolute", opacity: 0, height: 0, width: 0, pointerEvents: "none" }} />
      <input type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)}
        placeholder="New password (min. 6 chars)" autoFocus autoComplete="new-password"
        className="w-full h-10 rounded-xl border border-white/10 bg-black/30 px-3 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
      <button type="button" onClick={() => setShow(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function AddMemberModal({ departments, roles, onSuccess }: { departments: string[]; roles: { value: string; label: string }[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "temp1234", role: "viewer", department: "", isActive: true });
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const { theme: _amTheme } = useTheme();
  const isLight = _amTheme === "light";
  const cls = cn("flex h-10 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground", isLight ? "border-gray-200 bg-white" : "border-white/10 bg-black/20");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("rd_token")}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to add member"); }
      onSuccess();
      setOpen(false);
      toast({ title: "Member added!", description: `${form.name} has been added to the team.` });
      setForm({ name: "", email: "", password: "temp1234", role: "viewer", department: "", isActive: true });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="w-4 h-4" /> Add Member</Button>
      </DialogTrigger>
      <DialogContent className={cn("sm:max-w-[500px]", isLight ? "bg-white border-gray-200 [&>button]:text-gray-900 [&>button]:opacity-100" : "glass-panel border-white/10 bg-card/95")}>
        <DialogHeader><DialogTitle className="text-xl font-display">Add Team Member</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5"><label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Full Name *</label><input required value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Jane Smith" className={cls} /></div>
            <div className="col-span-2 space-y-1.5"><label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Email Address *</label><input required type="email" value={form.email} onChange={e => setF("email", e.target.value)} placeholder="jane@company.com" className={cls} /></div>
            <div className="col-span-2 space-y-1.5"><label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Temporary Password *</label><input required type="password" value={form.password} onChange={e => setF("password", e.target.value)} placeholder="Minimum 6 characters" className={cls} /></div>
            <div className="space-y-1.5">
              <label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Role *</label>
              <select required value={form.role} onChange={e => setF("role", e.target.value)} className={cls}>
                {roles.map(r => <option key={r.value} value={r.value} className="bg-card">{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Department</label>
              <select value={form.department} onChange={e => setF("department", e.target.value)} className={cls}>
                <option value="" className="bg-card">No Department</option>
                {departments.map(d => <option key={d} value={d} className="bg-card">{d}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <label className={cn("text-sm font-medium", isLight ? "text-gray-900" : "")}>Status</label>
              <select value={String(form.isActive)} onChange={e => setF("isActive", e.target.value === "true")} className={cls}>
                <option value="true" className="bg-card">Active</option>
                <option value="false" className="bg-card">Inactive</option>
              </select>
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Adding..." : "Add Member"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddDepartmentModal({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim());
    toast({ title: "Department added!", description: name });
    setOpen(false);
    setName("");
  };

  const { theme: _deptTheme } = useTheme();
  const isDeptLight = _deptTheme === "light";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Building className="w-4 h-4" /> New Department</Button>
      </DialogTrigger>
      <DialogContent className={cn("sm:max-w-[360px]", isDeptLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
        <DialogHeader><DialogTitle>Create Department</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Quality Assurance" autoFocus className={isDeptLight ? "border-gray-200 bg-white" : ""} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddRoleModal({ onAdd }: { onAdd: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    toast({ title: "Role created!", description: `"${name.trim()}" has been added to the roles list.` });
    setOpen(false);
    setName("");
  };

  const { theme: _roleTheme } = useTheme();
  const isRoleLight = _roleTheme === "light";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Tag className="w-4 h-4" /> New Role</Button>
      </DialogTrigger>
      <DialogContent className={cn("sm:max-w-[360px]", isRoleLight ? "bg-white border-gray-200" : "glass-panel border-white/10")}>
        <DialogHeader><DialogTitle>Create New Role</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Data Scientist" autoFocus className={isRoleLight ? "border-gray-200 bg-white" : ""} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create Role</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
