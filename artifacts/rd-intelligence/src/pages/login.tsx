import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Lock, Mail, User, AlertCircle, Phone, Eye, EyeOff, ArrowLeft, KeyRound, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const BASE = import.meta.env.BASE_URL;

type Mode = "login" | "signup" | "signup-otp" | "forgot" | "forgot-otp" | "reset";

async function apiFetch(path: string, body: object) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "Request failed");
  return data;
}

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();
  const { setToken } = useAuthStore();
  const { toast } = useToast();
  const { theme } = useTheme();
  const isLight = theme === "light";
  const inputLightCls = isLight ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:bg-white" : "";
  const iconCls = isLight ? "text-gray-400" : "text-muted-foreground";

  const canvasRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const posRef = useRef({ x: 50, y: 50 });
  const velRef = useRef({ x: 2, y: 2 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const logo = logoRef.current;
    const canvas = canvasRef.current;
    if (!logo || !canvas) return;

    const animate = () => {
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const lw = logo.offsetWidth;
      const lh = logo.offsetHeight;
      if (lw > 0 && lh > 0 && cw > 0 && ch > 0) {
        posRef.current.x += velRef.current.x;
        posRef.current.y += velRef.current.y;
        if (posRef.current.x <= 0) { posRef.current.x = 0; velRef.current.x = Math.abs(velRef.current.x); }
        if (posRef.current.y <= 0) { posRef.current.y = 0; velRef.current.y = Math.abs(velRef.current.y); }
        if (posRef.current.x >= cw - lw) { posRef.current.x = cw - lw; velRef.current.x = -Math.abs(velRef.current.x); }
        if (posRef.current.y >= ch - lh) { posRef.current.y = ch - lh; velRef.current.y = -Math.abs(velRef.current.y); }
        logo.style.left = posRef.current.x + "px";
        logo.style.top = posRef.current.y + "px";
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // signup fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");

  // forgot password fields
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [devForgotOtp, setDevForgotOtp] = useState("");

  const clearError = () => setError("");

  const goMode = (m: Mode) => { setMode(m); setError(""); };

  // ─── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/login", { email, password });
      setToken(data.token);
      toast({ title: "Welcome back!", description: `Signed in as ${data.user.name}` });
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Signup step 1 — send OTP ────────────────────────────────────────────
  const handleSignupSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!name.trim()) { setError("Full name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPw) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/send-otp", { email, purpose: "signup" });
      if (data.devMode && data.code) {
        setDevOtp(data.code);
        toast({ title: "One-Time OTP generated", description: "Your OTP code is shown below." });
      } else {
        toast({ title: "Check your email", description: `A 6-digit code was sent to ${email}` });
      }
      goMode("signup-otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Signup step 2 — verify OTP and create account ───────────────────────
  const handleSignupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/register", {
        email, password, name, phone: phone || undefined, otpCode: signupOtp,
      });
      setToken(data.token);
      toast({ title: "Account created!", description: `Welcome to Zentryx, ${data.user.name}` });
      setLocation("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot step 1 — send OTP ─────────────────────────────────────────────
  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!forgotEmail.trim()) { setError("Enter your registered email."); return; }
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/forgot-password", { email: forgotEmail });
      if (data.devMode && data.code) {
        setDevForgotOtp(data.code);
        toast({ title: "One-Time OTP generated", description: "Your OTP code is shown below." });
      } else {
        toast({ title: "Check your email", description: "A code was sent if that email is registered." });
      }
      goMode("forgot-otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Forgot step 2 — verify OTP → reset ──────────────────────────────────
  const handleForgotVerify = (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!forgotOtp.trim()) { setError("Enter the code from your email."); return; }
    goMode("reset");
  };

  // ─── Forgot step 3 — set new password ────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (newPw.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await apiFetch("api/auth/reset-password", { email: forgotEmail, otpCode: forgotOtp, newPassword: newPw });
      toast({ title: "Password reset!", description: "You can now sign in with your new password." });
      goMode("login");
      setEmail(forgotEmail);
      setPassword("");
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("Invalid") || err.message.includes("expired")) goMode("forgot-otp");
    } finally {
      setLoading(false);
    }
  };

  // ─── UI helpers ──────────────────────────────────────────────────────────
  const PwToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle} className={cn("absolute right-3 top-1/2 -translate-y-1/2 transition-colors", isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}>
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  const DevOtpBanner = ({ code }: { code: string }) => (
    <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
      <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
      <div>
        <p className="text-xs text-amber-300 font-medium">One-Time OTP:</p>
        <p className="text-xl font-mono font-bold tracking-[0.3em] text-amber-200 mt-0.5">{code}</p>
      </div>
    </div>
  );

  const ErrorBox = () => error ? (
    <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {error}
    </div>
  ) : null;

  const BackBtn = ({ to }: { to: Mode }) => (
    <button type="button" onClick={() => goMode(to)} className={cn("flex items-center gap-1.5 text-xs mb-4 transition-colors", isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground")}>
      <ArrowLeft className="w-3.5 h-3.5" /> Back
    </button>
  );

  const FieldLabel = ({ children }: { children: React.ReactNode }) => (
    <label className={cn("text-sm font-medium ml-1", isLight ? "text-gray-900" : "text-foreground")}>{children}</label>
  );

  return (
    <div className={cn("fixed inset-0 flex flex-col overflow-hidden", isLight ? "bg-gray-100" : "bg-background")}>
      {/* Background decoration */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Sign in card section — natural height, no scroll */}
      <div className="relative z-10 flex-shrink-0 flex justify-center px-4 pt-6 pb-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className={cn("relative w-full max-w-md p-6 sm:p-8 rounded-3xl", isLight ? "bg-white border border-gray-200 shadow-2xl" : "glass-panel")}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl shadow-primary/30 mb-5">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">Zentryx</h1>
          <p className="text-muted-foreground mt-1 text-center text-sm">R&D Intelligence Suite</p>
        </div>

        {/* Tab bar — only for login / signup modes */}
        {(mode === "login" || mode === "signup") && (
          <div className={cn("flex p-1 rounded-xl mb-6", isLight ? "bg-gray-100" : "bg-white/5")}>
            <button onClick={() => goMode("login")} className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all", mode === "login" ? "bg-primary text-white shadow-lg" : isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground")}>
              Sign In
            </button>
            <button onClick={() => goMode("signup")} className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all", mode === "signup" ? "bg-primary text-white shadow-lg" : isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground")}>
              Create Account
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>

            {/* ── Login ─────────────────────────────────────────────────── */}
            {mode === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Email Address</FieldLabel>
                  <div className="relative">
                    <Mail className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={cn("pl-10 h-12", inputLightCls)} placeholder="name@company.com" autoComplete="email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Password</FieldLabel>
                  <div className="relative">
                    <Lock className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required className={cn("pl-10 pr-10 h-12", inputLightCls)} placeholder="••••••••" autoComplete="current-password" />
                    <PwToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="button" onClick={() => goMode("forgot")} className="text-xs text-primary hover:text-primary/80 transition-colors">
                    Forgot password?
                  </button>
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                  {loading ? "Signing in…" : "Sign In to Workspace"}
                </Button>
              </form>
            )}

            {/* ── Sign Up ──────────────────────────────────────────────── */}
            {mode === "signup" && (
              <form onSubmit={handleSignupSendOtp} className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Full Name</FieldLabel>
                  <div className="relative">
                    <User className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input value={name} onChange={e => setName(e.target.value)} required className={cn("pl-10 h-12", inputLightCls)} placeholder="Jane Smith" />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Email Address</FieldLabel>
                  <div className="relative">
                    <Mail className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={cn("pl-10 h-12", inputLightCls)} placeholder="name@company.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Phone Number (optional)</FieldLabel>
                  <div className="relative">
                    <Phone className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={cn("pl-10 h-12", inputLightCls)} placeholder="+234 xxx xxxx xxxx" />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Password</FieldLabel>
                  <div className="relative">
                    <Lock className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required className={cn("pl-10 pr-10 h-12", inputLightCls)} placeholder="Min. 6 characters" />
                    <PwToggle show={showPw} onToggle={() => setShowPw(v => !v)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Confirm Password</FieldLabel>
                  <div className="relative">
                    <Lock className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required className={cn("pl-10 h-12", inputLightCls, confirmPw && confirmPw !== password ? "border-destructive/50" : "")} placeholder="Repeat password" />
                  </div>
                  {confirmPw && confirmPw !== password && <p className="text-[11px] text-destructive ml-1">Passwords do not match</p>}
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                  {loading ? "Sending code…" : "Continue — Verify Email"}
                </Button>
              </form>
            )}

            {/* ── Sign Up OTP ──────────────────────────────────────────── */}
            {mode === "signup-otp" && (
              <form onSubmit={handleSignupVerify} className="space-y-4">
                <BackBtn to="signup" />
                <div className="text-center mb-2">
                  <Mail className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="font-semibold text-foreground">Check your email</p>
                  <p className="text-sm text-muted-foreground mt-1">Enter the 6-digit code sent to <span className="text-foreground font-medium">{email}</span></p>
                </div>
                {devOtp && <DevOtpBanner code={devOtp} />}
                <div className="space-y-2">
                  <FieldLabel>Verification Code</FieldLabel>
                  <Input
                    value={signupOtp} onChange={e => setSignupOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required maxLength={6} className={cn("h-12 text-center text-2xl font-mono tracking-[0.5em]", inputLightCls)}
                    placeholder="000000" autoFocus
                  />
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || signupOtp.length !== 6}>
                  {loading ? "Creating account…" : "Verify & Create Account"}
                </Button>
                <button type="button" onClick={handleSignupSendOtp} className="w-full text-xs text-muted-foreground hover:text-foreground text-center mt-1 transition-colors">
                  Didn't receive it? Resend code
                </button>
              </form>
            )}

            {/* ── Forgot — enter email ─────────────────────────────────── */}
            {mode === "forgot" && (
              <form onSubmit={handleForgotSendOtp} className="space-y-4">
                <BackBtn to="login" />
                <div className="text-center mb-2">
                  <KeyRound className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="font-semibold text-foreground">Reset your password</p>
                  <p className="text-sm text-muted-foreground mt-1">Enter your email and we'll send a verification code.</p>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Registered Email</FieldLabel>
                  <div className="relative">
                    <Mail className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required className={cn("pl-10 h-12", inputLightCls)} placeholder="name@company.com" autoFocus />
                  </div>
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading}>
                  {loading ? "Sending code…" : "Send Reset Code"}
                </Button>
              </form>
            )}

            {/* ── Forgot — enter OTP ──────────────────────────────────── */}
            {mode === "forgot-otp" && (
              <form onSubmit={handleForgotVerify} className="space-y-4">
                <BackBtn to="forgot" />
                <div className="text-center mb-2">
                  <Mail className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="font-semibold text-foreground">Check your email</p>
                  <p className="text-sm text-muted-foreground mt-1">Code sent to <span className="text-foreground font-medium">{forgotEmail}</span></p>
                </div>
                {devForgotOtp && <DevOtpBanner code={devForgotOtp} />}
                <div className="space-y-2">
                  <FieldLabel>Verification Code</FieldLabel>
                  <Input
                    value={forgotOtp} onChange={e => setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required maxLength={6} className={cn("h-12 text-center text-2xl font-mono tracking-[0.5em]", inputLightCls)}
                    placeholder="000000" autoFocus
                  />
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || forgotOtp.length !== 6}>
                  Verify Code
                </Button>
              </form>
            )}

            {/* ── Reset — new password ─────────────────────────────────── */}
            {mode === "reset" && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="text-center mb-2">
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
                  <p className="font-semibold text-foreground">Code verified!</p>
                  <p className="text-sm text-muted-foreground mt-1">Set your new password below.</p>
                </div>
                <div className="space-y-2">
                  <FieldLabel>New Password</FieldLabel>
                  <div className="relative">
                    <Lock className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} required className={cn("pl-10 pr-10 h-12", inputLightCls)} placeholder="Min. 6 characters" autoFocus />
                    <PwToggle show={showNewPw} onToggle={() => setShowNewPw(v => !v)} />
                  </div>
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || newPw.length < 6}>
                  {loading ? "Resetting…" : "Set New Password"}
                </Button>
              </form>
            )}

          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>

      {/* Bounce area — fills remaining viewport height */}
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-hidden w-full z-10"
      >
        <img
          ref={logoRef}
          src={`${BASE}images/FH_LOGO_transparent.png`}
          alt=""
          style={{
            position: "absolute",
            width: 120,
            height: "auto",
            pointerEvents: "none",
            userSelect: "none",
            left: 50,
            top: 50,
          }}
        />
      </div>
    </div>
  );
}
