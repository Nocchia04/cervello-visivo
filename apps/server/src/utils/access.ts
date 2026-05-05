import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../context.js";

/** Lancia se non autenticato (né user JWT né share token valido). */
export function requireAuthOrShare(ctx: GraphQLContext) {
  if (!ctx.user && !ctx.shareCantiereId) {
    throw new GraphQLError("Non autenticato", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
}

/** Lancia se non c'è uno user JWT (admin/capo cantiere). Usato dalle mutations. */
export function requireUser(ctx: GraphQLContext) {
  if (!ctx.user) {
    throw new GraphQLError("Operazione non disponibile in modalità sola lettura", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return ctx.user;
}

export function requireAdmin(ctx: GraphQLContext) {
  const user = requireUser(ctx);
  if (user.role !== "ADMIN") {
    throw new GraphQLError("Accesso riservato agli amministratori", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}

/**
 * Verifica che il cantiere sia visibile nel context corrente.
 * - User JWT: sempre visibile (le restrizioni di ruolo le applica il caller)
 * - Share token: visibile solo se l'ID corrisponde a quello bloccato dal token
 */
export function assertCantiereVisible(
  ctx: GraphQLContext,
  cantiereId: string
) {
  if (ctx.user) return;
  if (ctx.shareCantiereId && ctx.shareCantiereId === cantiereId) return;
  throw new GraphQLError("Risorsa non disponibile", {
    extensions: { code: ctx.shareCantiereId ? "FORBIDDEN" : "UNAUTHENTICATED" },
  });
}
