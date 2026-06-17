import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { storage } from "../storage";
import { signupSchema, loginSchema } from "@shared/schema";
import {
  authenticateToken,
  requireRole,
  AuthRequest,
  JWT_SECRET,
  revokedTokenJtis,
  authRateLimiter
} from "./common";

const router = Router();

router.post("/auth/signup", authRateLimiter, async (req, res) => {
  try {
    const data = signupSchema.parse(req.body);
    
    const existingUser = await storage.getUserByEmail(data.email);
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const user = await storage.createUser({
      ...data,
      username: data.email.split("@")[0],
    });

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, jti },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.post("/auth/login", authRateLimiter, async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    
    const user = await storage.getUserByEmail(data.email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const jti = crypto.randomUUID();
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, jti },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await storage.getUser(req.user!.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      department: user.department,
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.post("/auth/logout", authenticateToken, async (req: AuthRequest, res) => {
  const jti = req.tokenJti;
  const exp = req.tokenExp;
  if (!jti || !exp) {
    return res.json({ ok: true });
  }
  const expiresAtMs = exp * 1000;
  revokedTokenJtis.set(jti, expiresAtMs);
  res.json({ ok: true });
});

router.post("/office/slots", authenticateToken, requireRole("teacher", "admin"), async (req: AuthRequest, res) => {
  try {
    const teacherRow =
      (await storage.getTeacher(req.user!.id)) ||
      (await storage.getTeacherByName(req.user!.name)) ||
      (await storage.getTeacherByLooseName(req.user!.name));
    if (!teacherRow) {
      return res.status(404).json({ error: "No teacher profile linked to your account" });
    }
    const { startTime, endTime } = req.body as { startTime?: string; endTime?: string };
    if (!startTime || !endTime) {
      return res.status(400).json({ error: "startTime and endTime are required" });
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: "Invalid time range" });
    }
    const slot = await storage.createOfficeSlot({ teacherId: teacherRow.id, startTime: start, endTime: end });
    res.status(201).json(slot);
  } catch (error) {
    console.error("Create office slot error:", error);
    res.status(500).json({ error: "Failed to create slot" });
  }
});

router.get("/office/slots/:teacherId", async (req, res) => {
  try {
    const slots = await storage.listOfficeSlots(req.params.teacherId);
    res.json(slots);
  } catch (error) {
    console.error("List slots error:", error);
    res.status(500).json({ error: "Failed to list slots" });
  }
});

router.post("/office/slots/:slotId/book", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const booking = await storage.bookOfficeSlot(req.params.slotId, req.user!.id);
    res.status(201).json(booking);
  } catch (error) {
    console.error("Book slot error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to book slot" });
  }
});

router.get("/office/bookings/my", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    const bookings = await storage.listMyBookings(req.user!.id);
    res.json(bookings);
  } catch (error) {
    console.error("List my bookings error:", error);
    res.status(500).json({ error: "Failed to list bookings" });
  }
});

router.post("/office/bookings/:bookingId/cancel", authenticateToken, requireRole("student"), async (req: AuthRequest, res) => {
  try {
    await storage.cancelBooking(req.params.bookingId, req.user!.id);
    res.json({ ok: true });
  } catch (error) {
    console.error("Cancel booking error:", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to cancel booking" });
  }
});

export default router;
