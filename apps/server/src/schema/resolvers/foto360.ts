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
      requireAuth(ctx);

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
      requireAuth(ctx);
      return ctx.prisma.foto360.findUnique({ where: { id: args.id } });
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

      return ctx.prisma.foto360.create({
        data: {
          puntoDiScattoId: args.puntoDiScattoId,
          url: args.url,
          thumbnailUrl: args.thumbnailUrl ?? null,
          metadata: args.metadata ? JSON.parse(JSON.stringify(args.metadata)) : undefined,
          uploadedById: user.userId,
        },
      });
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
