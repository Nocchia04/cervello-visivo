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

const DIMENSIONI_VALIDE = new Set(["PICCOLO", "MEDIO", "GRANDE", "XL"]);
/** Normalizza la dimensione a un valore valido, default MEDIO. */
function normalizzaDimensione(d: string): string {
  const up = (d || "").toUpperCase();
  return DIMENSIONI_VALIDE.has(up) ? up : "MEDIO";
}

export const piantinaResolvers = {
  Query: {
    piantine: async (
      _parent: unknown,
      args: { cantiereId: string },
      ctx: GraphQLContext
    ) => {
      // user OR share-mode con cantiere matching
      if (!ctx.user) {
        if (!ctx.shareCantiereId || ctx.shareCantiereId !== args.cantiereId) {
          throw new (require("graphql").GraphQLError)("Risorsa non disponibile", {
            extensions: { code: ctx.shareCantiereId ? "FORBIDDEN" : "UNAUTHENTICATED" },
          });
        }
      }
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
      const piantina = await ctx.prisma.piantina.findUnique({ where: { id: args.id } });
      if (!piantina) return null;
      if (!ctx.user) {
        if (!ctx.shareCantiereId || ctx.shareCantiereId !== piantina.cantiereId) {
          throw new (require("graphql").GraphQLError)("Risorsa non disponibile", {
            extensions: { code: ctx.shareCantiereId ? "FORBIDDEN" : "UNAUTHENTICATED" },
          });
        }
      }
      return piantina;
    },

    puntoDiScatto: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      const punto = await ctx.prisma.puntoDiScatto.findUnique({
        where: { id: args.id },
        include: { piantina: { select: { cantiereId: true } } },
      });
      if (!punto) return null;
      if (!ctx.user) {
        if (!ctx.shareCantiereId || ctx.shareCantiereId !== punto.piantina.cantiereId) {
          throw new (require("graphql").GraphQLError)("Risorsa non disponibile", {
            extensions: { code: ctx.shareCantiereId ? "FORBIDDEN" : "UNAUTHENTICATED" },
          });
        }
      }
      return punto;
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
      args: {
        piantinaId: string;
        nome: string;
        x: number;
        y: number;
        dimensione?: string | null;
      },
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
          ...(args.dimensione ? { dimensione: normalizzaDimensione(args.dimensione) } : {}),
        },
      });
    },

    aggiornaDimensionePuntoDiScatto: async (
      _parent: unknown,
      args: { id: string; dimensione: string },
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
        data: { dimensione: normalizzaDimensione(args.dimensione) },
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

    rinominaPuntoDiScatto: async (
      _parent: unknown,
      args: { id: string; nome: string },
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
        data: { nome: args.nome.trim() },
      });
    },

    eliminaPuntoDiScatto: async (
      _parent: unknown,
      args: { id: string },
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

      // Cascade: Prisma schema has onDelete: Cascade for Foto360 → Annotazione
      return ctx.prisma.puntoDiScatto.delete({ where: { id: args.id } });
    },

    rinominaPiantina: async (
      _parent: unknown,
      args: { id: string; nome: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);

      const piantina = await ctx.prisma.piantina.findUnique({
        where: { id: args.id },
      });
      if (!piantina) {
        throw new GraphQLError("Piantina non trovata", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      return ctx.prisma.piantina.update({
        where: { id: args.id },
        data: { nome: args.nome.trim() },
      });
    },

    aggiornaDataPiantina: async (
      _parent: unknown,
      args: { id: string; data: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const d = new Date(args.data);
      if (isNaN(d.getTime())) {
        throw new GraphQLError("Data non valida", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return ctx.prisma.piantina.update({
        where: { id: args.id },
        data: { createdAt: d },
      });
    },

    aggiornaDataPuntoDiScatto: async (
      _parent: unknown,
      args: { id: string; data: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const d = new Date(args.data);
      if (isNaN(d.getTime())) {
        throw new GraphQLError("Data non valida", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return ctx.prisma.puntoDiScatto.update({
        where: { id: args.id },
        data: { createdAt: d },
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
