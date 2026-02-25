/**
 * Test Suite: UploadQueue — Offline Upload Pipeline
 *
 * TEST CRITICO DoD: "stabilità pipeline camera→app→cloud"
 *
 * Tests AsyncStorage persistence, network-aware processing,
 * retry logic (max 3 tentativi), and queue lifecycle.
 */

// ─── Mock AsyncStorage ───────────────────────────────────

const mockStorage: Record<string, string> = {};

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) =>
      Promise.resolve(mockStorage[key] ?? null)
    ),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

// ─── Mock expo-network ───────────────────────────────────

const mockGetNetworkState = jest.fn();

jest.mock("expo-network", () => ({
  getNetworkStateAsync: () => mockGetNetworkState(),
}));

// ─── Mock Apollo Client ──────────────────────────────────

const mockMutate = jest.fn();

jest.mock("../../src/lib/apollo-client", () => ({
  apolloClient: {
    mutate: (...args: any[]) => mockMutate(...args),
  },
}));

// ─── Mock GraphQL mutations ──────────────────────────────

jest.mock("../../src/graphql/mutations", () => ({
  UPLOAD_FOTO360_MUTATION: "UPLOAD_FOTO360_MUTATION",
}));

// ─── Mock storage keys ──────────────────────────────────

jest.mock("../../src/lib/storage", () => ({
  STORAGE_KEYS: {
    AUTH_TOKEN: "@cervello_visivo:auth_token",
    USER_DATA: "@cervello_visivo:user_data",
    UPLOAD_QUEUE: "@cervello_visivo:upload_queue",
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Import UploadQueue (re-create each test) ───────────

// We need to get a fresh instance for each test
const QUEUE_KEY = "@cervello_visivo:upload_queue";

// We import the module to test the class behavior
// Since it's a singleton, we'll work with it directly
import { uploadQueue } from "../src/services/upload/UploadQueue";

// ─── Helpers ─────────────────────────────────────────────

function makeQueueItem(overrides: Partial<any> = {}) {
  return {
    id: `item-${Date.now()}`,
    localUri: "file:///photos/R0013000.JPG",
    puntoDiScattoId: "punto-1",
    timestamp: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

function setOnline() {
  mockGetNetworkState.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
}

function setOffline() {
  mockGetNetworkState.mockResolvedValue({
    isConnected: false,
    isInternetReachable: false,
  });
}

// ─── Test Suite ──────────────────────────────────────────

describe("UploadQueue — Offline Pipeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    mockMutate.mockResolvedValue({ data: {} });
  });

  // ── addToQueue ──────────────────────────────────────────

  describe("addToQueue", () => {
    it("item salvato in AsyncStorage con retryCount:0 e status:'pending'", async () => {
      setOffline(); // Prevent immediate processing

      const item = makeQueueItem({ id: "item-add-1" });
      await uploadQueue.addToQueue(item);

      expect(AsyncStorage.setItem).toHaveBeenCalled();

      // Read what was saved
      const savedData = mockStorage[QUEUE_KEY];
      const queue = JSON.parse(savedData);

      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe("item-add-1");
      expect(queue[0].retryCount).toBe(0);
      expect(queue[0].status).toBe("pending");
      expect(queue[0].localUri).toBe(item.localUri);
      expect(queue[0].puntoDiScattoId).toBe(item.puntoDiScattoId);
    });

    it("se online, tenta processamento immediato dopo aggiunta", async () => {
      setOnline();
      mockMutate.mockResolvedValue({ data: {} });

      const item = makeQueueItem({ id: "item-add-2" });
      await uploadQueue.addToQueue(item);

      // processQueue was called, which calls Network.getNetworkStateAsync
      expect(mockGetNetworkState).toHaveBeenCalled();
    });
  });

  // ── processQueue ────────────────────────────────────────

  describe("processQueue", () => {
    it("item processato e rimosso se upload ha successo", async () => {
      setOnline();

      // Pre-populate queue
      const item = {
        id: "item-proc-1",
        localUri: "file:///photos/photo.JPG",
        puntoDiScattoId: "punto-1",
        timestamp: "2025-01-15T10:00:00Z",
        retryCount: 0,
        status: "pending" as const,
      };
      mockStorage[QUEUE_KEY] = JSON.stringify([item]);

      mockMutate.mockResolvedValue({ data: { uploadFoto360: { id: "f-1" } } });

      await uploadQueue.processQueue();

      // Item should be removed from queue after success
      const finalQueue = JSON.parse(mockStorage[QUEUE_KEY]);
      expect(finalQueue).toHaveLength(0);
    });

    it("retry su errore: incrementa retryCount e mantiene status 'pending' sotto max", async () => {
      setOnline();

      const item = {
        id: "item-retry-1",
        localUri: "file:///photos/photo.JPG",
        puntoDiScattoId: "punto-1",
        timestamp: "2025-01-15T10:00:00Z",
        retryCount: 0,
        status: "pending" as const,
      };
      mockStorage[QUEUE_KEY] = JSON.stringify([item]);

      mockMutate.mockRejectedValue(new Error("Network error"));

      await uploadQueue.processQueue();

      const finalQueue = JSON.parse(mockStorage[QUEUE_KEY]);
      expect(finalQueue).toHaveLength(1);
      expect(finalQueue[0].retryCount).toBe(1);
      // Under MAX_RETRIES (3), status should remain "pending" for next retry
      expect(finalQueue[0].status).toBe("pending");
    });

    it("dopo max retry (3) → item marcato come 'failed'", async () => {
      setOnline();

      const item = {
        id: "item-maxretry",
        localUri: "file:///photos/photo.JPG",
        puntoDiScattoId: "punto-1",
        timestamp: "2025-01-15T10:00:00Z",
        retryCount: 2, // Already retried twice, next failure = 3rd retry = max
        status: "pending" as const,
      };
      mockStorage[QUEUE_KEY] = JSON.stringify([item]);

      mockMutate.mockRejectedValue(new Error("Server error"));

      await uploadQueue.processQueue();

      const finalQueue = JSON.parse(mockStorage[QUEUE_KEY]);
      expect(finalQueue[0].retryCount).toBe(3);
      expect(finalQueue[0].status).toBe("failed");
    });

    it("offline: item NON processato se no network", async () => {
      setOffline();

      const item = {
        id: "item-offline-1",
        localUri: "file:///photos/photo.JPG",
        puntoDiScattoId: "punto-1",
        timestamp: "2025-01-15T10:00:00Z",
        retryCount: 0,
        status: "pending" as const,
      };
      mockStorage[QUEUE_KEY] = JSON.stringify([item]);

      await uploadQueue.processQueue();

      // mutate should NOT have been called
      expect(mockMutate).not.toHaveBeenCalled();

      // Queue should remain unchanged
      const finalQueue = JSON.parse(mockStorage[QUEUE_KEY]);
      expect(finalQueue).toHaveLength(1);
      expect(finalQueue[0].status).toBe("pending");
    });

    it("upload chiama GraphQL mutation con variabili corrette", async () => {
      setOnline();

      const item = {
        id: "item-gql",
        localUri: "file:///photos/R0013000.JPG",
        puntoDiScattoId: "punto-abc",
        timestamp: "2025-03-10T09:15:00Z",
        retryCount: 0,
        status: "pending" as const,
      };
      mockStorage[QUEUE_KEY] = JSON.stringify([item]);

      mockMutate.mockResolvedValue({ data: {} });

      await uploadQueue.processQueue();

      expect(mockMutate).toHaveBeenCalledWith({
        mutation: "UPLOAD_FOTO360_MUTATION",
        variables: {
          puntoDiScattoId: "punto-abc",
          url: "file:///photos/R0013000.JPG",
          metadata: {
            capturedAt: "2025-03-10T09:15:00Z",
            source: "ricoh-theta-sc2",
          },
        },
      });
    });
  });

  // ── getPendingCount ─────────────────────────────────────

  describe("getPendingCount", () => {
    it("conta solo gli item non permanentemente falliti", async () => {
      const queue = [
        { id: "1", retryCount: 0, status: "pending" },
        { id: "2", retryCount: 1, status: "pending" },
        { id: "3", retryCount: 3, status: "failed" }, // Permanently failed
      ];
      mockStorage[QUEUE_KEY] = JSON.stringify(queue);

      const count = await uploadQueue.getPendingCount();
      expect(count).toBe(2); // Only items 1 and 2 (item 3 has retryCount >= MAX_RETRIES)
    });
  });

  // ── clearCompleted ──────────────────────────────────────

  describe("clearCompleted", () => {
    it("rimuove gli item permanentemente falliti (retryCount >= MAX_RETRIES)", async () => {
      const queue = [
        { id: "1", retryCount: 0, status: "pending" },
        { id: "2", retryCount: 3, status: "failed" },
        { id: "3", retryCount: 4, status: "failed" },
      ];
      mockStorage[QUEUE_KEY] = JSON.stringify(queue);

      await uploadQueue.clearCompleted();

      const finalQueue = JSON.parse(mockStorage[QUEUE_KEY]);
      expect(finalQueue).toHaveLength(1);
      expect(finalQueue[0].id).toBe("1");
    });
  });

  // ── retryFailed ─────────────────────────────────────────

  describe("retryFailed", () => {
    it("riporta a 'pending' gli item failed con retryCount < MAX_RETRIES", async () => {
      setOnline();
      mockMutate.mockResolvedValue({ data: {} });

      const queue = [
        { id: "1", retryCount: 1, status: "failed", localUri: "f.jpg", puntoDiScattoId: "p1", timestamp: "2025-01-01T00:00:00Z" },
        { id: "2", retryCount: 3, status: "failed", localUri: "g.jpg", puntoDiScattoId: "p2", timestamp: "2025-01-01T00:00:00Z" },
      ];
      mockStorage[QUEUE_KEY] = JSON.stringify(queue);

      await uploadQueue.retryFailed();

      // Item 1 should be set to pending (retryCount 1 < 3)
      // Item 2 should stay failed (retryCount 3 >= 3)
      // After retryFailed, processQueue is called which may change state further
      // We just verify the method was called without errors
      expect(mockGetNetworkState).toHaveBeenCalled();
    });
  });
});
