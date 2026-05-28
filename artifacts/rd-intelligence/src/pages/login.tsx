import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Zap, Lock, Mail, User, AlertCircle, Phone, Eye, EyeOff, ArrowLeft, KeyRound, CheckCircle, MessageSquare, ShieldCheck, Clock, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";

const BASE = import.meta.env.BASE_URL;

type Mode = "login" | "signup" | "signup-otp" | "forgot" | "forgot-otp" | "reset" | "sms-otp" | "add-phone" | "request-pending" | "totp-challenge" | "totp-enroll" | "totp-backup-code" | "totp-fallback-sms" | "totp-fallback-voice" | "totp-fallback-admin";

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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  );
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

  // SMS MFA fields
  const [mfaToken, setMfaToken] = useState("");
  const [smsPhone, setSmsPhone] = useState("");
  const [smsOtp, setSmsOtp] = useState("");
  const [devSmsOtp, setDevSmsOtp] = useState("");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [smsFailed, setSmsFailed] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [devEmailOtp, setDevEmailOtp] = useState("");
  const [requestId, setRequestId] = useState("");
  const [requestUserName, setRequestUserName] = useState("");

  // ── TOTP MFA fields ────────────────────────────────────────────────
  const [totpCode, setTotpCode] = useState("");
  const [totpAttempts, setTotpAttempts] = useState(0);
  const [showFallbacks, setShowFallbacks] = useState(false);
  const [enrollQr, setEnrollQr] = useState("");
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollVerifyCode, setEnrollVerifyCode] = useState("");
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [enrollStep, setEnrollStep] = useState<"scan" | "backup">("scan");
  const [issuedBackupCodes, setIssuedBackupCodes] = useState<string[]>([]);
  const [backupCodeInput, setBackupCodeInput] = useState("");

  // ── TOTP fallback paths ───────────────────────────────────────────
  const [fallbackPhone, setFallbackPhone] = useState("");
  const [fallbackCode, setFallbackCode] = useState("");
  const [fallbackDevCode, setFallbackDevCode] = useState("");
  const [adminRequestReason, setAdminRequestReason] = useState("");
  const [adminRequestSubmitted, setAdminRequestSubmitted] = useState(false);
  const [adminOneTimeToken, setAdminOneTimeToken] = useState("");
  const [adminOneTimeEmail, setAdminOneTimeEmail] = useState("");

  const clearError = () => setError("");
  const goMode = (m: Mode) => { setMode(m); setError(""); };

  // maskedEmail: hide middle of email for display e.g. p***@gmail.com
  function maskedEmail(addr: string) {
    const [local, domain] = addr.split("@");
    if (!domain) return addr;
    return `${local.slice(0, 1)}***@${domain}`;
  }

  function handleMfaResponse(data: {
    mfaPending?: boolean;
    requirePhone?: boolean;
    mfaToken?: string;
    mfaType?: "totp" | "sms";
    mustEnrollMfa?: boolean;
    phone?: string;
    smsFailed?: boolean;
    devMode?: boolean;
    code?: string;
    token?: string;
    user?: { name: string };
  }) {
    if (data.mfaPending && data.mfaToken) {
      setMfaToken(data.mfaToken);
      setVoiceMode(false);
      setEmailMode(false);
      setDevEmailOtp("");
      // Phase 1: TOTP-first MFA branching ---------------------------------
      if (data.mfaType === "totp") {
        goMode("totp-challenge");
        return;
      }
      if (data.mustEnrollMfa) {
        toast({
          title: "Two-factor required",
          description: "Your role requires an authenticator app. Let's set one up now.",
        });
        goMode("totp-enroll");
        return;
      }
      // Legacy SMS path (will be removed in chunk 4) ----------------------
      if (data.requirePhone) {
        goMode("add-phone");
      } else {
        setSmsPhone(data.phone || "");
        setSmsFailed(data.smsFailed ?? false);
        setDevSmsOtp(data.devMode && data.code ? data.code : "");
        if (data.devMode && data.code) {
          toast({ title: "One-Time SMS code generated", description: "Your SMS code is shown below." });
        } else if (!data.smsFailed) {
          toast({ title: "SMS code sent", description: `A 6-digit code was sent to ${data.phone}` });
        }
        goMode("sms-otp");
      }
    } else if (data.token) {
      setToken(data.token);
      toast({ title: "Welcome!", description: `Signed in as ${data.user?.name ?? ""}` });
      setLocation("/");
    }
  }

  // Handle OAuth / MFA redirect callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get("oauth_token");
    const oauthError = params.get("oauth_error");
    const mfaTokenParam = params.get("mfa_token");
    const requirePhone = params.get("require_phone");
    const phoneParam = params.get("phone");
    const smsCodeParam = params.get("sms_code");
    const smsFailedParam = params.get("sms_failed") === "true";

    // Pick up any session-expiry reason set by the global fetch
    // interceptor before the redirect to /login.
    const logoutReason = sessionStorage.getItem("rd_logout_reason");
    if (logoutReason) {
      sessionStorage.removeItem("rd_logout_reason");
      setError(logoutReason);
    }

    window.history.replaceState({}, "", window.location.pathname);

    if (oauthToken) {
      setToken(oauthToken);
      setLocation("/");
    } else if (mfaTokenParam) {
      setMfaToken(mfaTokenParam);
      setVoiceMode(false);
      setEmailMode(false);
      setDevEmailOtp("");
      if (requirePhone === "true") {
        goMode("add-phone");
      } else {
        setSmsPhone(phoneParam || "");
        setSmsFailed(smsFailedParam);
        if (smsCodeParam) {
          setDevSmsOtp(smsCodeParam);
          toast({ title: "One-Time SMS code generated", description: "Your SMS code is shown below." });
        } else if (phoneParam && !smsFailedParam) {
          toast({ title: "SMS code sent", description: `A 6-digit code was sent to ${phoneParam}` });
        }
        goMode("sms-otp");
      }
    } else if (oauthError) {
      if (oauthError === "cancelled") {
        setError("Sign-in was cancelled.");
      } else if (oauthError === "domain_not_allowed" || oauthError === "invalid_domain") {
        setError(
          "Only Freddy Hirsch work email addresses (@freddyhirsch.co.za) are permitted to sign in. " +
          "Please use your work email or contact your administrator.",
        );
      } else if (oauthError === "approval_pending") {
        goMode("request-pending");
      } else if (oauthError === "approval_denied") {
        setError("Your account access has been denied. Contact your administrator for details.");
      } else {
        setError("OAuth sign-in failed. Please try again.");
      }
    }
  }, []);

  const OAuthButtons = () => (
    <div className="mt-1">
      <div className="relative my-4 flex items-center gap-3">
        <div className={cn("flex-1 border-t", isLight ? "border-gray-200" : "border-white/10")} />
        <span className={cn("text-xs uppercase tracking-wider flex-shrink-0", isLight ? "text-gray-400" : "text-muted-foreground")}>or continue with</span>
        <div className={cn("flex-1 border-t", isLight ? "border-gray-200" : "border-white/10")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Google sign-in intentionally disabled. Freddy Hirsch is on
            Microsoft 365; we keep the button visible (greyed out) as a
            placeholder for future re-enablement. The backend route
            /api/auth/google still exists but is gated by ALLOWED_EMAIL_DOMAINS
            so a direct hit can't auto-provision a Zentryx account. */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Coming soon — please sign in with Microsoft"
          className={cn(
            "flex items-center justify-center gap-2 h-11 px-3 rounded-xl border text-sm font-medium select-none cursor-not-allowed opacity-50",
            isLight ? "border-gray-200 bg-white text-gray-500" : "border-white/10 bg-white/5 text-muted-foreground",
          )}
        >
          <GoogleIcon /> Google
          <span className={cn("ml-1 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full",
            isLight ? "bg-gray-100 text-gray-500" : "bg-white/10 text-muted-foreground",
          )}>Soon</span>
        </button>
        <a href={`${BASE}api/auth/microsoft`}
          className={cn("flex items-center justify-center gap-2 h-11 px-3 rounded-xl border text-sm font-medium transition-all select-none",
            isLight ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm" : "border-white/10 bg-white/5 text-foreground hover:bg-white/10"
          )}>
          <MicrosoftIcon /> Outlook
        </a>
      </div>
    </div>
  );

  // ─── Login ────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/login", { email, password });
      handleMfaResponse(data);
    } catch (err: any) {
      // The login endpoint returns 403 with a structured body for
      // approval gates. apiFetch surfaces only `err.message`, so we
      // detect by message content here.
      const msg = err.message || "Invalid email or password.";
      if (msg.includes("awaiting administrator approval")) {
        setRequestUserName(name || email.split("@")[0] || "");
        goMode("request-pending");
        return;
      }
      setError(msg);
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

  // ─── Signup step 2 — verify email OTP and create account ─────────────────
  const handleSignupVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/register", {
        email, password, name, phone: phone || undefined, otpCode: signupOtp,
      });
      // New flow: registration always ends with approval-pending. The
      // server returns { approvalPending: true } and the UI shows the
      // "awaiting admin approval" screen until they're approved and
      // can log in normally.
      if (data.approvalPending) {
        setRequestUserName(name);
        goMode("request-pending");
        toast({ title: "Account submitted", description: "An admin will review your account." });
        return;
      }
      // Backwards-compatible: if the server still returns the legacy
      // mfaPending payload, route through the MFA flow as before.
      handleMfaResponse(data);
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

  // ─── TOTP challenge — verify the 6-digit code from authenticator ──────────
  const handleTotpChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/mfa/totp/challenge", { mfaToken, code: totpCode });
      setToken(data.token);
      toast({ title: "Verified!", description: `Welcome, ${data.user?.name ?? ""}` });
      setLocation("/");
    } catch (err: any) {
      // The server returns { error: "InvalidCode", attempts: N, showFallbacks: bool }
      const msg = err.message || "Verification failed";
      setError(msg);
      // Attempt counter + fallback gate are surfaced via the message
      // body the server returns. We naively bump locally too so the UI
      // updates immediately without waiting for the next response.
      setTotpAttempts(a => {
        const next = a + 1;
        if (next >= 3) setShowFallbacks(true);
        return next;
      });
      if (msg.includes("Invalid MFA token") || msg.includes("expired")) goMode("login");
    } finally {
      setLoading(false);
    }
  };

  // ─── TOTP enrollment — fetch QR + secret, then verify first code ──────────
  const handleStartEnroll = async () => {
    clearError();
    setEnrollLoading(true);
    try {
      // The enrollment endpoint requires the user's session token; during
      // the "must-enroll-MFA" flow we only have an mfaToken. Use it
      // explicitly as the Authorization header since it carries
      // mfaPending: true (the backend allows enrollment from MFA tokens
      // because requireAuth doesn't gate on mfaPending here — see /enroll/start).
      // For simplicity we just attach the mfaToken header.
      const res = await fetch(`${BASE}api/mfa/enroll/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mfaToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Enrollment failed");
      setEnrollQr(data.qrCode);
      setEnrollSecret(data.manualEntrySecret);
      setEnrollStep("scan");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnrollLoading(false);
    }
  };

  const handleVerifyEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setEnrollLoading(true);
    try {
      const res = await fetch(`${BASE}api/mfa/enroll/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mfaToken}`,
        },
        body: JSON.stringify({ code: enrollVerifyCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      setIssuedBackupCodes(data.backupCodes || []);
      setEnrollStep("backup");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEnrollLoading(false);
    }
  };

  // After the user confirms they've saved the backup codes, we re-issue
  // the password+TOTP login flow from scratch so they get a real
  // session token. Simpler than minting one server-side from the
  // mfaToken; matches what they'd do on subsequent logins anyway.
  const handleFinishEnroll = () => {
    setIssuedBackupCodes([]);
    setEnrollQr("");
    setEnrollSecret("");
    setEnrollVerifyCode("");
    setEnrollStep("scan");
    setMfaToken("");
    goMode("login");
    toast({
      title: "Two-factor enabled",
      description: "Sign in with your password and your authenticator code.",
    });
  };

  // ─── Backup-code fallback ─────────────────────────────────────────────────
  const handleBackupCodeVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/mfa/backup-code/verify", {
        mfaToken,
        code: backupCodeInput,
      });
      setToken(data.token);
      toast({
        title: "Signed in via backup code",
        description: data.remainingBackupCodes <= 2
          ? `Only ${data.remainingBackupCodes} backup code${data.remainingBackupCodes === 1 ? "" : "s"} left — regenerate from Settings.`
          : `${data.remainingBackupCodes} backup codes remaining.`,
      });
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Invalid backup code");
    } finally {
      setLoading(false);
    }
  };

  // ─── TOTP fallback: send Termii SMS ───────────────────────────────────────
  const handleFallbackSms = async () => {
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/mfa/fallback/sms", { mfaToken });
      setFallbackPhone(data.phone);
      setFallbackDevCode(data.devMode && data.code ? data.code : "");
      setFallbackCode("");
      if (data.devMode && data.code) {
        toast({ title: "One-time SMS code generated", description: "Your code is shown below." });
      } else if (!data.smsFailed) {
        toast({ title: "Code sent", description: `Sent to ${data.phone}` });
      }
      goMode("totp-fallback-sms");
    } catch (err: any) {
      setError(err.message || "Could not send SMS code.");
    } finally {
      setLoading(false);
    }
  };

  // ─── TOTP fallback: Termii voice call ─────────────────────────────────────
  const handleFallbackVoice = async () => {
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/mfa/fallback/voice", { mfaToken });
      setFallbackPhone(data.phone);
      setFallbackCode("");
      if (!data.failed) {
        toast({ title: "Calling you now", description: `An automated voice call is being placed to ${data.phone}.` });
      }
      goMode("totp-fallback-voice");
    } catch (err: any) {
      setError(err.message || "Could not place voice call.");
    } finally {
      setLoading(false);
    }
  };

  // Both SMS and Voice paths verify through the same endpoint — the flag
  // tells the backend which Termii API to consult.
  const handleFallbackVerify = (isVoice: boolean) => async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/mfa/fallback/verify", {
        mfaToken,
        code: fallbackCode,
        isVoice,
      });
      setToken(data.token);
      toast({ title: "Signed in", description: `Welcome, ${data.user?.name ?? ""}` });
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  // ─── TOTP fallback: request admin emergency approval ──────────────────────
  const handleFallbackAdminRequest = async () => {
    clearError();
    setLoading(true);
    try {
      await apiFetch("api/mfa/fallback/admin-request", {
        mfaToken,
        reason: adminRequestReason || "Unable to access authenticator",
      });
      setAdminRequestSubmitted(true);
      goMode("totp-fallback-admin");
    } catch (err: any) {
      setError(err.message || "Could not submit request.");
    } finally {
      setLoading(false);
    }
  };

  // After admin approves out-of-band, the user types the one-time token here.
  const handleEmergencyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/mfa/emergency-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminOneTimeEmail || email,
          token: adminOneTimeToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Token invalid or expired");
      setToken(data.token);
      toast({
        title: "Emergency login successful",
        description: "Your MFA was reset — please re-enroll an authenticator app from Settings → Security.",
      });
      setLocation("/");
    } catch (err: any) {
      setError(err.message || "Invalid token.");
    } finally {
      setLoading(false);
    }
  };

  // ─── SMS OTP — verify ─────────────────────────────────────────────────────
  const handleSmsVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/verify-sms", { mfaToken, otpCode: smsOtp, isVoice: voiceMode, isEmail: emailMode });
      setToken(data.token);
      toast({ title: "Verified!", description: `Welcome, ${data.user?.name ?? ""}` });
      setLocation("/");
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("expired") || err.message.includes("Session")) goMode("login");
    } finally {
      setLoading(false);
    }
  };

  // ─── SMS OTP — resend ─────────────────────────────────────────────────────
  const handleSmsResend = async () => {
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/resend-sms", { mfaToken });
      setVoiceMode(false);
      setEmailMode(false);
      setDevEmailOtp("");
      if (data.failed) {
        setSmsFailed(true);
        setError("SMS delivery failed. Try Call me, Email me, or Request access from an admin.");
      } else if (data.devMode && data.code) {
        setSmsFailed(false);
        setDevSmsOtp(data.code);
        toast({ title: "New code generated", description: "Your SMS code is shown below." });
      } else {
        setSmsFailed(false);
        toast({ title: "Code resent", description: `A new code was sent to ${smsPhone}` });
      }
      setSmsOtp("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Voice call OTP ───────────────────────────────────────────────────────
  const handleVoiceCall = async () => {
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/call-otp", { mfaToken });
      if (data.failed) {
        setError("Call failed. Please retry SMS or try again later.");
      } else {
        setVoiceMode(true);
        setSmsFailed(false);
        setSmsOtp("");
        toast({ title: "Calling your phone", description: `Listen for a call on ${smsPhone}` });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Add phone then send SMS ──────────────────────────────────────────────
  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!addPhoneNum.trim()) { setError("Enter your phone number."); return; }
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/mfa/add-phone", { mfaToken, phone: addPhoneNum.trim() });
      setSmsPhone(data.phone || addPhoneNum);
      setDevSmsOtp(data.devMode && data.code ? data.code : "");
      if (data.devMode && data.code) {
        toast({ title: "One-Time SMS code generated", description: "Your SMS code is shown below." });
      } else {
        toast({ title: "Code sent", description: `A 6-digit code was sent to ${data.phone}` });
      }
      goMode("sms-otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Email OTP fallback ───────────────────────────────────────────────────
  const handleEmailOtp = async () => {
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/mfa/email-otp", { mfaToken });
      setEmailMode(true);
      setVoiceMode(false);
      setSmsOtp("");
      if (data.devMode && data.code) {
        setDevEmailOtp(data.code);
        toast({ title: "One-Time email code generated", description: "Your code is shown below." });
      } else {
        setDevEmailOtp("");
        toast({ title: "Code sent to your email", description: "Check your inbox for the verification code." });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Request admin access ─────────────────────────────────────────────────
  const handleRequestAccess = async () => {
    clearError();
    setLoading(true);
    try {
      const data = await apiFetch("api/auth/request-access", { mfaToken });
      setRequestId(data.requestId);
      goMode("request-pending");
      toast({ title: "Request sent", description: "An admin has been notified and will review your request." });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Poll for access request approval
  useEffect(() => {
    if (mode !== "request-pending" || !requestId) return;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}api/auth/access-request-status?requestId=${requestId}`);
        const data = await r.json();
        if (data.status === "approved" && data.token) {
          setToken(data.token);
          toast({ title: "Access granted!", description: `Welcome, ${data.user?.name ?? ""}` });
          setLocation("/");
        } else if (data.status === "denied") {
          goMode("sms-otp");
          setError("Your access request was denied by the administrator.");
        } else if (data.status === "expired") {
          goMode("sms-otp");
          setError("Access request expired. Please try again.");
        }
      } catch { /* silent — keep polling */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [mode, requestId]);

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
    <div className={cn("fixed inset-0 overflow-y-auto", isLight ? "bg-gray-100" : "bg-background")}>
      {/* Background decoration */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Card — centred */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-full py-6 px-4">
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
                <OAuthButtons />
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
                <OAuthButtons />
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

            {/* ── Add Phone ────────────────────────────────────────────── */}
            {mode === "add-phone" && (
              <form onSubmit={handleAddPhone} className="space-y-4">
                <div className="text-center mb-2">
                  <Phone className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="font-semibold text-foreground">Add your phone number</p>
                  <p className="text-sm text-muted-foreground mt-1">We'll send a one-time code via SMS or WhatsApp to verify your identity.</p>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Phone Number</FieldLabel>
                  <div className="relative">
                    <Phone className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5", iconCls)} />
                    <Input
                      type="tel" value={addPhoneNum} onChange={e => setAddPhoneNum(e.target.value)}
                      required className={cn("pl-10 h-12", inputLightCls)} placeholder="+234 xxx xxxx xxxx" autoFocus
                    />
                  </div>
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || !addPhoneNum.trim()}>
                  {loading ? "Sending code…" : "Send Verification Code"}
                </Button>
              </form>
            )}

            {/* ── SMS OTP ──────────────────────────────────────────────── */}
            {mode === "sms-otp" && (
              <form onSubmit={handleSmsVerify} className="space-y-4">
                <div className="text-center mb-2">
                  <MessageSquare className="w-10 h-10 text-primary mx-auto mb-2" />
                  <p className="font-semibold text-foreground">
                    {emailMode ? "Email Verification" : voiceMode ? "Voice Verification" : "SMS Verification"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {emailMode
                      ? <>Code sent to <span className="text-foreground font-medium">{maskedEmail(email || forgotEmail || "your email")}</span> — check your inbox.</>
                      : voiceMode
                      ? <>Listen for a call on <span className="text-foreground font-medium font-mono">{smsPhone || "your phone"}</span> and enter the code you hear.</>
                      : <>Enter the 6-digit code sent to <span className="text-foreground font-medium font-mono">{smsPhone || "your phone"}</span></>
                    }
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Required once every 12 hours</p>
                </div>

                {/* SMS failed warning */}
                {smsFailed && !voiceMode && !emailMode && (
                  <div className="flex items-start gap-2 text-sm bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2.5 text-orange-600 dark:text-orange-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>SMS delivery failed. Use <strong>Call me</strong>, <strong>Email me</strong>, or <strong>Request access</strong> below.</span>
                  </div>
                )}

                {devSmsOtp && !emailMode && <DevOtpBanner code={devSmsOtp} />}
                {devEmailOtp && emailMode && <DevOtpBanner code={devEmailOtp} />}
                <div className="space-y-2">
                  <FieldLabel>Verification Code</FieldLabel>
                  <Input
                    value={smsOtp} onChange={e => setSmsOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required maxLength={6} className={cn("h-12 text-center text-2xl font-mono tracking-[0.5em]", inputLightCls)}
                    placeholder="000000" autoFocus
                  />
                </div>
                <ErrorBox />
                <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={loading || smsOtp.length !== 6}>
                  {loading ? "Verifying…" : "Verify & Enter Workspace"}
                </Button>

                {/* Resend / Call / Email — always visible */}
                <div className={cn("flex rounded-xl overflow-hidden border", isLight ? "border-gray-200" : "border-white/10")}>
                  <button
                    type="button" onClick={handleSmsResend} disabled={loading}
                    className={cn("flex-1 py-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                      isLight ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    Resend SMS
                  </button>
                  <div className={cn("w-px self-stretch", isLight ? "bg-gray-200" : "bg-white/10")} />
                  <button
                    type="button" onClick={handleVoiceCall} disabled={loading}
                    className={cn("flex-1 py-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                      smsFailed && !emailMode
                        ? "text-primary font-semibold"
                        : isLight ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    Call me
                  </button>
                  <div className={cn("w-px self-stretch", isLight ? "bg-gray-200" : "bg-white/10")} />
                  <button
                    type="button" onClick={handleEmailOtp} disabled={loading}
                    className={cn("flex-1 py-2.5 text-xs font-medium transition-colors disabled:opacity-50",
                      smsFailed && !voiceMode
                        ? "text-primary font-semibold"
                        : isLight ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    Email me
                  </button>
                </div>

                {/* Request Access fallback */}
                <button
                  type="button" onClick={handleRequestAccess} disabled={loading}
                  className={cn("w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-medium transition-all disabled:opacity-50",
                    isLight
                      ? "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300"
                      : "border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Request access from an admin
                </button>
              </form>
            )}

            {/* ── TOTP challenge (6-digit code) ─────────────────────── */}
            {mode === "totp-challenge" && (
              <form onSubmit={handleTotpChallenge} className="space-y-5">
                <div>
                  <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Enter your 6-digit authenticator code</p>
                  <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                    Open your authenticator app (Microsoft, Google, Authy, 1Password, etc.) and type the current code for Zentryx.
                  </p>
                </div>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123 456"
                  className={cn(
                    "w-full h-14 rounded-xl border px-4 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40",
                    isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground",
                  )}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button type="submit" disabled={loading || totpCode.length !== 6} className="w-full h-11">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                </Button>

                {showFallbacks && (
                  <div className={cn("rounded-xl border p-4 space-y-3", isLight ? "border-amber-200 bg-amber-50" : "border-amber-500/30 bg-amber-500/10")}>
                    <p className={cn("text-xs font-semibold uppercase tracking-wide", isLight ? "text-amber-700" : "text-amber-300")}>
                      Can't get your code?
                    </p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => goMode("totp-backup-code")}
                        className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors", isLight ? "bg-white border border-amber-200 text-gray-700 hover:bg-amber-50" : "bg-white/5 border border-amber-500/30 text-foreground hover:bg-white/10")}
                      >
                        🔑 Enter a backup code
                      </button>
                      <button
                        type="button"
                        onClick={handleFallbackSms}
                        disabled={loading}
                        className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors", isLight ? "bg-white border border-amber-200 text-gray-700 hover:bg-amber-50" : "bg-white/5 border border-amber-500/30 text-foreground hover:bg-white/10")}
                      >
                        📱 Send code via SMS
                      </button>
                      <button
                        type="button"
                        onClick={handleFallbackVoice}
                        disabled={loading}
                        className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors", isLight ? "bg-white border border-amber-200 text-gray-700 hover:bg-amber-50" : "bg-white/5 border border-amber-500/30 text-foreground hover:bg-white/10")}
                      >
                        📞 Call me with the code
                      </button>
                      <button
                        type="button"
                        onClick={() => goMode("totp-fallback-admin")}
                        disabled={loading}
                        className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors", isLight ? "bg-white border border-amber-200 text-gray-700 hover:bg-amber-50" : "bg-white/5 border border-amber-500/30 text-foreground hover:bg-white/10")}
                      >
                        🛡️ Request admin emergency access
                      </button>
                    </div>
                  </div>
                )}

                <button type="button" onClick={() => { goMode("login"); setTotpCode(""); setTotpAttempts(0); setShowFallbacks(false); }} className={cn("w-full text-xs", isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}>
                  ← Cancel and sign in as a different user
                </button>
              </form>
            )}

            {/* ── TOTP enrollment ──────────────────────────────────────── */}
            {mode === "totp-enroll" && (
              <div className="space-y-5">
                {!enrollQr && (
                  <>
                    <div>
                      <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Set up two-factor authentication</p>
                      <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                        Your role requires an authenticator app. This takes about 60 seconds.
                      </p>
                    </div>
                    <div className={cn("rounded-xl border p-4 text-xs space-y-2", isLight ? "border-gray-200 bg-gray-50 text-gray-700" : "border-white/10 bg-white/5 text-muted-foreground")}>
                      <p className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Before you start:</p>
                      <p>• Install an authenticator app on your phone — Microsoft Authenticator, Google Authenticator, Authy, 1Password, or Bitwarden all work.</p>
                      <p>• Have your phone unlocked and the app open.</p>
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <Button onClick={handleStartEnroll} disabled={enrollLoading} className="w-full h-11">
                      {enrollLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "I'm ready — generate my code"}
                    </Button>
                  </>
                )}

                {enrollQr && enrollStep === "scan" && (
                  <form onSubmit={handleVerifyEnroll} className="space-y-4">
                    <div>
                      <p className={cn("text-sm font-semibold mb-1", isLight ? "text-gray-900" : "text-foreground")}>Scan this QR code</p>
                      <p className={cn("text-xs", isLight ? "text-gray-500" : "text-muted-foreground")}>
                        In your authenticator app, tap "Add account" → "Scan QR code" and point your camera at this image.
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <img src={enrollQr} alt="MFA QR code" className="w-48 h-48 rounded-xl border border-white/10 bg-white p-2" />
                    </div>
                    <details className="text-xs">
                      <summary className={cn("cursor-pointer", isLight ? "text-gray-500 hover:text-gray-900" : "text-muted-foreground hover:text-foreground")}>Can't scan? Enter the secret manually</summary>
                      <code className={cn("block mt-2 p-2 rounded font-mono text-[11px] break-all select-all", isLight ? "bg-gray-100 text-gray-900" : "bg-white/5 text-foreground")}>{enrollSecret}</code>
                    </details>
                    <div>
                      <label className={cn("text-xs font-medium mb-1 block", isLight ? "text-gray-700" : "text-muted-foreground")}>
                        Enter the 6-digit code from your app to confirm
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={enrollVerifyCode}
                        onChange={(e) => setEnrollVerifyCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="123 456"
                        className={cn(
                          "w-full h-12 rounded-xl border px-4 text-center text-xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40",
                          isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground",
                        )}
                      />
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <Button type="submit" disabled={enrollLoading || enrollVerifyCode.length !== 6} className="w-full h-11">
                      {enrollLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm and enable"}
                    </Button>
                  </form>
                )}

                {enrollStep === "backup" && (
                  <div className="space-y-4">
                    <div>
                      <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Save your backup codes</p>
                      <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                        Use these if you lose your phone or can't open your authenticator. Each code works <strong>once</strong>. Print them, save them in your password manager, or screenshot them <strong>now</strong> — they will not be shown again.
                      </p>
                    </div>
                    <div className={cn("rounded-xl border p-4 grid grid-cols-2 gap-2 font-mono text-sm", isLight ? "border-gray-200 bg-gray-50 text-gray-900" : "border-white/10 bg-white/5 text-foreground")}>
                      {issuedBackupCodes.map((c) => <code key={c} className="select-all">{c}</code>)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(issuedBackupCodes.join("\n")).then(() => {
                          toast({ title: "Copied", description: "Backup codes copied to clipboard." });
                        });
                      }}
                      className={cn("w-full text-xs py-2 rounded-lg border", isLight ? "border-gray-200 text-gray-700 hover:bg-gray-50" : "border-white/10 text-muted-foreground hover:bg-white/5")}
                    >
                      Copy all to clipboard
                    </button>
                    <Button onClick={handleFinishEnroll} className="w-full h-11">
                      I've saved them — finish setup
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Backup-code fallback ────────────────────────────────── */}
            {mode === "totp-backup-code" && (
              <form onSubmit={handleBackupCodeVerify} className="space-y-5">
                <div>
                  <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Enter a backup code</p>
                  <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                    Use one of the 10 codes you saved when you enrolled. Format: <code className="font-mono">XXXX-XXXX</code>. Each code works only once.
                  </p>
                </div>
                <input
                  autoFocus
                  type="text"
                  value={backupCodeInput}
                  onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  className={cn(
                    "w-full h-12 rounded-xl border px-4 text-center text-lg tracking-[0.2em] font-mono uppercase focus:outline-none focus:ring-2 focus:ring-primary/40",
                    isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground",
                  )}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button type="submit" disabled={loading || backupCodeInput.length < 8} className="w-full h-11">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in with backup code"}
                </Button>
                <button type="button" onClick={() => { goMode("totp-challenge"); setBackupCodeInput(""); }} className={cn("w-full text-xs", isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}>
                  ← Back to authenticator code
                </button>
              </form>
            )}

            {/* ── TOTP fallback: SMS code entry ────────────────────── */}
            {mode === "totp-fallback-sms" && (
              <form onSubmit={handleFallbackVerify(false)} className="space-y-5">
                <div>
                  <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Enter the SMS code</p>
                  <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                    We sent a 6-digit code to {fallbackPhone}. It expires in 10 minutes.
                  </p>
                </div>
                {fallbackDevCode && (
                  <div className={cn("rounded-lg p-3 text-xs font-mono", isLight ? "bg-amber-50 border border-amber-200 text-amber-800" : "bg-amber-500/10 border border-amber-500/30 text-amber-300")}>
                    <strong>Dev mode:</strong> {fallbackDevCode}
                  </div>
                )}
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={fallbackCode}
                  onChange={(e) => setFallbackCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123 456"
                  className={cn("w-full h-14 rounded-xl border px-4 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40",
                    isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button type="submit" disabled={loading || fallbackCode.length !== 6} className="w-full h-11">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify and sign in"}
                </Button>
                <div className="flex justify-between text-xs">
                  <button type="button" onClick={handleFallbackSms} disabled={loading} className={cn(isLight ? "text-primary hover:underline" : "text-primary hover:underline")}>
                    Resend SMS
                  </button>
                  <button type="button" onClick={() => goMode("totp-challenge")} className={cn(isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}>
                    ← Back to authenticator
                  </button>
                </div>
              </form>
            )}

            {/* ── TOTP fallback: Voice code entry ──────────────────── */}
            {mode === "totp-fallback-voice" && (
              <form onSubmit={handleFallbackVerify(true)} className="space-y-5">
                <div>
                  <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Enter the voice code</p>
                  <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                    We're calling {fallbackPhone}. Listen for the 6-digit code and type it below. Pick up if you missed the first call.
                  </p>
                </div>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={fallbackCode}
                  onChange={(e) => setFallbackCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123 456"
                  className={cn("w-full h-14 rounded-xl border px-4 text-center text-2xl tracking-[0.4em] font-mono focus:outline-none focus:ring-2 focus:ring-primary/40",
                    isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <Button type="submit" disabled={loading || fallbackCode.length !== 6} className="w-full h-11">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify and sign in"}
                </Button>
                <div className="flex justify-between text-xs">
                  <button type="button" onClick={handleFallbackVoice} disabled={loading} className="text-primary hover:underline">
                    Call again
                  </button>
                  <button type="button" onClick={() => goMode("totp-challenge")} className={cn(isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}>
                    ← Back to authenticator
                  </button>
                </div>
              </form>
            )}

            {/* ── TOTP fallback: admin emergency approval ──────────── */}
            {mode === "totp-fallback-admin" && (
              <div className="space-y-5">
                {!adminRequestSubmitted ? (
                  <>
                    <div>
                      <p className={cn("text-sm font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Request emergency access</p>
                      <p className={cn("text-xs mt-1", isLight ? "text-gray-500" : "text-muted-foreground")}>
                        Use this if you've lost access to your authenticator app AND your backup codes AND can't receive SMS/voice. An admin will review and may grant one-time access.
                      </p>
                    </div>
                    <div>
                      <label className={cn("text-xs font-medium mb-1 block", isLight ? "text-gray-700" : "text-muted-foreground")}>
                        Reason (optional, helps the admin decide quickly)
                      </label>
                      <textarea
                        rows={3}
                        value={adminRequestReason}
                        onChange={(e) => setAdminRequestReason(e.target.value)}
                        placeholder="e.g. lost phone yesterday, backup codes were on the same device"
                        className={cn("w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none",
                          isLight ? "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400" : "bg-black/20 border-white/10 text-foreground placeholder:text-muted-foreground")}
                      />
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <Button onClick={handleFallbackAdminRequest} disabled={loading} className="w-full h-11">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send request to admin"}
                    </Button>
                    <button type="button" onClick={() => goMode("totp-challenge")} className={cn("w-full text-xs", isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}>
                      ← Back to authenticator
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleEmergencyLogin} className="space-y-4">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                        <p className={cn("font-semibold text-lg", isLight ? "text-gray-900" : "text-foreground")}>Request sent</p>
                        <p className={cn("text-xs mt-1", isLight ? "text-gray-600" : "text-muted-foreground")}>
                          An admin has been notified. When approved, they will deliver a <strong>one-time login code</strong> to you in person, by phone, or another verified channel. Enter it below when you have it.
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className={cn("text-xs font-medium mb-1 block", isLight ? "text-gray-700" : "text-muted-foreground")}>Email</label>
                      <input
                        type="email"
                        value={adminOneTimeEmail || email}
                        onChange={(e) => setAdminOneTimeEmail(e.target.value)}
                        placeholder="your.email@freddyhirsch.co.za"
                        className={cn("w-full h-11 rounded-xl border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40",
                          isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")}
                      />
                    </div>
                    <div>
                      <label className={cn("text-xs font-medium mb-1 block", isLight ? "text-gray-700" : "text-muted-foreground")}>One-time code from admin</label>
                      <input
                        type="text"
                        value={adminOneTimeToken}
                        onChange={(e) => setAdminOneTimeToken(e.target.value.trim())}
                        placeholder="Paste the code your admin shared with you"
                        className={cn("w-full h-11 rounded-xl border px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40",
                          isLight ? "bg-white border-gray-200 text-gray-900" : "bg-black/20 border-white/10 text-foreground")}
                      />
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <Button type="submit" disabled={loading || !adminOneTimeToken} className="w-full h-11">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in with one-time code"}
                    </Button>
                    <p className={cn("text-[10px] text-center", isLight ? "text-gray-400" : "text-muted-foreground")}>
                      Once you sign in, your MFA will be reset. You'll need to re-enroll an authenticator app.
                    </p>
                  </form>
                )}
              </div>
            )}

            {/* ── Request Pending ──────────────────────────────────── */}
            {mode === "request-pending" && (
              <div className="space-y-5 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-lg">Waiting for admin approval</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your request has been sent. An administrator will review and approve or deny your access.
                    </p>
                  </div>
                </div>

                <div className={cn("rounded-xl px-4 py-3 text-sm flex items-center gap-3", isLight ? "bg-gray-50 border border-gray-200" : "bg-white/5 border border-white/10")}>
                  <Clock className={cn("w-4 h-4 shrink-0", isLight ? "text-gray-400" : "text-muted-foreground")} />
                  <span className={cn(isLight ? "text-gray-600" : "text-muted-foreground")}>
                    This page checks for approval automatically. You'll be logged in the moment an admin allows it.
                  </span>
                </div>

                <button
                  type="button" onClick={() => { goMode("sms-otp"); setRequestId(""); }}
                  className={cn("w-full text-xs transition-colors", isLight ? "text-gray-400 hover:text-gray-700" : "text-muted-foreground hover:text-foreground")}
                >
                  Cancel and go back
                </button>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>
    </div>
  );
}
