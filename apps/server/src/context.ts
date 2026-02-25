import { PrismaClient } from "@prisma/client";
import type { Request } from "express";
import {
  extractTokenFromRequest,
  getUserFromToken,
  type JwtPayload,
} from "./middleware/auth.js";

const prisma = new PrismaClient();

export interface GraphQLContext {
  prisma: PrismaClient;
  user: JwtPayload | null;
}

export async function createContext({
  req,
}: {
  req: Request;
}): Promise<GraphQLContext> {
  const token = extractTokenFromRequest(req);
  const user = getUserFromToken(token);
  return { prisma, user };
}

export function createWsContext(
  connectionParams: Record<string, unknown> | undefined
): GraphQLContext {
  let user: JwtPayload | null = null;
  if (connectionParams?.Authorization) {
    const auth = connectionParams.Authorization as string;
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    user = getUserFromToken(token);
  }
  return { prisma, user };
}
