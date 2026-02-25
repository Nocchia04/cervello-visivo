import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context.js";
import { pubsub } from "../../pubsub.js";

function requireAuth(ctx: GraphQLContext) {
  if (!ctx.user) {
    throw new GraphQLError("Non autenticato", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

export const annotazioneResolvers = {
  Query: {
    annotazioni: async (
      _parent: unknown,
      args: { foto360Id: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return ctx.prisma.annotazione.findMany({
        where: { foto360Id: args.foto360Id },
        orderBy: { createdAt: "asc" },
      });
    },
  },

  Mutation: {
    creaAnnotazione: async (
      _parent: unknown,
      args: { foto360Id: string; testo: string; x: number; y: number },
      ctx: GraphQLContext
    ) => {
      const user = requireAuth(ctx);

      const foto = await ctx.prisma.foto360.findUnique({
        where: { id: args.foto360Id },
      });
      if (!foto) {
        throw new GraphQLError("Foto 360 non trovata", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const annotazione = await ctx.prisma.annotazione.create({
        data: {
          foto360Id: args.foto360Id,
          testo: args.testo,
          x: args.x,
          y: args.y,
          autoreId: user.userId,
        },
        include: { autore: true },
      });

      await pubsub.publish(`NUOVA_ANNOTAZIONE_${args.foto360Id}`, {
        nuovaAnnotazione: annotazione,
      });

      return annotazione;
    },
  },

  Subscription: {
    nuovaAnnotazione: {
      subscribe: (
        _parent: unknown,
        args: { foto360Id: string }
      ) => {
        return pubsub.asyncIterableIterator([
          `NUOVA_ANNOTAZIONE_${args.foto360Id}`,
        ]);
      },
    },
  },

  Annotazione: {
    autore: (
      parent: { autoreId: string },
      _args: unknown,
      ctx: GraphQLContext
    ) => ctx.prisma.user.findUnique({ where: { id: parent.autoreId } }),
    createdAt: (parent: { createdAt: Date | string }) =>
      parent.createdAt instanceof Date ? parent.createdAt.toISOString() : String(parent.createdAt),
  },
};
