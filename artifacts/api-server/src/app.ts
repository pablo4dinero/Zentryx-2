import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

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

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// API routes
app.use("/api", router);

// Serve frontend static files
const frontendPath = path.resolve(process.cwd(), "artifacts/rd-intelligence/dist");
app.use(express.static(frontendPath));

// All non-API routes serve the React app
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.resolve(frontendPath, "index.html"));
});

export default app;