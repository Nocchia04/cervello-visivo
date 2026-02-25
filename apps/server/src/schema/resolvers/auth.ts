import bcrypt from "bcryptjs";
import { GraphQLError } from "graphql";
import { signToken } from "../../middleware/auth.js";
import type { GraphQLContext } from "../../context.js";

export const authResolvers = {
  Query: {
    me: async (
      _parent: unknown,
      _args: unknown,
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) {
        throw new GraphQLError("Non autenticato", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }
      return ctx.prisma.user.findUnique({
        where: { id: ctx.user.userId },
      });
    },

    utenti: async (
      _parent: unknown,
      _args: unknown,
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      return ctx.prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    },
  },

  Mutation: {
    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      ctx: GraphQLContext
    ) => {
      const user = await ctx.prisma.user.findUnique({
        where: { email: args.email },
      });
      if (!user) {
        throw new GraphQLError("Credenziali non valide", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      const valid = await bcrypt.compare(args.password, user.password);
      if (!valid) {
        throw new GraphQLError("Credenziali non valide", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }

      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return { token, user };
    },

    creaOperatore: async (
      _parent: unknown,
      args: { email: string; password: string; nome: string; cognome: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      const existing = await ctx.prisma.user.findUnique({
        where: { email: args.email },
      });
      if (existing) {
        throw new GraphQLError("Email già in uso", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const hashed = await bcrypt.hash(args.password, 12);
      const newUser = await ctx.prisma.user.create({
        data: {
          email: args.email,
          password: hashed,
          nome: args.nome,
          cognome: args.cognome,
          role: "CAPO_CANTIERE",
        },
      });
      const token = signToken({
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
      });
      return { token, user: newUser };
    },

    register: async (
      _parent: unknown,
      args: {
        email: string;
        password: string;
        nome: string;
        cognome: string;
        role?: string;
      },
      ctx: GraphQLContext
    ) => {
      const existing = await ctx.prisma.user.findUnique({
        where: { email: args.email },
      });
      if (existing) {
        throw new GraphQLError("Email già registrata", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const hashedPassword = await bcrypt.hash(args.password, 12);
      const user = await ctx.prisma.user.create({
        data: {
          email: args.email,
          password: hashedPassword,
          nome: args.nome,
          cognome: args.cognome,
          role: (args.role as "ADMIN" | "CAPO_CANTIERE") || "CAPO_CANTIERE",
        },
      });

      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return { token, user };
    },
  },

  User: {
    createdAt: (parent: { createdAt: Date | string }) =>
      parent.createdAt instanceof Date ? parent.createdAt.toISOString() : String(parent.createdAt),
    updatedAt: (parent: { updatedAt?: Date | string }) =>
      parent.updatedAt instanceof Date ? parent.updatedAt.toISOString() : String(parent.updatedAt ?? ""),
  },
};
