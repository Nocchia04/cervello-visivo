import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context.js";

function requireAuth(ctx: GraphQLContext) {
  if (!ctx.user) {
    throw new GraphQLError("Non autenticato", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

export const piantinaResolvers = {
  Query: {
    piantine: async (
      _parent: unknown,
      args: { cantiereId: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return ctx.prisma.piantina.findMany({
        where: { cantiereId: args.cantiereId },
        orderBy: { livello: "asc" },
      });
    },

    piantina: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return ctx.prisma.piantina.findUnique({ where: { id: args.id } });
    },
  },

  Mutation: {
    caricaPiantina: async (
      _parent: unknown,
      args: {
        cantiereId: string;
        nome: string;
        livello: number;
        fileUrl: string;
        larghezza: number;
        altezza: number;
      },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);

      const cantiere = await ctx.prisma.cantiere.findUnique({
        where: { id: args.cantiereId },
      });
      if (!cantiere) {
        throw new GraphQLError("Cantiere non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.prisma.piantina.create({
        data: {
          cantiereId: args.cantiereId,
          nome: args.nome,
          livello: args.livello,
          fileUrl: args.fileUrl,
          larghezza: args.larghezza,
          altezza: args.altezza,
        },
      });
    },

    aggiungiPuntoDiScatto: async (
      _parent: unknown,
      args: { piantinaId: string; nome: string; x: number; y: number },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);

      const piantina = await ctx.prisma.piantina.findUnique({
        where: { id: args.piantinaId },
      });
      if (!piantina) {
        throw new GraphQLError("Piantina non trovata", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.prisma.puntoDiScatto.create({
        data: {
          piantinaId: args.piantinaId,
          nome: args.nome,
          x: args.x,
          y: args.y,
        },
      });
    },

    spostaPuntoDiScatto: async (
      _parent: unknown,
      args: { id: string; x: number; y: number },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);

      const punto = await ctx.prisma.puntoDiScatto.findUnique({
        where: { id: args.id },
      });
      if (!punto) {
        throw new GraphQLError("Punto di scatto non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.prisma.puntoDiScatto.update({
        where: { id: args.id },
        data: { x: args.x, y: args.y },
      });
    },
  },

  Piantina: {
    puntiDiScatto: (
      parent: { id: string },
      _args: unknown,
      ctx: GraphQLContext
    ) =>
      ctx.prisma.puntoDiScatto.findMany({
        where: { piantinaId: parent.id },
      }),
  },

  PuntoDiScatto: {
    foto360: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.foto360.findMany({
        where: { puntoDiScattoId: parent.id },
        orderBy: { timestamp: "desc" },
      }),
  },
};
