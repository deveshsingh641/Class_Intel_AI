import { type Express } from "express";
import { type Server } from "http";
import { storage } from "../storage";
import authRouter from "./auth";
import teachersRouter from "./teachers";
import doubtsRouter from "./doubts";
import quizzesRouter from "./quizzes";
import attendanceRouter from "./attendance";
import studyGroupsRouter from "./study-groups";
import analyticsRouter from "./analytics";
import feedbackRouter from "./feedback";
import academicServicesRouter from "./academic-services";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Global Health Check
  app.get("/api/health", async (_req, res) => {
    try {
      await storage.getTeachers();
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        mongodb: "connected",
        uptime: process.uptime(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Health check failed:", message);
      res.status(503).json({
        status: "error",
        timestamp: new Date().toISOString(),
        mongodb: "disconnected",
        error: message,
      });
    }
  });

  // Mount all modular domain routers
  app.use("/api", authRouter);
  app.use("/api", teachersRouter);
  app.use("/api", doubtsRouter);
  app.use("/api", quizzesRouter);
  app.use("/api", attendanceRouter);
  app.use("/api", studyGroupsRouter);
  app.use("/api", analyticsRouter);
  app.use("/api", feedbackRouter);
  app.use("/api", academicServicesRouter);

  return httpServer;
}
export type { AuthRequest } from "./common";
