/**
 * Test Suite: RicohClient — Ricoh Theta SC2 OSC API
 *
 * Tests camera communication via OSC protocol:
 * takePicture, polling, downloadFile, getInfo.
 */

// ─── Mock expo-file-system ───────────────────────────────

jest.mock("expo-file-system", () => ({
  documentDirectory: "file:///data/user/0/app/files/",
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
}));

import * as FileSystem from "expo-file-system";
import { RicohClient } from "../src/services/ricoh/RicohClient";
import {
  RICOH_BASE_URL,
  OSC_ENDPOINTS,
  OSC_COMMANDS,
} from "../src/services/ricoh/constants";

// ─── Mock fetch ──────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ─── Test Suite ──────────────────────────────────────────

describe("RicohClient — OSC API", () => {
  let client: RicohClient;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    client = new RicohClient(RICOH_BASE_URL);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── getInfo ─────────────────────────────────────────────

  describe("getInfo", () => {
    it("chiama GET /osc/info e parsa la risposta", async () => {
      const mockInfo = {
        manufacturer: "RICOH",
        model: "RICOH THETA SC2",
        serialNumber: "12345678",
        firmwareVersion: "1.20",
        supportUrl: "https://theta360.com",
        endpoints: { httpPort: 80, httpUpdatesPort: 80 },
        apiLevel: [2],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockInfo),
      });

      const result = await client.getInfo();

      expect(mockFetch).toHaveBeenCalledWith(
        `${RICOH_BASE_URL}${OSC_ENDPOINTS.INFO}`
      );
      expect(result.manufacturer).toBe("RICOH");
      expect(result.model).toBe("RICOH THETA SC2");
      expect(result.serialNumber).toBe("12345678");
    });

    it("errore HTTP → throw Error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(client.getInfo()).rejects.toThrow("getInfo failed: 500");
    });
  });

  // ── takePicture ─────────────────────────────────────────

  describe("takePicture", () => {
    it("chiama POST /osc/commands/execute con camera.takePicture", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "done",
            results: { fileUrl: "http://192.168.1.1/files/100/photo.JPG" },
          }),
      });

      await client.takePicture();

      expect(mockFetch).toHaveBeenCalledWith(
        `${RICOH_BASE_URL}${OSC_ENDPOINTS.EXECUTE}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ name: OSC_COMMANDS.TAKE_PICTURE }),
        }
      );
    });

    it("ritorna fileUrl quando il comando è immediatamente 'done'", async () => {
      const fileUrl = "http://192.168.1.1/files/100/photo.JPG";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "done",
            results: { fileUrl },
          }),
      });

      const result = await client.takePicture();
      expect(result).toBe(fileUrl);
    });

    it("polling checkCommandStatus fino a stato 'done'", async () => {
      // First call: takePicture returns inProgress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "inProgress",
            id: "cmd-123",
          }),
      });

      // Second call: status still inProgress
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "inProgress",
            id: "cmd-123",
            progress: { completion: 0.5 },
          }),
      });

      // Third call: status done
      const fileUrl = "http://192.168.1.1/files/100/photo.JPG";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "done",
            id: "cmd-123",
            results: { fileUrl },
          }),
      });

      // Use real timers for this test since we need async delays
      jest.useRealTimers();
      const result = await client.takePicture();
      jest.useFakeTimers();

      expect(result).toBe(fileUrl);
      // 1 execute + 2 status polls
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify status polling called /osc/commands/status
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        `${RICOH_BASE_URL}${OSC_ENDPOINTS.STATUS}`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: "cmd-123" }),
        })
      );
    });

    it("errore dal comando → throw Error con code e message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "error",
            error: { code: "cameraError", message: "Storage full" },
          }),
      });

      await expect(client.takePicture()).rejects.toThrow(
        "takePicture error: cameraError - Storage full"
      );
    });

    it("HTTP error durante takePicture → throw Error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

      await expect(client.takePicture()).rejects.toThrow(
        "takePicture failed: 503"
      );
    });
  });

  // ── downloadFile ────────────────────────────────────────

  describe("downloadFile", () => {
    const fileUrl = "http://192.168.1.1/files/100/R0013000.JPG";

    it("salva file nel percorso corretto (expo-file-system)", async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
        exists: true,
      });
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
        status: 200,
        uri: "file:///data/user/0/app/files/photos/R0013000.JPG",
      });

      const result = await client.downloadFile(fileUrl);

      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        fileUrl,
        "file:///data/user/0/app/files/photos/R0013000.JPG"
      );
      expect(result).toBe(
        "file:///data/user/0/app/files/photos/R0013000.JPG"
      );
    });

    it("crea la directory photos/ se non esiste", async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
        exists: false,
      });
      (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValueOnce(
        undefined
      );
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
        status: 200,
        uri: "file:///data/user/0/app/files/photos/R0013000.JPG",
      });

      await client.downloadFile(fileUrl);

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        "file:///data/user/0/app/files/photos/",
        { intermediates: true }
      );
    });

    it("download fallito → throw Error", async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
        exists: true,
      });
      (FileSystem.downloadAsync as jest.Mock).mockResolvedValueOnce({
        status: 404,
        uri: "",
      });

      await expect(client.downloadFile(fileUrl)).rejects.toThrow(
        "Download failed with status 404"
      );
    });
  });

  // ── checkCommandStatus ──────────────────────────────────

  describe("checkCommandStatus", () => {
    it("chiama POST /osc/commands/status con il commandId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            name: "camera.takePicture",
            state: "done",
            id: "cmd-abc",
            results: { fileUrl: "http://192.168.1.1/files/100/photo.JPG" },
          }),
      });

      const result = await client.checkCommandStatus("cmd-abc");

      expect(mockFetch).toHaveBeenCalledWith(
        `${RICOH_BASE_URL}${OSC_ENDPOINTS.STATUS}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ id: "cmd-abc" }),
        }
      );
      expect(result.state).toBe("done");
    });
  });
});
