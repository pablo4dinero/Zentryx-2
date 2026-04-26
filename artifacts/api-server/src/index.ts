import app from "./app";
import { logger } from "./lib/logger";
import express from "express";
import path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Serve frontend static files from rd-intelligence/dist
const frontendDist = path.join(__dirname, "../../rd-intelligence/dist");
app.use(express.static(frontendDist));

// Fallback to index.html for SPA routes
app.use((_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
