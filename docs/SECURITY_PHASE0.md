# Phase 0 — Stop-the-bleeding security hardening

This is the runbook for the immediate security work that landed alongside this commit. Phase 0 covers six items the IT head flagged as **blockers before go-live**. Code changes are already in; the operational steps below are what you (the operator) must do.

## What changed in code

| Area | Change | File |
|------|--------|------|
| JWT secret | Removed hard-coded fallback. Server throws at boot if `JWT_SECRET` is missing or shorter than 32 chars. | `artifacts/api-server/src/lib/auth.ts` |
| OTP entropy | Switched from `Math.random()` to `crypto.randomInt` (CSPRNG). Added 5-attempt lockout. | `artifacts/api-server/src/lib/otp.ts` |
| OTP persistence | Replaced in-memory `Map` with a Postgres `otp_codes` table (`unique(email, purpose)`). Codes survive restarts and work across instances. | `lib/db/src/schema/otp_codes.ts`, `artifacts/api-server/src/lib/otp.ts` |
| Security headers | Added `helmet` with CSP, HSTS, frame-ancestors none, object-src none. | `artifacts/api-server/src/app.ts` |
| Rate limiting | Global 600 req / 15 min / IP. Stricter 20 req / 15 min / IP on `/auth/*` and `/export-requests`. | `artifacts/api-server/src/app.ts` |
| CORS | Explicit allow-list from `CORS_ORIGINS` env var. Production deploys **refuse to boot** with no CORS configuration. | `artifacts/api-server/src/app.ts` |
| Object storage | Chat uploads now stream to **Cloudflare R2** (S3-compatible) via the AWS SDK. Files are private; the download endpoint mints fresh 1-hour signed URLs and 302s the client. Local disk is no longer touched. MIME-type allow-list + 2 MB cap on upload. | `artifacts/api-server/src/lib/r2.ts`, `artifacts/api-server/src/routes/chat.ts` |
| Body size | Already 15 MB cap on JSON / urlencoded. No change. | `artifacts/api-server/src/app.ts` |
| 17 MB checked-in chat content | Untracked via `git rm --cached`. Files still on disk locally; history scrub pending (see below). | `.gitignore` |

## Operator action items

### 1. Install new dependencies

```bash
cd artifacts/api-server
pnpm install        # picks up helmet + express-rate-limit
```

### 2. Rotate the JWT secret (NEW SECRET — old tokens become invalid)

Generate a fresh secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Set it in **Render → Environment** as `JWT_SECRET`. Trigger a redeploy. Every existing user will be logged out and must sign in again — coordinate with Freddy Hirsch IT before doing this in prod.

### 3. Set the CORS allow-list

Render env var `CORS_ORIGINS` — comma-separated. Examples:

- Single hostname: `CORS_ORIGINS=https://zentryx.onrender.com`
- Multiple: `CORS_ORIGINS=https://zentryx.onrender.com,https://app.zentryx.com`

If this is empty in production the server refuses to boot — that's intentional.

### 4. Set `NODE_ENV=production`

Render → Environment → `NODE_ENV=production`. This switches the boot guard from "warn" to "fail" on the CORS config and HSTS asserts itself.

### 5. Set Cloudflare R2 credentials

Chat uploads now stream to Cloudflare R2 (zero egress fees, S3-compatible). Set the following env vars in **Render → Environment**:

| Var | Value |
|-----|-------|
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | The bucket name (e.g. `zentryx-uploads`) |

The bucket should be **private** — files are served via short-lived signed URLs minted by the API, not via R2 public-bucket access.

> ⚠️ R2 keys grant write access to your bucket. Anyone with them can upload arbitrary content and rack up Cloudflare bills. Never commit them, never paste them into chat or pull-request descriptions. If you suspect a key has leaked, **rotate it immediately** in the Cloudflare dashboard → R2 → Manage API Tokens.

> ⚠️ Render's temporary filesystem is wiped on every deploy. Since uploads no longer touch local disk, this is no longer a data-loss risk — just keep R2 credentials valid.

### 6. Purge the 17 MB of chat content from git history

The files are untracked now, but git history still holds them. Anyone who clones the repo today still gets those blobs. The fix is a history rewrite.

**Single-operator path (you're the only contributor — easiest):**

```bash
# 1. Install git-filter-repo (one time):
pip install git-filter-repo

# 2. Make a clean clone to work in (do NOT do this in your working repo):
git clone --no-local /path/to/Zentryx-2-master /tmp/zentryx-purge
cd /tmp/zentryx-purge

# 3. Run the filter — removes the entire uploads tree from every commit:
git filter-repo --path artifacts/api-server/uploads/ --invert-paths

# 4. Inspect: history should now be smaller, blobs gone:
git log --oneline | wc -l    # commit count preserved
du -sh .git                   # noticeably smaller

# 5. Force-push to GitHub:
git remote add origin https://github.com/<your-handle>/Zentryx-2.git
git push origin --force --all
git push origin --force --tags

# 6. Have GitHub garbage-collect the dangling commits:
#    Open a ticket: https://support.github.com/contact
#    Title: "Please force-GC private repo after history rewrite"
#    Body: include repo URL and confirm you've already force-pushed
#    They typically respond in 24-48h.

# 7. Back in your working copy:
cd /path/to/Zentryx-2-master
git fetch origin
git reset --hard origin/master
```

> ⚠️ **This invalidates every existing clone.** Since you're the only contributor right now, just delete your local copy and re-clone after the rewrite. Don't push from the old working tree — you'll restore the deleted history.

### 7. Audit & rotate

The 17 chat files were on a private repo, but treat them as **potentially leaked** because:
- The repo's `private` flag is one mis-click from `public`
- Anyone you added as a collaborator (even briefly) still has a local clone
- GitHub's backups + caches keep blobs accessible by SHA for ~90 days even after rewrite

Action: open each chat file, note what it contains, and:
- If any **credentials, tokens, or passwords** appear in transcripts: rotate them now.
- If any **customer / employee PII** is in the images: log this in your incident register; you may have a notification obligation under NDPR depending on what was captured.
- If any **NDA'd content** (formulas, supplier prices): inform the data owner.

## Verification checklist

After deploying:

- [ ] `GET /api/health` returns 200
- [ ] Hitting `/api/auth/login` 21 times in 15 min returns 429 on the 21st
- [ ] Response headers include `content-security-policy`, `strict-transport-security`, `x-content-type-options: nosniff`
- [ ] Requests from a non-allow-listed origin are rejected with CORS error in browser console
- [ ] Sending a fresh OTP creates a row in `otp_codes`; verifying it deletes the row
- [ ] Failed verify increments `attempts`; sixth attempt returns `locked`
- [ ] Server fails to start when `JWT_SECRET` env var is unset
- [ ] Server in production mode (`NODE_ENV=production`) fails to start when `CORS_ORIGINS` is empty
- [ ] `git log -- artifacts/api-server/uploads/` returns nothing after history purge

## What's NOT yet done (Phase 1 onwards)

- ❌ Mandatory MFA for privileged roles (TOTP via authenticator app)
- ❌ SSO (OIDC for Google Workspace / Azure AD)
- ❌ Refresh-token rotation, shorter access-token lifetime
- ✅ ~~Object-storage migration~~ — done (Cloudflare R2 + signed URLs, see section 5)
- ❌ Antivirus scan on uploads
- ❌ Encryption-at-rest for sensitive columns (pricing, customer contact)
- ❌ Data-classification matrix
- ❌ Vendor-risk register
- ❌ IP & confidentiality agreement with Freddy Hirsch

Track these in the Phase 1 plan.
