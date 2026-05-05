import { PrismaClient } from "@prisma/client";
import type { Request } from "express";
import {
  extractAuthHeader,
  getUserFromToken,
  type JwtPayload,
} from "./middleware/auth.js";

const prisma = new PrismaClient();

export interface GraphQLContext {
  prisma: PrismaClient;
  user: JwtPayload | null;
  /**
   * Se autenticati con un `ShareLink <token>` valido (non scaduto, non revocato),
   * contiene l'ID del cantiere accessibile in sola lettura.
   * Tutti i resolver di mutazione devono rifiutare se questo è popolato.
   */
  shareCantiereId: string | null;
}

async function resolveShareToken(
  token: string
): Promise<{ cantiereId: string } | null> {
  const link = await prisma.linkCondivisione.findUnique({
    where: { token },
  });
  if (!link) return null;
  if (link.revocato) return null;
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
  // Increment accessi count (fire & forget)
  prisma.linkCondivisione
    .update({ where: { id: link.id }, data: { accessiCount: { increment: 1 } } })
    .catch(() => {});
  return { cantiereId: link.cantiereId };
}

export async function createContext({
  req,
}: {
  req: Request;
}): Promise<GraphQLContext> {
  const auth = extractAuthHeader(req);

  if (auth?.kind === "share") {
    const share = await resolveShareToken(auth.token);
    return {
      prisma,
      user: null,
      shareCantiereId: share?.cantiereId ?? null,
    };
  }

  const user = auth?.kind === "bearer" ? getUserFromToken(auth.token) : null;
  return { prisma, user, shareCantiereId: null };
}

export async function createWsContext(
  connectionParams: Record<string, unknown> | undefined
): Promise<GraphQLContext> {
  if (connectionParams?.Authorization) {
    const authStr = connectionParams.Authorization as string;
    const [scheme, token] = authStr.split(" ");
    if (scheme === "ShareLink" && token) {
      const share = await resolveShareToken(token);
      return { prisma, user: null, shareCantiereId: share?.cantiereId ?? null };
    }
    if (scheme === "Bearer" && token) {
      return { prisma, user: getUserFromToken(token), shareCantiereId: null };
    }
    // Older clients send raw token without scheme
    return { prisma, user: getUserFromToken(authStr), shareCantiereId: null };
  }
  return { prisma, user: null, shareCantiereId: null };
}
