// Load environment variables FIRST
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

dotenv.config();
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });
}

// Primary URI (may be undefined if only local MongoDB is available)
const MONGODB_URI = process.env.MONGODB_URI || "";

const LOCAL_MONGODB_URI =
  process.env.MONGODB_URI_LOCAL ||
  process.env.LOCAL_MONGODB_URI ||
  "mongodb://127.0.0.1:27017/lecture_feedback_system";

let isConnected = false;

function parsePositiveInt(value: unknown, fallback: number) {
  const n = typeof value === "string" ? parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

// Prevent Mongoose from buffering queries when the database is down.
// Buffering makes requests (like login/health checks) hang for ~30s+.
mongoose.set("bufferCommands", false);
mongoose.set("bufferTimeoutMS", 0);

export async function connectDb() {
  if (isConnected) return;

  const isProduction = process.env.NODE_ENV === "production";

  // In production, never fall back to a local MongoDB instance.
  // Hosts like Render/Vercel won't have one, and it hides the real issue (missing env var / Atlas access).
  if (isProduction && !process.env.MONGODB_URI) {
    throw new Error(
      "MONGODB_URI must be set in production. Add it to your hosting provider environment variables (and ensure MongoDB Atlas Network Access allows your host).",
    );
  }

  const attemptedUris: string[] = [];
  if (MONGODB_URI) {
    attemptedUris.push(MONGODB_URI);
  }
  if (!isProduction && LOCAL_MONGODB_URI && LOCAL_MONGODB_URI !== MONGODB_URI) {
    attemptedUris.push(LOCAL_MONGODB_URI);
  }

  if (attemptedUris.length === 0) {
    throw new Error("MONGODB_URI must be set. Did you forget to provision a MongoDB database?");
  }

  let lastError: unknown;

  for (let index = 0; index < attemptedUris.length; index += 1) {
    const uri = attemptedUris[index];
    try {
      const serverSelectionTimeoutMS = parsePositiveInt(
        process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        isProduction ? 15000 : 5000,
      );
      const connectTimeoutMS = parsePositiveInt(
        process.env.MONGODB_CONNECT_TIMEOUT_MS,
        isProduction ? 15000 : 5000,
      );
      const socketTimeoutMS = parsePositiveInt(
        process.env.MONGODB_SOCKET_TIMEOUT_MS,
        45000,
      );

      await mongoose.connect(uri, {
        dbName: process.env.MONGODB_DB || undefined,
        serverSelectionTimeoutMS,
        connectTimeoutMS,
        socketTimeoutMS,
      });
      isConnected = true;

      const isFallback = index > 0;
      if (isFallback) {
        console.warn(
          "[db] Connected using local fallback MongoDB URI. Atlas may be blocked by IP whitelist.",
        );
      }

      return;
    } catch (error) {
      lastError = error;

      const tryingFallbackNext = index < attemptedUris.length - 1;
      if (tryingFallbackNext) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[db] Primary MongoDB connection failed (${message}). Trying local MongoDB fallback...`,
        );
      }
    }
  }

  throw lastError;
}

export async function disconnectDb() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}
