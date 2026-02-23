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

export async function connectDb() {
  if (isConnected) return;

  const attemptedUris: string[] = [];
  if (MONGODB_URI) {
    attemptedUris.push(MONGODB_URI);
  }
  if (LOCAL_MONGODB_URI && LOCAL_MONGODB_URI !== MONGODB_URI) {
    attemptedUris.push(LOCAL_MONGODB_URI);
  }

  if (attemptedUris.length === 0) {
    throw new Error("MONGODB_URI must be set. Did you forget to provision a MongoDB database?");
  }

  let lastError: unknown;

  for (let index = 0; index < attemptedUris.length; index += 1) {
    const uri = attemptedUris[index];
    try {
      await mongoose.connect(uri, {
        dbName: process.env.MONGODB_DB || undefined,
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
