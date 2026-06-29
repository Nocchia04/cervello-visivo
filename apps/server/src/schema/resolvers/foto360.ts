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

export const foto360Resolvers = {
  Query: {
    foto360: async (
      _parent: unknown,
      args: { puntoId: string; dataInizio?: string; dataFine?: string },
      ctx: GraphQLContext
    ) => {
      // user OR share-mode (verifica via cantiereId del punto)
      if (!ctx.user) {
        const punto = await ctx.prisma.puntoDiScatto.findUnique({
          where: { id: args.puntoId },
          include: { piantina: { select: { cantiereId: true } } },
        });
        if (
          !punto ||
          !ctx.shareCantiereId ||
          ctx.shareCantiereId !== punto.piantina.cantiereId
        ) {
          throw new GraphQLError("Risorsa non disponibile", {
            extensions: { code: ctx.shareCantiereId ? "FORBIDDEN" : "UNAUTHENTICATED" },
          });
        }
      }

      const where: Record<string, unknown> = {
        puntoDiScattoId: args.puntoId,
      };

      if (args.dataInizio || args.dataFine) {
        const timestampFilter: Record<string, Date> = {};
        if (args.dataInizio) timestampFilter.gte = new Date(args.dataInizio);
        if (args.dataFine) timestampFilter.lte = new Date(args.dataFine);
        where.timestamp = timestampFilter;
      }

      return ctx.prisma.foto360.findMany({
        where,
        orderBy: { timestamp: "asc" },
      });
    },

    fotoSingola: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      const foto = await ctx.prisma.foto360.findUnique({
        where: { id: args.id },
        include: { puntoDiScatto: { include: { piantina: { select: { cantiereId: true } } } } },
      });
      if (!foto) return null;
      if (!ctx.user) {
        if (!ctx.shareCantiereId || ctx.shareCantiereId !== foto.puntoDiScatto.piantina.cantiereId) {
          throw new GraphQLError("Risorsa non disponibile", {
            extensions: { code: ctx.shareCantiereId ? "FORBIDDEN" : "UNAUTHENTICATED" },
          });
        }
      }
      return foto;
    },
  },

  Mutation: {
    uploadFoto360: async (
      _parent: unknown,
      args: {
        puntoDiScattoId: string;
        url: string;
        thumbnailUrl?: string;
        metadata?: unknown;
        timestamp?: string | null;
      },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);

      const punto = await ctx.prisma.puntoDiScatto.findUnique({
        where: { id: args.puntoDiScattoId },
      });
      if (!punto) {
        throw new GraphQLError("Punto di scatto non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Data di scatto opzionale (es. estratta dal nome del file).
      // Se assente o non valida, Prisma usa il default @default(now()).
      let scattoTimestamp: Date | undefined;
      if (args.timestamp) {
        const parsed = new Date(args.timestamp);
        if (!isNaN(parsed.getTime())) scattoTimestamp = parsed;
      }

      return ctx.prisma.foto360.create({
        data: {
          puntoDiScattoId: args.puntoDiScattoId,
          url: args.url,
          thumbnailUrl: args.thumbnailUrl ?? null,
          metadata: args.metadata ? JSON.parse(JSON.stringify(args.metadata)) : undefined,
          uploadedById: user.userId,
          ...(scattoTimestamp ? { timestamp: scattoTimestamp } : {}),
        },
      });
    },

    aggiornaDataFoto360: async (
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
      const foto = await ctx.prisma.foto360.findUnique({ where: { id: args.id } });
      if (!foto) {
        throw new GraphQLError("Foto non trovata", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return ctx.prisma.foto360.update({
        where: { id: args.id },
        data: { timestamp: d },
      });
    },

    eliminaFoto360: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);

      const foto = await ctx.prisma.foto360.findUnique({ where: { id: args.id } });
      if (!foto) {
        throw new GraphQLError("Foto non trovata", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      // Cascade: Prisma deletes related Annotazioni automatically
      return ctx.prisma.foto360.delete({ where: { id: args.id } });
    },
  },

  Foto360: {
    uploadedBy: (
      parent: { uploadedById: string },
      _args: unknown,
      ctx: GraphQLContext
    ) => ctx.prisma.user.findUnique({ where: { id: parent.uploadedById } }),
    // Serialize Prisma Date objects as ISO strings so the frontend can parse them
    timestamp: (parent: { timestamp: Date | string }) =>
      parent.timestamp instanceof Date
        ? parent.timestamp.toISOString()
        : String(parent.timestamp),
    createdAt: (parent: { createdAt: Date | string }) =>
      parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : String(parent.createdAt),
  },
};
