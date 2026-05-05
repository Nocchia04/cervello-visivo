import jwt from "jsonwebtoken";
import type { Request } from "express";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Token speciale di sola lettura associato a un cantiere condiviso.
 * Estratto dall'header `Authorization: ShareLink <token>`.
 */
export interface ShareLinkAuth {
  kind: "share";
  token: string;
}

export type AuthHeader =
  | { kind: "bearer"; token: string }
  | ShareLinkAuth
  | null;

const JWT_SECRET = process.env.JWT_SECRET || "cervello-visivo-dev-secret";

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Riconosce 2 schemi:
 *   - `Authorization: Bearer <jwt>`         → user JWT (admin / capo cantiere)
 *   - `Authorization: ShareLink <token>`    → link di sola lettura su un cantiere
 */
export function extractAuthHeader(req: Request): AuthHeader {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (!token) return null;
  if (scheme === "Bearer") return { kind: "bearer", token };
  if (scheme === "ShareLink") return { kind: "share", token };
  return null;
}

// Backwards-compat helper used in older callsites
export function extractTokenFromRequest(req: Request): string | null {
  const a = extractAuthHeader(req);
  return a?.kind === "bearer" ? a.token : null;
}

export function getUserFromToken(token: string | null): JwtPayload | null {
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}
