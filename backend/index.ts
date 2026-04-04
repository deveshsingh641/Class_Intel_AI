// Load environment variables FIRST
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (parent directory of backend/)
const envPath = path.resolve(__dirname, "..", ".env");
const isDev = process.env.NODE_ENV !== "production";
if (isDev) {
  console.log("Loading .env from:", envPath);
}
dotenv.config({ path: envPath });

if (isDev) {
  console.log("Loaded MONGODB_URI =", process.env.MONGODB_URI ? "set" : "missing");
  console.log("Loaded OPENAI_API_KEY =", process.env.OPENAI_API_KEY ? "set" : "missing");
  console.log("Loaded HF_API_TOKEN =", process.env.HF_API_TOKEN ? "set" : "missing");
}

import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import fs from "fs";
import { connectDb, disconnectDb } from "./db";

const app = express();
const httpServer = createServer(app);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDbWithRetry() {
  const isProduction = process.env.NODE_ENV === "production";
  let attempt = 0;
  let delayMs = 1000;

  while (true) {
    try {
      await connectDb();
      return;
    } catch (error) {
      attempt += 1;
      const message = error instanceof Error ? error.message : String(error);

      console.error("Database connection failed:", message);
      if (message.toLowerCase().includes("whitelist")) {
        console.error(
          "MongoDB Atlas is likely blocking this IP. Add your current public IP (or a CIDR range) to Atlas → Network Access → IP Access List.",
        );
      }

      if (isProduction) {
        throw error;
      }

      const waitForMs = Math.min(delayMs, 30000);
      console.log(`Retrying database connection in ${Math.ceil(waitForMs / 1000)}s...`);
      await sleep(waitForMs);
      delayMs = delayMs * 2;
    }
  }
}

const corsOrigin = process.env.CORS_ORIGIN;
const parsedOrigins = corsOrigin
  ? corsOrigin
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];

// Important: do NOT send `Access-Control-Allow-Origin: *` with `credentials: true`.
// Browsers will block it and surface as "Failed to fetch".
const allowAnyOrigin = parsedOrigins.length === 0 || parsedOrigins.includes("*");

app.use(
  cors({
    origin: allowAnyOrigin ? true : parsedOrigins,
    credentials: true,
  }),
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

if (process.env.NODE_ENV !== "production") {
  app.get("/", (_req, res) => {
    res.status(200).send("Backend is running. Frontend is served separately.");
  });
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (isDev && capturedJsonResponse) {
        const serialized = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${serialized.length > 2000 ? serialized.slice(0, 2000) + "…" : serialized}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await connectDbWithRetry();

    // Seed database only when explicitly enabled (avoid slowing down cold starts)
    const shouldSeed =
      process.env.NODE_ENV !== "production" ||
      process.env.SEED_ON_STARTUP === "true";
    if (shouldSeed) {
      try {
        const { seed } = await import("./seed");
        await seed();
      } catch (seedError) {
        console.warn("Database seeding failed or skipped:", seedError);
      }
    }

    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
    });

    // Serve built frontend from the same server in production
    if (process.env.NODE_ENV === "production") {
      const publicDir = path.resolve(process.cwd(), "dist", "public");
      const indexHtmlPath = path.join(publicDir, "index.html");
      if (fs.existsSync(publicDir) && fs.existsSync(indexHtmlPath)) {
        app.use(
          express.static(publicDir, {
            immutable: true,
            maxAge: "1y",
            index: false,
          }),
        );
        app.get("*", (_req, res) => {
          // HTML should not be cached aggressively so new deploys show up immediately
          res.setHeader("Cache-Control", "no-cache");
          res.sendFile(indexHtmlPath);
        });
      } else {
        log(`Frontend build not found at ${publicDir}`, "express");
      }
    }

    // Port selection:
    // - In production hosts (Render), `PORT` is required.
    // - In local dev, `PORT` is often used for the frontend dev server, so the backend
    //   should prefer `BACKEND_PORT` to avoid collisions.
    const isProduction = process.env.NODE_ENV === "production";
    const desiredPort = parseInt(
      (isProduction ? process.env.PORT : undefined) ||
        process.env.BACKEND_PORT ||
        process.env.PORT ||
        "5001",
      10,
    );

    httpServer.on("error", (err: any) => {
      if (err?.code === "EADDRINUSE") {
        console.error(
          `Backend port ${desiredPort} is already in use. Stop the process using it, or change BACKEND_PORT, then re-run npm run dev.`,
        );
        process.exit(1);
      }
      throw err;
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(desiredPort, "0.0.0.0", () => resolve());
    });

    const url = `http://localhost:${desiredPort}`;
    log(`serving on port ${desiredPort}`);
    console.log("");
    console.log("╔══════════════════════════════════════╗");
    console.log("║   🧠 ClassIntel AI is running!       ║");
    console.log(`║   Open: ${url.padEnd(25)} ║`);
    console.log("╚══════════════════════════════════════╝");
    console.log("");
    console.log(`🌐 Server URL: ${url}`);
    console.log(`📝 Open this link in your browser: ${url}`);
    console.log("");
  } catch (error) {
    console.error("Fatal server error:", error);
    await disconnectDb().catch(() => {});
    process.exit(1);
  }
})();
