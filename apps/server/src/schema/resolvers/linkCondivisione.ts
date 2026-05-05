import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context.js";
import { requireAdmin } from "../../utils/access.js";

export const linkCondivisioneResolvers = {
  Query: {
    /**
     * Lista dei link di condivisione attivi/scaduti per un cantiere.
     * Solo admin (chi gestisce la sicurezza del cantiere).
     */
    linkCondivisioneCantiere: async (
      _parent: unknown,
      args: { cantiereId: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.linkCondivisione.findMany({
        where: { cantiereId: args.cantiereId },
        orderBy: { createdAt: "desc" },
      });
    },

    /**
     * Risolve un token in info pubbliche del cantiere associato.
     * Pubblica (non richiede auth): chiunque abbia il token può leggere
     * i metadati del cantiere e capire cosa sta visualizzando.
     */
    linkCondivisione: async (
      _parent: unknown,
      args: { token: string },
      ctx: GraphQLContext
    ) => {
      const link = await ctx.prisma.linkCondivisione.findUnique({
        where: { token: args.token },
        include: { cantiere: true },
      });
      if (!link) return null;
      if (link.revocato) return null;
      if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
      return link;
    },
  },

  Mutation: {
    creaLinkCondivisione: async (
      _parent: unknown,
      args: { cantiereId: string; durataGiorni?: number | null },
      ctx: GraphQLContext
    ) => {
      const user = requireAdmin(ctx);

      // Verifica che il cantiere esista
      const cantiere = await ctx.prisma.cantiere.findUnique({
        where: { id: args.cantiereId },
      });
      if (!cantiere) {
        throw new GraphQLError("Cantiere non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const expiresAt =
        args.durataGiorni && args.durataGiorni > 0
          ? new Date(Date.now() + args.durataGiorni * 24 * 60 * 60 * 1000)
          : null;

      return ctx.prisma.linkCondivisione.create({
        data: {
          cantiereId: args.cantiereId,
          creatoDaId: user.userId,
          expiresAt,
        },
      });
    },

    revocaLinkCondivisione: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.linkCondivisione.update({
        where: { id: args.id },
        data: { revocato: true },
      });
    },

    eliminaLinkCondivisione: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const link = await ctx.prisma.linkCondivisione.findUnique({
        where: { id: args.id },
      });
      if (!link) {
        throw new GraphQLError("Link non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      await ctx.prisma.linkCondivisione.delete({ where: { id: args.id } });
      return link;
    },
  },

  // Field resolvers
  LinkCondivisione: {
    cantiere: async (parent: { cantiereId: string }, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.cantiere.findUnique({ where: { id: parent.cantiereId } });
    },
    creatoDa: async (parent: { creatoDaId: string }, _args: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.user.findUnique({ where: { id: parent.creatoDaId } });
    },
    isExpired: (parent: { expiresAt: Date | null }) => {
      if (!parent.expiresAt) return false;
      return parent.expiresAt.getTime() < Date.now();
    },
  },
};
