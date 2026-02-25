/**
 * Test Suite: JWT Auth Middleware
 *
 * Tests signToken, verifyToken, extractTokenFromRequest,
 * and getUserFromToken functions.
 */

import jwt from "jsonwebtoken";
import {
  signToken,
  verifyToken,
  extractTokenFromRequest,
  getUserFromToken,
  type JwtPayload,
} from "../src/middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET || "cervello-visivo-dev-secret";

describe("Auth Middleware — JWT", () => {
  const testPayload: JwtPayload = {
    userId: "user-abc-123",
    email: "mario.rossi@nrggold.it",
    role: "ADMIN",
  };

  // ── signToken + verifyToken round-trip ─────────────────

  describe("signToken + verifyToken round-trip", () => {
    it("firma e verifica un token correttamente", () => {
      const token = signToken(testPayload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.role).toBe(testPayload.role);
    });

    it("il token contiene le claim standard JWT (iat, exp)", () => {
      const token = signToken(testPayload);
      const decoded = jwt.decode(token) as Record<string, unknown>;

      expect(decoded).toHaveProperty("iat");
      expect(decoded).toHaveProperty("exp");
    });

    it("il token ha scadenza di 7 giorni", () => {
      const token = signToken(testPayload);
      const decoded = jwt.decode(token) as { iat: number; exp: number };

      const sevenDaysInSeconds = 7 * 24 * 60 * 60;
      expect(decoded.exp - decoded.iat).toBe(sevenDaysInSeconds);
    });
  });

  // ── extractTokenFromRequest ────────────────────────────

  describe("extractTokenFromRequest", () => {
    it("estrae il Bearer token dall'header Authorization", () => {
      const req = {
        headers: { authorization: "Bearer my-jwt-token-123" },
      } as any;

      const token = extractTokenFromRequest(req);
      expect(token).toBe("my-jwt-token-123");
    });

    it("ritorna null se l'header Authorization è assente", () => {
      const req = { headers: {} } as any;

      const token = extractTokenFromRequest(req);
      expect(token).toBeNull();
    });

    it("ritorna null se lo schema non è Bearer", () => {
      const req = {
        headers: { authorization: "Basic abc123" },
      } as any;

      const token = extractTokenFromRequest(req);
      expect(token).toBeNull();
    });

    it("ritorna null se il token manca dopo Bearer", () => {
      const req = {
        headers: { authorization: "Bearer " },
      } as any;

      const token = extractTokenFromRequest(req);
      // "Bearer ".split(" ") → ["Bearer", ""] → token is empty string → falsy
      expect(token).toBeFalsy();
    });
  });

  // ── getUserFromToken ───────────────────────────────────

  describe("getUserFromToken", () => {
    it("ritorna il payload per un token valido", () => {
      const token = signToken(testPayload);
      const user = getUserFromToken(token);

      expect(user).not.toBeNull();
      expect(user!.userId).toBe(testPayload.userId);
      expect(user!.email).toBe(testPayload.email);
      expect(user!.role).toBe(testPayload.role);
    });

    it("ritorna null se il token è null", () => {
      const user = getUserFromToken(null);
      expect(user).toBeNull();
    });

    it("ritorna null per un token scaduto", () => {
      // Create an expired token (already expired 1 second ago)
      const expiredToken = jwt.sign(testPayload, JWT_SECRET, {
        expiresIn: "-1s",
      });

      const user = getUserFromToken(expiredToken);
      expect(user).toBeNull();
    });

    it("ritorna null per un token con firma invalida", () => {
      const invalidToken = jwt.sign(testPayload, "wrong-secret", {
        expiresIn: "7d",
      });

      const user = getUserFromToken(invalidToken);
      expect(user).toBeNull();
    });

    it("ritorna null per un token malformato", () => {
      const user = getUserFromToken("not-a-valid-jwt");
      expect(user).toBeNull();
    });
  });
});
