import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import fs from "fs";
import { connectDb, disconnectDb } from "./db";
import { storage } from "./storage";
import https from "https";
import http from "http";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = path.resolve(__dirname, "..", ".env");
const isDev = process.env.NODE_ENV !== "production";
dotenv.config({ path: envPath });

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

      console.error("[server] Database connection failed:", message);
      if (isProduction) {
        throw error;
      }

      const waitForMs = Math.min(delayMs, 30000);
      console.log(`[server] Retrying connection in ${Math.ceil(waitForMs / 1000)}s...`);
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

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const isAllowed =
        parsedOrigins.length === 0 ||
        parsedOrigins.includes("*") ||
        parsedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app") ||
        origin.endsWith(".onrender.com") ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`[cors] Blocked origin: ${origin}`);
        callback(null, false);
      }
    },
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

if (isDev) {
  app.get("/", (_req, res) => {
    res.status(200).send("Backend server is active.");
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

    // Attempt database seeding on startup only if database hasn't been seeded yet (or forced)
    try {
      let shouldSeed = false;
      if (process.env.FORCE_SEED === "true") {
        shouldSeed = true;
      } else {
        try {
          const adminUser = await storage.getUserByEmail("admin@edu.com");
          if (!adminUser) {
            shouldSeed = true;
          }
        } catch (dbErr) {
          // If we fail to query the db, we seed it as a safe fallback
          shouldSeed = true;
        }
      }

      if (shouldSeed) {
        log("Database not seeded. Running database seeding...", "server");
        const { seed } = await import("./seed");
        await seed();
      } else {
        log("Database already seeded. Skipping startup seeding.", "server");
      }
    } catch (seedError) {
      console.warn("[server] Database seeding check/operation failed:", seedError);
    }


    await registerRoutes(httpServer, app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
    });

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
          res.setHeader("Cache-Control", "no-cache");
          res.sendFile(indexHtmlPath);
        });
      } else {
        log(`Frontend build folder not found at ${publicDir}`, "express");
      }
    }

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
          `[server] Port ${desiredPort} is already in use.`,
        );
        process.exit(1);
      }
      throw err;
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(desiredPort, "0.0.0.0", () => resolve());
    });

    log(`serving on port ${desiredPort}`);

    // Keep-alive ping mechanism for Render free tier (runs every 14 minutes)
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
      log(`Keep-alive pinger initialized targeting: ${renderUrl}`, "server");
      setInterval(() => {
        try {
          log(`Sending keep-alive ping to ${renderUrl}...`, "server");
          const client = renderUrl.startsWith("https") ? https : http;
          client.get(renderUrl, (res) => {
            log(`Keep-alive ping response status: ${res.statusCode}`, "server");
          }).on("error", (err) => {
            console.warn("[server] Keep-alive ping error:", err.message);
          });
        } catch (pingError) {
          console.warn("[server] Keep-alive ping exception:", pingError);
        }
      }, 14 * 60 * 1000); // 14 minutes
    } else {
      log("RENDER_EXTERNAL_URL is not set. Skipping keep-alive pinger.", "server");
    }
  } catch (error) {
    console.error("[server] Fatal server error:", error);
    await disconnectDb().catch(() => {});
    process.exit(1);
  }
})();
