import { useState, useRef } from "react";
import { Download, Upload, ShieldAlert, CheckCircle2, XCircle, Loader2, DatabaseBackup, RefreshCw, KeyRound } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;

function getToken() {
  return localStorage.getItem("rd_token") ?? "";
}

type TotpIntent = "backup" | "restore";

interface TotpModal {
  open: boolean;
  intent: TotpIntent | null;
  code: string;
  error: string;
  loading: boolean;
}

export function BackupTab() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [totp, setTotp] = useState<TotpModal>({ open: false, intent: null, code: "", error: "", loading: false });

  // ── TOTP modal helpers ──────────────────────────────────────────────────────
  const openTotp = (intent: TotpIntent) =>
    setTotp({ open: true, intent, code: "", error: "", loading: false });

  const closeTotp = () =>
    setTotp({ open: false, intent: null, code: "", error: "", loading: false });

  const handleTotpSubmit = async () => {
    if (totp.code.length !== 6) {
      setTotp(p => ({ ...p, error: "Enter the 6-digit code from your authenticator app." }));
      return;
    }
    if (totp.intent === "backup") {
      closeTotp();
      await runDownload(totp.code);
    } else if (totp.intent === "restore") {
      closeTotp();
      setConfirmOpen(true);
    }
  };

  // ── Download ────────────────────────────────────────────────────────────────
  const runDownload = async (totpCode: string) => {
    setDownloading(true);
    setDownloadDone(false);
    try {
      const res = await fetch(`${BASE}api/backup/download`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "x-totp-code": totpCode,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "TOTP_INVALID") {
          alert("Invalid authenticator code. Please try again.");
        } else {
          alert(`Backup failed: ${data.error ?? "Unknown error"}`);
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zentryx-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 4000);
    } catch (err) {
      alert(`Backup failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setDownloading(false);
    }
  };

  // ── Restore ─────────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setRestoreResult(null);
  };

  const handleRestoreConfirmed = async () => {
    if (!selectedFile) return;
    setConfirmOpen(false);
    setRestoring(true);
    setRestoreResult(null);
    // The TOTP code was captured in the modal; we re-open modal to get a fresh
    // code right before the confirmed restore fires.
    try {
      const text = await selectedFile.text();
      let backup: any;
      try {
        backup = JSON.parse(text);
      } catch {
        setRestoreResult({ ok: false, message: "The selected file is not valid JSON." });
        return;
      }

      // Prompt for a fresh TOTP code at the moment of actual restore
      const code = await promptTotpForRestore();
      if (!code) {
        setRestoreResult({ ok: false, message: "Restore cancelled — authenticator code not provided." });
        return;
      }

      const res = await fetch(`${BASE}api/backup/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
          "x-totp-code": code,
        },
        body: JSON.stringify(backup),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "TOTP_INVALID") {
          setRestoreResult({ ok: false, message: "Invalid authenticator code. Restore was not performed." });
        } else {
          setRestoreResult({ ok: false, message: data.error ?? "Restore failed." });
        }
      } else {
        setRestoreResult({ ok: true, message: data.message ?? "Restore complete." });
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch (err) {
      setRestoreResult({ ok: false, message: err instanceof Error ? err.message : "Network error." });
    } finally {
      setRestoring(false);
    }
  };

  // Small helper: shows the TOTP modal and resolves when the user submits or
  // cancels, returning the code string or null.
  const [restoreTotpResolve, setRestoreTotpResolve] = useState<((v: string | null) => void) | null>(null);
  const [restoreTotpModal, setRestoreTotpModal] = useState({ open: false, code: "", error: "" });

  const promptTotpForRestore = (): Promise<string | null> => {
    return new Promise(resolve => {
      setRestoreTotpModal({ open: true, code: "", error: "" });
      setRestoreTotpResolve(() => resolve);
    });
  };

  const submitRestoreTotp = () => {
    if (restoreTotpModal.code.length !== 6) {
      setRestoreTotpModal(p => ({ ...p, error: "Enter the 6-digit code from your authenticator app." }));
      return;
    }
    const code = restoreTotpModal.code;
    setRestoreTotpModal({ open: false, code: "", error: "" });
    restoreTotpResolve?.(code);
    setRestoreTotpResolve(null);
  };

  const cancelRestoreTotp = () => {
    setRestoreTotpModal({ open: false, code: "", error: "" });
    restoreTotpResolve?.(null);
    setRestoreTotpResolve(null);
  };

  const card = cn(
    "rounded-2xl border p-6",
    isLight ? "bg-white border-slate-200" : "bg-white/5 border-white/10"
  );
  const label = cn("text-sm font-medium", isLight ? "text-gray-700" : "text-foreground");
  const muted = cn("text-xs", isLight ? "text-gray-500" : "text-muted-foreground");

  const modalBase = cn(
    "w-full max-w-sm rounded-2xl border p-6 space-y-4 shadow-2xl",
    isLight ? "bg-white border-slate-200" : "bg-[#1a1d2e] border-white/10"
  );

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h2 className={cn("text-lg font-semibold flex items-center gap-2", isLight ? "text-gray-900" : "text-foreground")}>
          <DatabaseBackup className="w-5 h-5 text-primary" />
          Backup & Restore
        </h2>
        <p className={cn("mt-1 text-sm", isLight ? "text-gray-500" : "text-muted-foreground")}>
          Download a complete snapshot of every table in Zentryx, or upload a previous backup to fully restore the application to that state.
        </p>
      </div>

      {/* ── Backup section ─────────────────────────────────────────────────── */}
      <div className={card}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={label}>Backup All Data</p>
            <p className={cn("mt-1 text-xs", isLight ? "text-gray-500" : "text-muted-foreground")}>
              Downloads a single <strong>.json</strong> file containing every table —
              projects, tasks, users, procurement, MDP, sales force, chat, and more.
              Store it somewhere safe. You can re-upload it at any time to roll back the application to this exact state.
            </p>
          </div>
          <button
            onClick={() => openTotp("backup")}
            disabled={downloading}
            className={cn(
              "shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              "bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
            )}
          >
            {downloading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
              : downloadDone
              ? <><CheckCircle2 className="w-4 h-4" /> Downloaded</>
              : <><Download className="w-4 h-4" /> Download Backup</>
            }
          </button>
        </div>
      </div>

      {/* ── Restore section ────────────────────────────────────────────────── */}
      <div className={cn(card, "space-y-4")}>
        <div>
          <p className={label}>Restore from Backup</p>
          <p className={muted}>
            Upload a Zentryx backup file to overwrite all current data with the snapshot.
            This cannot be undone — take a fresh backup first if you want to keep your current state.
          </p>
        </div>

        {/* Warning banner */}
        <div className={cn(
          "flex items-start gap-3 rounded-xl border px-4 py-3",
          isLight ? "border-red-200 bg-red-50" : "border-red-500/20 bg-red-500/10"
        )}>
          <ShieldAlert className={cn("w-4 h-4 mt-0.5 shrink-0", isLight ? "text-red-600" : "text-red-400")} />
          <p className={cn("text-xs leading-relaxed", isLight ? "text-red-700" : "text-red-300")}>
            <strong>This will erase every row in the database and replace it with the backup contents.</strong>{" "}
            All current projects, users, tasks, and records will be permanently replaced.
            Make sure the file you are uploading is the correct backup for this environment.
          </p>
        </div>

        {/* File picker */}
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
            id="backup-file-input"
          />
          <label
            htmlFor="backup-file-input"
            className={cn(
              "cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
              isLight
                ? "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
            )}
          >
            <Upload className="w-4 h-4" />
            {selectedFile ? "Change file" : "Choose backup file"}
          </label>
          {selectedFile && (
            <span className={cn("text-sm truncate max-w-xs", isLight ? "text-gray-700" : "text-foreground")}>
              {selectedFile.name}
              <span className={cn("ml-1 text-xs", isLight ? "text-gray-400" : "text-muted-foreground")}>
                ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </span>
          )}
        </div>

        {/* Restore button */}
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!selectedFile || restoring}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
            selectedFile && !restoring
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-red-600/40 text-white/50 cursor-not-allowed"
          )}
        >
          {restoring
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Restoring…</>
            : <><RefreshCw className="w-4 h-4" /> Restore Database</>
          }
        </button>

        {/* Result banner */}
        {restoreResult && (
          <div className={cn(
            "flex items-start gap-3 rounded-xl border px-4 py-3",
            restoreResult.ok
              ? isLight ? "border-green-200 bg-green-50" : "border-green-500/20 bg-green-500/10"
              : isLight ? "border-red-200 bg-red-50" : "border-red-500/20 bg-red-500/10"
          )}>
            {restoreResult.ok
              ? <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", isLight ? "text-green-600" : "text-green-400")} />
              : <XCircle className={cn("w-4 h-4 mt-0.5 shrink-0", isLight ? "text-red-600" : "text-red-400")} />
            }
            <p className={cn("text-xs leading-relaxed", restoreResult.ok
              ? isLight ? "text-green-700" : "text-green-300"
              : isLight ? "text-red-700" : "text-red-300"
            )}>
              {restoreResult.message}
              {restoreResult.ok && " Reload the page to see the restored data."}
            </p>
          </div>
        )}
      </div>

      {/* ── Confirmation dialog ────────────────────────────────────────────── */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={cn("w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl", isLight ? "bg-white border-slate-200" : "bg-[#1a1d2e] border-white/10")}>
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isLight ? "bg-red-100" : "bg-red-500/20")}>
                <ShieldAlert className={cn("w-5 h-5", isLight ? "text-red-600" : "text-red-400")} />
              </div>
              <div>
                <p className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Confirm Database Restore</p>
                <p className={cn("text-xs mt-0.5", isLight ? "text-gray-500" : "text-muted-foreground")}>This action cannot be undone.</p>
              </div>
            </div>
            <p className={cn("text-sm leading-relaxed", isLight ? "text-gray-700" : "text-muted-foreground")}>
              You are about to replace <strong>all current data</strong> in Zentryx with the contents of{" "}
              <strong className={isLight ? "text-gray-900" : "text-foreground"}>{selectedFile?.name}</strong>.
              Every table will be wiped and reloaded from this file.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className={cn(
                  "flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                  isLight ? "border-slate-200 text-gray-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleRestoreConfirmed}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all"
              >
                Yes, Restore Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOTP modal for Backup ──────────────────────────────────────────── */}
      {totp.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={modalBase}>
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isLight ? "bg-primary/10" : "bg-primary/20")}>
                <KeyRound className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>
                  Verify Identity
                </p>
                <p className={cn("text-xs mt-0.5", isLight ? "text-gray-500" : "text-muted-foreground")}>
                  {totp.intent === "backup" ? "Required before downloading the backup." : "Required before restoring the database."}
                </p>
              </div>
            </div>

            <p className={cn("text-sm", isLight ? "text-gray-600" : "text-muted-foreground")}>
              Enter the 6-digit code from your authenticator app to continue.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={totp.code}
              onChange={e => setTotp(p => ({ ...p, code: e.target.value.replace(/\D/g, "").slice(0, 6), error: "" }))}
              onKeyDown={e => { if (e.key === "Enter") handleTotpSubmit(); }}
              autoFocus
              className={cn(
                "w-full px-4 py-3 rounded-xl border text-center text-2xl font-mono tracking-[0.5em] outline-none transition-colors",
                isLight
                  ? "border-slate-200 bg-slate-50 text-gray-900 focus:border-primary"
                  : "border-white/10 bg-white/5 text-foreground focus:border-primary"
              )}
            />

            {totp.error && (
              <p className={cn("text-xs", isLight ? "text-red-600" : "text-red-400")}>{totp.error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeTotp}
                className={cn(
                  "flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                  isLight ? "border-slate-200 text-gray-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
                )}
              >
                Cancel
              </button>
              <button
                onClick={handleTotpSubmit}
                disabled={totp.code.length !== 6}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-all"
              >
                Verify & Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOTP modal for Restore (shown after confirmation) ─────────────── */}
      {restoreTotpModal.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className={modalBase}>
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", isLight ? "bg-red-100" : "bg-red-500/20")}>
                <KeyRound className={cn("w-5 h-5", isLight ? "text-red-600" : "text-red-400")} />
              </div>
              <div>
                <p className={cn("font-semibold", isLight ? "text-gray-900" : "text-foreground")}>Final Verification</p>
                <p className={cn("text-xs mt-0.5", isLight ? "text-gray-500" : "text-muted-foreground")}>
                  One last step before the database is restored.
                </p>
              </div>
            </div>

            <p className={cn("text-sm", isLight ? "text-gray-600" : "text-muted-foreground")}>
              Enter your current authenticator app code to confirm the restore.
            </p>

            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={restoreTotpModal.code}
              onChange={e => setRestoreTotpModal(p => ({ ...p, code: e.target.value.replace(/\D/g, "").slice(0, 6), error: "" }))}
              onKeyDown={e => { if (e.key === "Enter") submitRestoreTotp(); }}
              autoFocus
              className={cn(
                "w-full px-4 py-3 rounded-xl border text-center text-2xl font-mono tracking-[0.5em] outline-none transition-colors",
                isLight
                  ? "border-slate-200 bg-slate-50 text-gray-900 focus:border-red-500"
                  : "border-white/10 bg-white/5 text-foreground focus:border-red-500"
              )}
            />

            {restoreTotpModal.error && (
              <p className={cn("text-xs", isLight ? "text-red-600" : "text-red-400")}>{restoreTotpModal.error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={cancelRestoreTotp}
                className={cn(
                  "flex-1 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                  isLight ? "border-slate-200 text-gray-700 hover:bg-slate-50" : "border-white/10 text-muted-foreground hover:bg-white/5"
                )}
              >
                Cancel
              </button>
              <button
                onClick={submitRestoreTotp}
                disabled={restoreTotpModal.code.length !== 6}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-all"
              >
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
