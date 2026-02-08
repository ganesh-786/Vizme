// src/controllers/auth.controller.ts
import { Request, Response } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service.js";

const signupSchema = z.object({
  email: z.email({ error: "Invalid email" }),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

const signinSchema = z.object({
  email: z.email({ error: "Invalid email" }),
  password: z.string().min(8, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

const REFRESH_TOKEN_COOKIE = "refresh_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/api/v1/auth",
};

export async function signup(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    const data = signupSchema.parse(req.body);
    const result = await authService.signup(data);

    // Set refresh token as httpOnly cookie
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);

    // Return response without exposing refreshToken in body
    const { refreshToken: _, ...safeResult } = result;
    res.status(201).json({
      data: safeResult,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error.message === "Email already registered") {
      return res.status(409).json({ error: error.message });
    }
    console.error("Signup error:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function signin(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    const data = signinSchema.parse(req.body);
    const result = await authService.signin(data);

    // Set refresh token as httpOnly cookie
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);

    // Return response without exposing refreshToken in body
    const { refreshToken: _, ...safeResult } = result;
    res.json({
      data: safeResult,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error.message === "Invalid email or password") {
      return res.status(401).json({ error: error.message });
    }
    console.error("Signin error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

export async function refresh(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    const result = await authService.refresh(refreshToken);
    res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, COOKIE_OPTIONS);
    const { refreshToken: _, ...safeResult } = result;
    res.json({ data: safeResult });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (
      error.message.includes("Invalid") ||
      error.message.includes("expired")
    ) {
      return res
        .status(401)
        .json({ error: "Session expired. Please login again." });
    }
    console.error("Refresh error:", error);
    res.status(500).json({ error: "Failed to refresh session" });
  }
}

export async function logout(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    // Try cookie first, then body
    const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    // Clear the cookie
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" });
    res.json({ message: "Logged out successfully" });
  } catch {
    // Clear cookie even on error
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" });
    res.json({ message: "Logged out successfully" });
  }
}

export async function logoutAll(
  req: Request,
  res: Response,
): Promise<void | Response> {
  try {
    if (!req.user?.sub) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await authService.logoutAll(req.user.sub);

    // Clear the current session cookie
    res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/api/v1/auth" });
    res.json({ message: "Logged out from all devices successfully" });
  } catch (error) {
    console.error("LogoutAll error:", error);
    res.status(500).json({ error: "Failed to logout from all devices" });
  }
}

export async function me(req: Request, res: Response) {
  res.json({
    data: {
      id: req.user?.sub,
      email: req.user?.email,
      name: req.user?.name,
      tenantId: req.tenantId,
    },
  });
}
