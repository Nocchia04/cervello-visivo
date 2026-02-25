/**
 * Test Suite: Cantiere & Annotazione Resolvers
 *
 * Tests role-based access control, Prisma interactions,
 * and PubSub subscription behavior.
 */

import { GraphQLError } from "graphql";

// ─── Mock PrismaClient ───────────────────────────────────

const prismaMock = {
  cantiere: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  piantina: {
    findMany: jest.fn(),
  },
  annotazione: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  foto360: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

// ─── Mock PubSub ─────────────────────────────────────────

const pubsubMock = {
  publish: jest.fn().mockResolvedValue(undefined),
  asyncIterableIterator: jest.fn(),
};

jest.mock("../../src/pubsub.js", () => ({
  pubsub: pubsubMock,
}));

// ─── Import resolvers after mocking ─────────────────────

import { cantiereResolvers } from "../src/schema/resolvers/cantiere";
import { annotazioneResolvers } from "../src/schema/resolvers/annotazione";

// ─── Helpers ─────────────────────────────────────────────

type MockContext = {
  prisma: typeof prismaMock;
  user: { userId: string; email: string; role: string } | null;
};

function makeCtx(
  role: "ADMIN" | "CAPO_CANTIERE" | null = "ADMIN"
): MockContext {
  return {
    prisma: prismaMock,
    user: role
      ? { userId: "user-1", email: "test@test.com", role }
      : null,
  };
}

// ─── Test Suites ─────────────────────────────────────────

describe("Cantiere Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── cantieri Query ──────────────────────────────────────

  describe("Query.cantieri", () => {
    const cantieriQuery = cantiereResolvers.Query.cantieri;

    it("CAPO_CANTIERE riceve solo cantieri ATTIVI anche con includiArchiviati:true", async () => {
      const ctx = makeCtx("CAPO_CANTIERE");
      prismaMock.cantiere.findMany.mockResolvedValue([
        { id: "c1", nome: "Cantiere Alfa", stato: "ATTIVO" },
      ]);

      await cantieriQuery(null, { includiArchiviati: true }, ctx as any);

      // CAPO_CANTIERE should ALWAYS filter to ATTIVO only
      expect(prismaMock.cantiere.findMany).toHaveBeenCalledWith({
        where: { stato: "ATTIVO" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("ADMIN riceve ATTIVI + ARCHIVIATI con includiArchiviati:true", async () => {
      const ctx = makeCtx("ADMIN");
      prismaMock.cantiere.findMany.mockResolvedValue([
        { id: "c1", nome: "Cantiere Alfa", stato: "ATTIVO" },
        { id: "c2", nome: "Cantiere Beta", stato: "ARCHIVIATO" },
      ]);

      await cantieriQuery(null, { includiArchiviati: true }, ctx as any);

      // ADMIN with includiArchiviati:true → no stato filter (empty where)
      expect(prismaMock.cantiere.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: "desc" },
      });
    });

    it("ADMIN senza includiArchiviati riceve solo ATTIVI", async () => {
      const ctx = makeCtx("ADMIN");
      prismaMock.cantiere.findMany.mockResolvedValue([]);

      await cantieriQuery(null, {}, ctx as any);

      expect(prismaMock.cantiere.findMany).toHaveBeenCalledWith({
        where: { stato: "ATTIVO" },
        orderBy: { createdAt: "desc" },
      });
    });

    it("utente non autenticato → GraphQLError UNAUTHENTICATED", async () => {
      const ctx = makeCtx(null);

      await expect(
        cantieriQuery(null, {}, ctx as any)
      ).rejects.toThrow(GraphQLError);

      await expect(
        cantieriQuery(null, {}, ctx as any)
      ).rejects.toMatchObject({
        extensions: { code: "UNAUTHENTICATED" },
      });
    });
  });

  // ── archiviaCantiere Mutation ────────────────────────────

  describe("Mutation.archiviaCantiere", () => {
    const archiviaCantiere = cantiereResolvers.Mutation.archiviaCantiere;

    it("ADMIN può archiviare un cantiere", async () => {
      const ctx = makeCtx("ADMIN");
      prismaMock.cantiere.update.mockResolvedValue({
        id: "c1",
        stato: "ARCHIVIATO",
      });

      const result = await archiviaCantiere(null, { id: "c1" }, ctx as any);

      expect(prismaMock.cantiere.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { stato: "ARCHIVIATO" },
      });
      expect(result.stato).toBe("ARCHIVIATO");
    });

    it("CAPO_CANTIERE non può archiviare → GraphQLError FORBIDDEN", async () => {
      const ctx = makeCtx("CAPO_CANTIERE");

      await expect(
        archiviaCantiere(null, { id: "c1" }, ctx as any)
      ).rejects.toThrow(GraphQLError);

      await expect(
        archiviaCantiere(null, { id: "c1" }, ctx as any)
      ).rejects.toMatchObject({
        extensions: { code: "FORBIDDEN" },
      });
    });
  });

  // ── creaCantiere Mutation ───────────────────────────────

  describe("Mutation.creaCantiere", () => {
    const creaCantiere = cantiereResolvers.Mutation.creaCantiere;

    it("solo ADMIN può creare un cantiere", async () => {
      const ctx = makeCtx("ADMIN");
      const input = { nome: "Nuovo Cantiere", indirizzo: "Via Roma 1" };
      prismaMock.cantiere.create.mockResolvedValue({ id: "c-new", ...input });

      const result = await creaCantiere(null, { input }, ctx as any);

      expect(prismaMock.cantiere.create).toHaveBeenCalledWith({
        data: { nome: input.nome, indirizzo: input.indirizzo },
      });
      expect(result.nome).toBe("Nuovo Cantiere");
    });

    it("CAPO_CANTIERE non può creare → GraphQLError FORBIDDEN", async () => {
      const ctx = makeCtx("CAPO_CANTIERE");
      const input = { nome: "Test", indirizzo: "Via Test" };

      await expect(
        creaCantiere(null, { input }, ctx as any)
      ).rejects.toMatchObject({
        extensions: { code: "FORBIDDEN" },
      });
    });
  });

  // ── Cantiere.piantine type resolver ─────────────────────

  describe("Cantiere.piantine", () => {
    it("risolve le piantine associate al cantiere", async () => {
      const ctx = makeCtx("ADMIN");
      const mockPiantine = [
        { id: "p1", cantiereId: "c1", nome: "Piano Terra", livello: 0 },
      ];
      prismaMock.piantina.findMany.mockResolvedValue(mockPiantine);

      const result = await cantiereResolvers.Cantiere.piantine(
        { id: "c1" },
        undefined,
        ctx as any
      );

      expect(prismaMock.piantina.findMany).toHaveBeenCalledWith({
        where: { cantiereId: "c1" },
        orderBy: { livello: "asc" },
      });
      expect(result).toEqual(mockPiantine);
    });
  });
});

// ─── Annotazione Resolvers ───────────────────────────────

describe("Annotazione Resolvers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Mutation.creaAnnotazione", () => {
    const creaAnnotazione = annotazioneResolvers.Mutation.creaAnnotazione;

    it("pubsub.publish viene chiamato con NUOVA_ANNOTAZIONE_${foto360Id}", async () => {
      const ctx = makeCtx("ADMIN");
      const foto360Id = "foto-123";
      const args = { foto360Id, testo: "Crepa nel muro", x: 0.5, y: 0.3 };

      prismaMock.foto360.findUnique.mockResolvedValue({ id: foto360Id });
      const createdAnnotazione = {
        id: "ann-1",
        ...args,
        autoreId: "user-1",
        autore: { id: "user-1", nome: "Mario", cognome: "Rossi" },
      };
      prismaMock.annotazione.create.mockResolvedValue(createdAnnotazione);

      await creaAnnotazione(null, args, ctx as any);

      expect(pubsubMock.publish).toHaveBeenCalledWith(
        `NUOVA_ANNOTAZIONE_${foto360Id}`,
        { nuovaAnnotazione: createdAnnotazione }
      );
    });

    it("annotazione.create è chiamato con i parametri corretti e include autore", async () => {
      const ctx = makeCtx("CAPO_CANTIERE");
      const foto360Id = "foto-456";
      const args = { foto360Id, testo: "Infiltrazione", x: 0.2, y: 0.8 };

      prismaMock.foto360.findUnique.mockResolvedValue({ id: foto360Id });
      prismaMock.annotazione.create.mockResolvedValue({ id: "ann-2", ...args });

      await creaAnnotazione(null, args, ctx as any);

      expect(prismaMock.annotazione.create).toHaveBeenCalledWith({
        data: {
          foto360Id,
          testo: "Infiltrazione",
          x: 0.2,
          y: 0.8,
          autoreId: "user-1",
        },
        include: { autore: true },
      });
    });

    it("foto360 non trovata → GraphQLError BAD_USER_INPUT", async () => {
      const ctx = makeCtx("ADMIN");
      prismaMock.foto360.findUnique.mockResolvedValue(null);

      await expect(
        creaAnnotazione(
          null,
          { foto360Id: "inesistente", testo: "Test", x: 0, y: 0 },
          ctx as any
        )
      ).rejects.toMatchObject({
        extensions: { code: "BAD_USER_INPUT" },
      });
    });
  });

  describe("Subscription.nuovaAnnotazione", () => {
    it("asyncIterableIterator ritorna stream con canale corretto", () => {
      const foto360Id = "foto-789";
      const mockIterator = { next: jest.fn(), return: jest.fn() };
      pubsubMock.asyncIterableIterator.mockReturnValue(mockIterator);

      const result = annotazioneResolvers.Subscription.nuovaAnnotazione.subscribe(
        null,
        { foto360Id }
      );

      expect(pubsubMock.asyncIterableIterator).toHaveBeenCalledWith([
        `NUOVA_ANNOTAZIONE_${foto360Id}`,
      ]);
      expect(result).toBe(mockIterator);
    });
  });

  describe("Annotazione.autore", () => {
    it("risolve l'autore dell'annotazione", async () => {
      const ctx = makeCtx("ADMIN");
      const mockUser = { id: "user-1", nome: "Mario", cognome: "Rossi" };
      prismaMock.user.findUnique.mockResolvedValue(mockUser);

      const result = await annotazioneResolvers.Annotazione.autore(
        { autoreId: "user-1" },
        undefined,
        ctx as any
      );

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-1" },
      });
      expect(result).toEqual(mockUser);
    });
  });
});
