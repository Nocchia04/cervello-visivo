import jwt from "jsonwebtoken";
import type { Request } from "express";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "cervello-visivo-dev-secret";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function extractTokenFromRequest(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

export function getUserFromToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
