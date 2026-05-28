import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser } from "@/api-client";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Camera, User, Mail, Phone, Globe, Building2, Briefcase, Lock, Save, X, Eye, EyeOff, Shield, KeyRound, CheckCircle, Smartphone, RefreshCw, Copy, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const BASE = import.meta.env.BASE_URL;

const COUNTRIES = [
  "Nigeria", "South Africa", "Kenya", "Ghana", "Ethiopia", "Tanzania", "Uganda",
  "United Kingdom", "United States", "Canada", "Australia", "Germany", "France",
  "India", "China", "Brazil", "Mexico", "UAE", "Saudi Arabia", "Other"
];

const DEPARTMENTS = [
  "NPD", "Marketing & Sales", "Account Management", "Finance", "Procurement",
  "Quality Control", "Operations", "Research & Development", "Human Resources", "IT"
];

const DEFAULT_ROLE_LABELS = [
  "Admin", "Manager", "CEO", "HR", "Head of Department",
  "NPD Technologist", "Head of Product Development",
  "Key Account Manager", "Senior Key Account Manager",
  "Project Manager", "Quality Control", "Graphics Designer",
  "Scientist", "Analyst", "Viewer",
];

function getJobTitles(): string[] {
  try {
    const custom = JSON.parse(localStorage.getItem("zentryx_custom_roles") || "[]");
    return [...DEFAULT_ROLE_LABELS, ...custom.map((r: any) => r.label).filter((l: string) => !DEFAULT_ROLE_LABELS.includes(l))];
  } catch { return DEFAULT_ROLE_LABELS; }
}

function canManageUsers(role: string) {
  return ["admin", "manager", "ceo"].includes(role) || role.includes("head");
}

function AvatarUploader({ avatar, name, onChange }: { avatar: string | null; name: string; onChange: (v: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const colors = ["from-violet-500 to-purple-600", "from-blue-500 to-cyan-600", "from-emerald-500 to-teal-600", "from-rose-500 to-pink-600", "from-amber-500 to-orange-600"];
  const gradient = colors[name ? name.charCodeAt(0) % colors.length : 0];
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
        <div className={`w-24 h-24 rounded-2xl overflow-hidden shadow-xl ring-4 ring-white/10 ${!avatar ? `bg-gradient-to-br ${gradient}` : ""} flex items-center justify-center`}>
          {avatar ? <img src={avatar} alt={name} className="w-full h-full object-cover" /> : <span className="text-white font-bold text-3xl">{initials}</span>}
        </div>
        <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera className="w-6 h-6 text-white" />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-primary hover:text-primary/80 underline">Upload photo</button>
        {avatar && <button type="button" onClick={() => onChange(null)} className="text-xs text-destructive hover:text-destructive/80 underline">Remove</button>}
      </div>
      <p className="text-[11px] text-muted-foreground">JPG, PNG — max 2MB</p>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}

function MfaSection({ isLight }: { isLight: boolean }) {
  const { toast } = useToast();
  type Mode = "idle" | "enrolling-scan" | "enrolling-backup" | "regenerated";
  const [status, setStatus] = useState<{
    enrolled: boolean;
    mandatory: boolean;
    enrolledAt: string | null;
    remainingBackupCodes: number;
  } | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [issuedCodes, setIssuedCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "start" | "verify" | "regen">("");
  const [error, setError] = useState("");
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}api/mfa/status`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch { /* silent */ }
  }, []);
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const startEnroll = async () => {
    setError("");
    setBusy("start");
    try {
      const res = await fetch(`${BASE}api/mfa/enroll/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to start enrollment");
      setQrCode(data.qrCode);
      setSecret(data.manualEntrySecret);
      setVerifyCode("");
      setMode("enrolling-scan");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const verifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy("verify");
    try {
      const res = await fetch(`${BASE}api/mfa/enroll/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}`,
        },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Code didn't match");
      setIssuedCodes(data.backupCodes || []);
      setMode("enrolling-backup");
      toast({ title: "Two-factor enabled", description: "Save your backup codes — they will not be shown again." });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const regenerateCodes = async () => {
    setError("");
    setBusy("regen");
    try {
      const res = await fetch(`${BASE}api/mfa/enroll/regenerate-backup-codes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("rd_token") || ""}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to regenerate codes");
      setIssuedCodes(data.backupCodes || []);
      setMode("regenerated");
      setConfirmRegen(false);
      toast({ title: "New backup codes generated", description: "Old codes are now invalid. Save the new set." });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const finishAndReset = async () => {
    setQrCode("");
    setSecret("");
    setVerifyCode("");
    setIssuedCodes([]);
    setMode("idle");
    setError("");
    await fetchStatus();
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(issuedCodes.join("\n")).then(() => {
      toast({ title: "Copied", description: "Backup codes copied to clipboard." });
    });
  };

  const codeInputCls = cn(
    "w-full h-14 rounded-xl border px-4 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40",
    isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground",
  );

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      {/* Header */}
      <div className={cn("flex items-center gap-2 border-b pb-4", isLight ? "border-gray-200" : "border-white/5")}>
        <div className="p-2 rounded-lg bg-emerald-500/10">
          <Smartphone className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground text-sm">Two-Factor Authentication (TOTP)</p>
          <p className="text-xs text-muted-foreground">
            A 6-digit code from your authenticator app, in addition to your password.
          </p>
        </div>
        {status?.enrolled && (
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full",
            isLight ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30")}>
            <CheckCircle className="w-3 h-3" /> Enabled
          </span>
        )}
        {status && !status.enrolled && status.mandatory && (
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full",
            isLight ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-amber-500/15 text-amber-400 border border-amber-500/30")}>
            <AlertTriangle className="w-3 h-3" /> Required for your role
          </span>
        )}
        {status && !status.enrolled && !status.mandatory && (
          <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full",
            isLight ? "bg-gray-100 text-gray-600 border border-gray-200" : "bg-white/5 text-muted-foreground border border-white/10")}>
            Optional — recommended
          </span>
        )}
      </div>

      {/* ── Idle state ──────────────────────────────────────────────── */}
      {mode === "idle" && status && !status.enrolled && (
        <div className="space-y-4">
          <div className={cn("rounded-xl border p-4 text-xs space-y-2", isLight ? "border-gray-200 bg-gray-50 text-gray-700" : "border-white/10 bg-white/5 text-muted-foreground")}>
            <p className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>What you'll need:</p>
            <p>• An authenticator app on your phone — Microsoft Authenticator, Google Authenticator, Authy, 1Password, or Bitwarden all work.</p>
            <p>• Your phone unlocked, with the app open or ready to install.</p>
          </div>
          <button
            onClick={startEnroll}
            disabled={busy === "start"}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-semibold hover:bg-emerald-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
            {busy === "start" ? "Generating QR…" : "Set up authenticator app"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {mode === "idle" && status?.enrolled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className={cn("rounded-xl border p-4", isLight ? "border-gray-200 bg-gray-50" : "border-white/10 bg-white/5")}>
              <p className="text-xs text-muted-foreground">Enrolled</p>
              <p className={cn("text-sm font-semibold mt-1", isLight ? "text-gray-900" : "text-foreground")}>
                {status.enrolledAt ? new Date(status.enrolledAt).toLocaleDateString() : "—"}
              </p>
            </div>
            <div className={cn("rounded-xl border p-4", isLight ? "border-gray-200 bg-gray-50" : "border-white/10 bg-white/5")}>
              <p className="text-xs text-muted-foreground">Backup codes remaining</p>
              <p className={cn("text-sm font-semibold mt-1", status.remainingBackupCodes <= 2
                ? "text-amber-500"
                : isLight ? "text-gray-900" : "text-foreground")}>
                {status.remainingBackupCodes} of 10
                {status.remainingBackupCodes <= 2 && (
                  <span className="block text-[10px] font-normal mt-0.5 text-amber-500">Regenerate soon</span>
                )}
              </p>
            </div>
          </div>

          {!confirmRegen ? (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setConfirmRegen(true)}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors",
                  isLight ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate backup codes
              </button>
              <button
                onClick={startEnroll}
                disabled={busy === "start"}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors disabled:opacity-40",
                  isLight ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5")}
              >
                <Smartphone className="w-3.5 h-3.5" /> Re-enrol new device
              </button>
            </div>
          ) : (
            <div className={cn("rounded-xl border p-4 space-y-3", isLight ? "border-amber-200 bg-amber-50" : "border-amber-500/30 bg-amber-500/5")}>
              <p className={cn("text-sm font-semibold flex items-center gap-2", isLight ? "text-amber-800" : "text-amber-300")}>
                <AlertTriangle className="w-4 h-4" /> Regenerate backup codes?
              </p>
              <p className={cn("text-xs", isLight ? "text-amber-700" : "text-amber-300/80")}>
                Your current 10 backup codes will be invalidated immediately. Make sure you have access to your authenticator app
                before continuing — if you lose it and the new codes you'll need an admin emergency reset.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setConfirmRegen(false)}
                  className={cn("px-4 py-1.5 rounded-lg text-xs font-medium", isLight ? "text-gray-600 hover:bg-gray-100" : "text-muted-foreground hover:bg-white/5")}
                >
                  Cancel
                </button>
                <button
                  onClick={regenerateCodes}
                  disabled={busy === "regen"}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === "regen" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Yes, regenerate"}
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* ── Enrolling: scan QR + verify ──────────────────────────────── */}
      {mode === "enrolling-scan" && (
        <form onSubmit={verifyEnroll} className="space-y-4">
          <div>
            <p className={cn("text-sm font-semibold mb-1", isLight ? "text-gray-900" : "text-foreground")}>Scan this QR code</p>
            <p className={cn("text-xs", isLight ? "text-gray-500" : "text-muted-foreground")}>
              In your authenticator app, tap "Add account" → "Scan QR code" and point your camera at the image below.
            </p>
          </div>
          <div className="flex justify-center">
            <img src={qrCode} alt="MFA QR code" className="w-48 h-48 rounded-xl border border-white/10 bg-white p-2" />
          </div>
          <button
            type="button"
            onClick={() => setShowSecret(s => !s)}
            className={cn("text-xs", isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground")}
          >
            {showSecret ? "Hide" : "Can't scan?"} Enter the secret manually
          </button>
          {showSecret && (
            <code className={cn("block p-3 rounded font-mono text-[11px] break-all select-all",
              isLight ? "bg-gray-100 text-gray-900" : "bg-white/5 text-foreground")}>{secret}</code>
          )}
          <div>
            <label className={cn("text-xs font-medium mb-1 block", isLight ? "text-gray-700" : "text-muted-foreground")}>
              Enter the 6-digit code from your app to confirm
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123 456"
              className={codeInputCls}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode("idle"); setError(""); }}
              className={cn("flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border", isLight ? "border-gray-200 text-gray-600 hover:text-gray-900" : "border-white/10 text-muted-foreground hover:text-foreground")}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy === "verify" || verifyCode.length !== 6}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "verify" ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Confirm and enable"}
            </button>
          </div>
        </form>
      )}

      {/* ── Backup codes display (after enroll or regenerate) ────────── */}
      {(mode === "enrolling-backup" || mode === "regenerated") && (
        <div className="space-y-4">
          <div>
            <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>
              {mode === "regenerated" ? "Your new backup codes" : "Save your backup codes"}
            </p>
            <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
              Use these if you lose your phone or can't open your authenticator. Each works <strong>once</strong>.
              Print them, save them in your password manager, or screenshot them <strong>now</strong> — they will not be shown again.
            </p>
          </div>
          <div className={cn("rounded-xl border p-4 grid grid-cols-2 gap-2 font-mono text-sm",
            isLight ? "border-gray-200 bg-gray-50 text-gray-900" : "border-white/10 bg-white/5 text-foreground")}>
            {issuedCodes.map((c) => <code key={c} className="select-all">{c}</code>)}
          </div>
          <button
            type="button"
            onClick={copyCodes}
            className={cn("w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border", isLight ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}
          >
            <Copy className="w-3.5 h-3.5" /> Copy all to clipboard
          </button>
          <button
            onClick={finishAndReset}
            className="w-full px-4 py-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-sm font-semibold hover:bg-emerald-500/25"
          >
            I've saved them
          </button>
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{icon} {label}</label>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { data: currentUser, isLoading } = useGetCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const token = localStorage.getItem("rd_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const inputCls = cn(
    "w-full h-10 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground",
    isLight ? "border-gray-200 bg-white text-gray-900" : "border-white/10 bg-black/30 text-foreground"
  );
  const selectCls = inputCls + " cursor-pointer";

  const [form, setForm] = useState({ name: "", department: "", jobPosition: "", country: "", avatar: null as string | null });
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [dirty, setDirty] = useState(false);
  const jobTitles = getJobTitles();

  // Phone change OTP flow
  const [phoneMode, setPhoneMode] = useState<"view" | "edit" | "otp">("view");
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [devPhoneOtp, setDevPhoneOtp] = useState("");

  useEffect(() => {
    if (currentUser) {
      const u = currentUser as any;
      setForm({ name: u.name || "", department: u.department || "", jobPosition: u.jobPosition || "", country: u.country || "", avatar: u.avatar || null });
      setNewPhone(u.phone || "");
    }
  }, [currentUser]);

  const setF = (field: string, value: any) => {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/users/me`, {
        method: "PUT", headers,
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDirty(false);
      toast({ title: "Profile updated", description: "Your changes have been saved." });
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleCancel = () => {
    if (currentUser) {
      const u = currentUser as any;
      setForm({ name: u.name || "", department: u.department || "", jobPosition: u.jobPosition || "", country: u.country || "", avatar: u.avatar || null });
      setDirty(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!pwForm.current) { toast({ title: "Enter your current password", variant: "destructive" }); return; }
    if (pwForm.next.length < 6) { toast({ title: "New password must be at least 6 characters", variant: "destructive" }); return; }
    if (pwForm.next !== pwForm.confirm) { toast({ title: "New passwords do not match", variant: "destructive" }); return; }
    setSavingPw(true);
    try {
      const res = await fetch(`${BASE}api/users/me`, {
        method: "PUT", headers,
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.message || "Failed to change password", variant: "destructive" }); return; }
      setPwForm({ current: "", next: "", confirm: "" });
      toast({ title: "Password changed", description: "Your password has been updated." });
    } catch {
      toast({ title: "Failed to change password", variant: "destructive" });
    } finally { setSavingPw(false); }
  };

  // Phone OTP flow
  const requestPhoneOtp = async () => {
    if (!newPhone.trim()) { toast({ title: "Enter a phone number", variant: "destructive" }); return; }
    setPhoneSending(true);
    try {
      const res = await fetch(`${BASE}api/users/me/request-phone-otp`, {
        method: "POST", headers, body: JSON.stringify({ newPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      if (data.devMode && data.code) {
        setDevPhoneOtp(data.code);
        toast({ title: "Dev mode — OTP shown below" });
      } else {
        toast({ title: "Code sent", description: "Check your email for the verification code." });
      }
      setPhoneMode("otp");
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setPhoneSending(false); }
  };

  const confirmPhoneOtp = async () => {
    if (phoneOtp.length !== 6) { toast({ title: "Enter the 6-digit code", variant: "destructive" }); return; }
    setPhoneSaving(true);
    try {
      const res = await fetch(`${BASE}api/users/me/confirm-phone`, {
        method: "POST", headers, body: JSON.stringify({ otpCode: phoneOtp, newPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Phone number updated" });
      setPhoneMode("view");
      setPhoneOtp("");
      setDevPhoneOtp("");
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setPhoneSaving(false); }
  };

  if (isLoading) return <PageLoader />;
  if (!currentUser) return null;
  const u = currentUser as any;
  const isPrivileged = canManageUsers(u.role || "");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <User className="w-8 h-8 text-primary" /> My Profile
        </h1>
        <p className="text-muted-foreground mt-1">Manage your personal information and account settings.</p>
      </div>

      {/* ── Info card ─────────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6 space-y-6">
        <div className={`flex flex-col sm:flex-row gap-6 items-start sm:items-center border-b pb-6 ${isLight ? "border-gray-200" : "border-white/5"}`}>
          <AvatarUploader avatar={form.avatar} name={form.name} onChange={v => setF("avatar", v)} />
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-foreground">{u.name}</p>
            <p className="text-sm text-muted-foreground capitalize mt-0.5">{u.role?.replace(/_/g, " ")}</p>
            <p className="text-xs text-muted-foreground mt-1">{u.email}</p>
            <div className={cn("mt-3 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium", isLight ? "bg-emerald-50 text-emerald-600" : "bg-green-500/10 text-green-400")}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> Active Account
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FieldRow label="Full Name" icon={<User className="w-3.5 h-3.5" />}>
            <input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="Your full name" className={inputCls} />
          </FieldRow>

          <FieldRow label="Email Address" icon={<Mail className="w-3.5 h-3.5" />}>
            <input value={u.email} readOnly className={inputCls + " opacity-50 cursor-not-allowed"} />
          </FieldRow>

          <FieldRow label="Department" icon={<Building2 className="w-3.5 h-3.5" />}>
            <select value={form.department} onChange={e => setF("department", e.target.value)} className={selectCls} style={{ colorScheme: isLight ? "light" : "dark" }}>
              <option value="">Select department…</option>
              {DEPARTMENTS.map(d => <option key={d} value={d} className={isLight ? "bg-white text-gray-900" : "bg-card"}>{d}</option>)}
            </select>
          </FieldRow>

          <FieldRow label="Job Position / Title" icon={<Briefcase className="w-3.5 h-3.5" />}>
            {isPrivileged ? (
              <select value={form.jobPosition} onChange={e => setF("jobPosition", e.target.value)} className={selectCls} style={{ colorScheme: isLight ? "light" : "dark" }}>
                <option value="">Select job title…</option>
                {form.jobPosition && !jobTitles.includes(form.jobPosition) && (
                  <option value={form.jobPosition}>{form.jobPosition}</option>
                )}
                {jobTitles.map(t => <option key={t} value={t} className={isLight ? "bg-white text-gray-900" : "bg-card"}>{t}</option>)}
              </select>
            ) : (
              <input value={form.jobPosition || "—"} readOnly className={inputCls + " opacity-60 cursor-not-allowed"} title="Only managers and above can change job position" />
            )}
          </FieldRow>

          <FieldRow label="Country" icon={<Globe className="w-3.5 h-3.5" />}>
            <select value={form.country} onChange={e => setF("country", e.target.value)} className={selectCls} style={{ colorScheme: isLight ? "light" : "dark" }}>
              <option value="">Select country…</option>
              {COUNTRIES.map(c => <option key={c} value={c} className={isLight ? "bg-white text-gray-900" : "bg-card"}>{c}</option>)}
            </select>
          </FieldRow>

          {/* Phone — OTP-gated change */}
          <FieldRow label="Phone Number" icon={<Phone className="w-3.5 h-3.5" />}>
            {phoneMode === "view" && (
              <div className="flex gap-2">
                <input value={u.phone || ""} readOnly className={inputCls + " flex-1 opacity-70 cursor-not-allowed"} placeholder="Not set" />
                <button onClick={() => { setNewPhone(u.phone || ""); setPhoneMode("edit"); }} className="px-3 py-1 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors whitespace-nowrap">
                  Change
                </button>
              </div>
            )}
            {phoneMode === "edit" && (
              <div className="space-y-2">
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} type="tel" placeholder="+234 xxx xxxx xxxx" className={inputCls} autoFocus />
                <div className="flex gap-2">
                  <button onClick={requestPhoneOtp} disabled={phoneSending || !newPhone.trim()} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {phoneSending ? "Sending…" : "Send Verification Code"}
                  </button>
                  <button onClick={() => setPhoneMode("view")} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {phoneMode === "otp" && (
              <div className="space-y-2">
                {devPhoneOtp && (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-[10px] text-amber-300">Dev OTP:</p>
                      <p className="font-mono font-bold text-lg tracking-[0.3em] text-amber-200">{devPhoneOtp}</p>
                    </div>
                  </div>
                )}
                <input
                  value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6} placeholder="000000" autoFocus
                  className={inputCls + " text-center text-xl font-mono tracking-[0.5em]"}
                />
                <div className="flex gap-2">
                  <button onClick={confirmPhoneOtp} disabled={phoneSaving || phoneOtp.length !== 6} className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" /> {phoneSaving ? "Confirming…" : "Confirm"}
                  </button>
                  <button onClick={() => { setPhoneMode("view"); setPhoneOtp(""); setDevPhoneOtp(""); }} className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </FieldRow>
        </div>

        {dirty && (
          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Changes"}
            </button>
            <button onClick={handleCancel} disabled={saving} className={`flex items-center gap-2 px-5 py-2.5 border rounded-xl text-sm font-medium transition-colors ${isLight ? "border-gray-200 text-gray-600 hover:text-gray-900" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Change Password ────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className={`flex items-center gap-2 border-b pb-4 ${isLight ? "border-gray-200" : "border-white/5"}`}>
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Shield className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm">Change Password</p>
            <p className="text-xs text-muted-foreground">Choose a strong password to keep your account secure.</p>
          </div>
        </div>

        <div className="space-y-4">
          <FieldRow label="Current Password" icon={<Lock className="w-3.5 h-3.5" />}>
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} placeholder="Enter current password" className={inputCls + " pr-10"} />
              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </FieldRow>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="New Password" icon={<Lock className="w-3.5 h-3.5" />}>
              <div className="relative">
                <input type={showNext ? "text" : "password"} value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} placeholder="Min. 6 characters" className={inputCls + " pr-10"} />
                <button type="button" onClick={() => setShowNext(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </FieldRow>

            <FieldRow label="Confirm New Password" icon={<Lock className="w-3.5 h-3.5" />}>
              <div className="relative">
                <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat new password" className={cn(inputCls, pwForm.confirm && pwForm.next !== pwForm.confirm ? "border-destructive/50" : "")} />
                {pwForm.confirm && pwForm.next !== pwForm.confirm && <p className="text-[11px] text-destructive mt-1">Passwords do not match</p>}
              </div>
            </FieldRow>
          </div>

          <button onClick={handlePasswordChange} disabled={savingPw || !pwForm.current || !pwForm.next || pwForm.next !== pwForm.confirm}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-sm font-semibold hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Shield className="w-4 h-4" /> {savingPw ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>

      {/* ── Two-Factor Authentication (TOTP) ───────────────────────────────── */}
      <MfaSection isLight={isLight} />
    </div>
  );
}
