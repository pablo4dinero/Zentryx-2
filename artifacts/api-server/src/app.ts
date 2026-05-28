import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Express is behind Render's load balancer. `trust proxy` lets
// express-rate-limit see the real client IP from X-Forwarded-For so we
// rate-limit per user, not per LB instance.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── Security headers (helmet) ──────────────────────────────────────────
// CSP is loose-ish because the React app uses inline styles + data URIs +
// pulls images from external news sources. Tighten in Phase 1 once
// every external host is enumerated.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "media-src": ["'self'", "blob:"],
      "connect-src": [
        "'self'",
        "https://api.exchangerate-api.com",
        "https://newsapi.org",
        "https://api.anthropic.com",
      ],
      "frame-ancestors": ["'none'"],
      "object-src": ["'none'"],
    },
  },
  // HSTS only meaningful behind HTTPS — Render terminates TLS so it's safe
  // to assert. Excludes subdomains because the marketing site (if any)
  // may not be HTTPS yet.
  hsts: { maxAge: 31536000, includeSubDomains: false, preload: false },
  // Allow PWA install / service worker cross-origin policy
  crossOriginEmbedderPolicy: false,
}));

// ── Permissions-Policy ─────────────────────────────────────────────────
// Explicitly grant THIS origin access to the camera, microphone and
// autoplay so WebRTC voice/video calls can prompt for permission and play
// remote media — including inside the installed PWA on mobile, where a
// missing or over-restrictive policy silently blocks getUserMedia.
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), autoplay=(self)",
  );
  next();
});

// ── CORS allow-list ────────────────────────────────────────────────────
// `CORS_ORIGINS` is a comma-separated list of allowed origins set in env.
// Falls back to "*" only in dev so frontend localhost still works without
// extra config; production deploys must set this explicitly.
const corsOriginsEnv = process.env.CORS_ORIGINS || "";
const allowedOrigins = corsOriginsEnv
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const isProd = process.env.NODE_ENV === "production";
if (isProd && allowedOrigins.length === 0) {
  throw new Error("[security] CORS_ORIGINS must be set in production (e.g. https://zentryx.onrender.com)");
}
app.use(cors({
  origin: (origin, callback) => {
    // Server-to-server (no Origin header) is fine — e.g. curl, health checks.
    if (!origin) return callback(null, true);
    if (!isProd && allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`[cors] Origin not allowed: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ── Rate limiting ──────────────────────────────────────────────────────
// Global ceiling: 600 requests / 15 min / IP. Most endpoints will sit
// well below this. Auth-heavy endpoints get a tighter limiter below.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Slow down — try again in a few minutes." },
});
app.use("/api", globalLimiter);

// Stricter limiter on auth + export endpoints — brute-force / abuse hot
// spots. 20 requests / 15 min / IP is plenty for legitimate users.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: "TooManyRequests", message: "Too many attempts. Try again later." },
});
app.use("/api/auth/login", sensitiveLimiter);
app.use("/api/auth/verify-otp", sensitiveLimiter);
app.use("/api/auth/forgot-password", sensitiveLimiter);
app.use("/api/auth/reset-password", sensitiveLimiter);
app.use("/api/auth/signup", sensitiveLimiter);
app.use("/api/export-requests", sensitiveLimiter);

// API routes
app.use("/api", router);

// Serve frontend static files
const frontendPath = path.resolve(process.cwd(), "../../artifacts/rd-intelligence/dist");
app.use(express.static(frontendPath));

// All non-API routes serve the React app
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.resolve(frontendPath, "index.html"));
});

export default app;