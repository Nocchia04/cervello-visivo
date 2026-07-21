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
      args: {
        email: string;
        password: string;
        nome: string;
        cognome: string;
        emailPersonale?: string | null;
        telefono?: string | null;
      },
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
          emailPersonale: args.emailPersonale?.trim() || null,
          telefono: args.telefono?.trim() || null,
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

    /**
     * Aggiorna i contatti di un operatore (email personale per notifiche push,
     * telefono). Solo admin. Passa null/"" per svuotare un campo.
     */
    aggiornaOperatore: async (
      _parent: unknown,
      args: { id: string; emailPersonale?: string | null; telefono?: string | null },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      const user = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!user) {
        throw new GraphQLError("Utente non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      return ctx.prisma.user.update({
        where: { id: args.id },
        data: {
          emailPersonale: args.emailPersonale?.trim() || null,
          telefono: args.telefono?.trim() || null,
        },
      });
    },

    /**
     * Permette a un admin di reimpostare la password di un operatore
     * (ruolo CAPO_CANTIERE). Validazione: solo admin, password minimo 8 char.
     * Non possiamo cambiare password di altri admin per evitare lockout reciproci.
     */
    cambiaPasswordOperatore: async (
      _parent: unknown,
      args: { id: string; nuovaPassword: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      if (!args.nuovaPassword || args.nuovaPassword.length < 8) {
        throw new GraphQLError("La password deve essere lunga almeno 8 caratteri", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const user = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!user) {
        throw new GraphQLError("Utente non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (user.role === "ADMIN") {
        throw new GraphQLError("Non puoi modificare la password di un admin", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      const hashed = await bcrypt.hash(args.nuovaPassword, 12);
      return ctx.prisma.user.update({
        where: { id: args.id },
        data: { password: hashed },
      });
    },

    eliminaOperatore: async (
      _parent: unknown,
      args: { id: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user || ctx.user.role !== "ADMIN") {
        throw new GraphQLError("Non autorizzato", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      const user = await ctx.prisma.user.findUnique({ where: { id: args.id } });
      if (!user) {
        throw new GraphQLError("Utente non trovato", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      if (user.role === "ADMIN") {
        throw new GraphQLError("Non puoi eliminare un admin", {
          extensions: { code: "FORBIDDEN" },
        });
      }

      // CantiereUser/Invito cascade delete; Foto360.uploadedBy/Annotazione.autore set null via Prisma onDelete: SetNull
      return ctx.prisma.user.delete({ where: { id: args.id } });
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
    cantieri: (parent: { id: string }, _args: unknown, ctx: GraphQLContext) =>
      ctx.prisma.cantiereUser.findMany({
        where: { userId: parent.id },
        include: { cantiere: true },
        orderBy: { createdAt: "asc" },
      }),
  },
};
