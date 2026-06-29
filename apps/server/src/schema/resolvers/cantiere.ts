import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context.js";
import { assertCantiereVisible } from "../../utils/access.js";

function requireAuth(ctx: GraphQLContext) {
  if (!ctx.user) {
    throw new GraphQLError("Non autenticato", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

function requireAdmin(ctx: GraphQLContext) {
  const user = requireAuth(ctx);
  if (user.role !== "ADMIN") {
    throw new GraphQLError("Accesso riservato agli amministratori", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}

export const cantiereResolvers = {
  Query: {
    cantieri: async (
      _parent: unknown,
      args: { includiArchiviati?: boolean },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);

      // CAPO_CANTIERE non vede mai gli archiviati
      const includiArchiviati =
        ctx.user!.role === "CAPO_CANTIERE" ? false : (args.includiArchiviati ?? false);

      // CAPO_CANTIERE vede solo i cantieri a cui è assegnato
      if (ctx.user!.role === "CAPO_CANTIERE") {
        return ctx.prisma.cantiere.findMany({
          where: {
            stato: "ATTIVO",
            utenti: { some: { userId: ctx.user!.userId } },
          },
          orderBy: { createdAt: "desc" },
        });
      }

      const where = includiArchiviati ? {} : { stato: "ATTIVO" as const };

      return ctx.prisma.cantiere.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
    },

    cantiere: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      // Permette user JWT o share token che corrisponde al cantiere richiesto
      assertCantiereVisible(ctx, args.id);
      return ctx.prisma.cantiere.findUnique({ where: { id: args.id } });
    },
  },

  Mutation: {
    creaCantiere: async (
      _parent: unknown,
      args: { input: { nome: string; indirizzo: string } },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.cantiere.create({
        data: {
          nome: args.input.nome,
          indirizzo: args.input.indirizzo,
        },
      });
    },

    aggiornaCantiere: async (
      _parent: unknown,
      args: { id: string; input: { nome?: string; indirizzo?: string; thumbnailUrl?: string } },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.cantiere.update({
        where: { id: args.id },
        data: args.input,
      });
    },

    aggiornaDataCantiere: async (
      _parent: unknown,
      args: { id: string; data: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const d = new Date(args.data);
      if (isNaN(d.getTime())) {
        throw new GraphQLError("Data non valida", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return ctx.prisma.cantiere.update({
        where: { id: args.id },
        data: { createdAt: d },
      });
    },

    archiviaCantiere: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.cantiere.update({
        where: { id: args.id },
        data: { stato: "ARCHIVIATO" },
      });
    },

    riattivaCantiere: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.cantiere.update({
        where: { id: args.id },
        data: { stato: "ATTIVO" },
      });
    },

    assegnaOperatoreCantiere: async (
      _parent: unknown,
      args: { cantiereId: string; userId: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return ctx.prisma.cantiereUser.upsert({
        where: { cantiereId_userId: { cantiereId: args.cantiereId, userId: args.userId } },
        create: { cantiereId: args.cantiereId, userId: args.userId },
        update: {},
        include: { user: true, cantiere: true },
      });
    },

    rimuoviOperatoreCantiere: async (
      _parent: unknown,
      args: { cantiereId: string; userId: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const existing = await ctx.prisma.cantiereUser.findUnique({
        where: { cantiereId_userId: { cantiereId: args.cantiereId, userId: args.userId } },
        include: { user: true, cantiere: true },
      });
      if (!existing) {
        throw new Error("Assegnazione non trovata");
      }
      return ctx.prisma.cantiereUser.delete({
        where: { cantiereId_userId: { cantiereId: args.cantiereId, userId: args.userId } },
        include: { user: true, cantiere: true },
      });
    },
  },

  Cantiere: {
    createdAt: (parent: { createdAt: Date | string }) =>
      parent.createdAt instanceof Date ? parent.createdAt.toISOString() : String(parent.createdAt),
    updatedAt: (parent: { updatedAt: Date | string }) =>
      parent.updatedAt instanceof Date ? parent.updatedAt.toISOString() : String(parent.updatedAt),
    piantine: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.piantina.findMany({
        where: { cantiereId: parent.id },
        orderBy: { livello: "asc" },
      }),
    utenti: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.cantiereUser.findMany({
        where: { cantiereId: parent.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
  },

  CantiereUser: {
    createdAt: (parent: { createdAt: Date | string }) =>
      parent.createdAt instanceof Date ? parent.createdAt.toISOString() : String(parent.createdAt),
    user: (parent: { userId: string; user?: unknown }, _args: unknown, ctx: GraphQLContext) =>
      (parent as any).user ?? ctx.prisma.user.findUnique({ where: { id: parent.userId } }),
    cantiere: (parent: { cantiereId: string; cantiere?: unknown }, _args: unknown, ctx: GraphQLContext) =>
      (parent as any).cantiere ?? ctx.prisma.cantiere.findUnique({ where: { id: parent.cantiereId } }),
  },
};
