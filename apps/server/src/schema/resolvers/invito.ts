import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context.js";

export const invitoResolvers = {
  Query: {
    inviti: async (
      _parent: unknown,
      _args: unknown,
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      return ctx.prisma.invito.findMany({
        include: { createdBy: true },
        orderBy: { createdAt: "desc" },
      });
    },
  },
  Mutation: {
    creaInvito: async (
      _parent: unknown,
      args: { email: string; role?: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      return ctx.prisma.invito.create({
        data: {
          email: args.email,
          role: (args.role as any) ?? "CAPO_CANTIERE",
          expiresAt,
          createdById: ctx.user.userId,
        },
        include: { createdBy: true },
      });
    },
  },
};
