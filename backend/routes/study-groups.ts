import { Router } from "express";
import { storage } from "../storage";
import {
  authenticateToken,
  requireRole,
  AuthRequest
} from "./common";

const router = Router();

router.get("/study-groups", async (_req, res) => {
  try {
    const groups = await storage.listStudyGroups();
    res.json(groups);
  } catch (error) {
    console.error("List study groups error:", error);
    res.status(500).json({ error: "Failed to list study groups" });
  }
});

router.get("/study-groups/my", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const groups = await storage.listMyStudyGroups(req.user!.id);
    res.json(groups);
  } catch (error) {
    console.error("List my study groups error:", error);
    res.status(500).json({ error: "Failed to list your study groups" });
  }
});

router.post("/study-groups", authenticateToken, requireRole("student", "teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const { name, description, subject, maxMembers, isPrivate, tags } = req.body as any;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }
    if (!subject || typeof subject !== "string" || !subject.trim()) {
      return res.status(400).json({ error: "Subject is required" });
    }

    const group = await storage.createStudyGroup({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      subject: subject.trim(),
      creatorId: req.user!.id,
      creatorName: req.user!.name,
      maxMembers: typeof maxMembers === "number" ? maxMembers : undefined,
      isPrivate: !!isPrivate,
      tags: Array.isArray(tags) ? tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim()) : [],
    });

    res.status(201).json(group);
  } catch (error) {
    console.error("Create study group error:", error);
    res.status(500).json({ error: "Failed to create study group" });
  }
});

router.post("/study-groups/:groupId/join", authenticateToken, requireRole("student", "teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const group = await storage.joinStudyGroup(req.params.groupId, {
      id: req.user!.id,
      name: req.user!.name,
    });
    res.json(group);
  } catch (error) {
    console.error("Join study group error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to join study group" });
  }
});

export default router;
