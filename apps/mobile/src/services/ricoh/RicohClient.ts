import * as FileSystem from "expo-file-system/legacy";
import {
  RICOH_BASE_URL,
  OSC_ENDPOINTS,
  OSC_COMMANDS,
  COMMAND_STATUS,
  POLLING_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from "./constants";
import type {
  OscInfo,
  OscState,
  OscCommandResponse,
  OscListFilesResult,
} from "./types";

class RicohClient {
  private baseUrl: string;

  constructor(baseUrl: string = RICOH_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // GET /osc/info - Camera info (model, firmware, serial)
  async getInfo(): Promise<OscInfo> {
    const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.INFO}`);
    if (!response.ok) {
      throw new Error(`getInfo failed: ${response.status}`);
    }
    return response.json();
  }

  // POST /osc/state - Camera state (battery, storage, capture status)
  async getState(): Promise<OscState> {
    const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.STATE}`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`getState failed: ${response.status}`);
    }
    return response.json();
  }

  // POST /osc/commands/execute { name: "camera.takePicture" }
  // Returns commandId for polling, then polls until done
  async takePicture(): Promise<string> {
    const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.EXECUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ name: OSC_COMMANDS.TAKE_PICTURE }),
    });

    if (!response.ok) {
      throw new Error(`takePicture failed: ${response.status}`);
    }

    const result: OscCommandResponse = await response.json();

    if (result.state === COMMAND_STATUS.DONE && result.results?.fileUrl) {
      return result.results.fileUrl;
    }

    if (result.state === COMMAND_STATUS.ERROR) {
      throw new Error(
        `takePicture error: ${result.error?.code} - ${result.error?.message}`
      );
    }

    // Poll for completion
    if (result.id) {
      return this.waitForCompletion(result.id);
    }

    throw new Error("takePicture: no command ID returned");
  }

  // POST /osc/commands/status { id: commandId }
  async checkCommandStatus(commandId: string): Promise<OscCommandResponse> {
    const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.STATUS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ id: commandId }),
    });

    if (!response.ok) {
      throw new Error(`checkCommandStatus failed: ${response.status}`);
    }

    return response.json();
  }

  // Poll checkCommandStatus until done/error
  private async waitForCompletion(commandId: string): Promise<string> {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await this.delay(POLLING_INTERVAL_MS);
      const status = await this.checkCommandStatus(commandId);

      if (status.state === COMMAND_STATUS.DONE) {
        if (status.results?.fileUrl) {
          return status.results.fileUrl;
        }
        throw new Error("Command completed but no fileUrl in results");
      }

      if (status.state === COMMAND_STATUS.ERROR) {
        throw new Error(
          `Command error: ${status.error?.code} - ${status.error?.message}`
        );
      }
    }

    throw new Error("takePicture timed out waiting for completion");
  }

  // GET live preview stream URL (MJPEG)
  // Note: actual streaming handled by RicohPreview component via Image source
  getLivePreviewUrl(): string {
    return `${this.baseUrl}${OSC_ENDPOINTS.EXECUTE}`;
  }

  // Start live preview - returns the command body needed
  getPreviewCommandBody(): string {
    return JSON.stringify({ name: OSC_COMMANDS.GET_LIVE_PREVIEW });
  }

  // POST /osc/commands/execute { name: "camera.listFiles", parameters: {...} }
  async listFiles(entryCount: number = 10): Promise<OscListFilesResult> {
    const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.EXECUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        name: OSC_COMMANDS.LIST_FILES,
        parameters: {
          fileType: "image",
          entryCount,
          maxThumbSize: 640,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`listFiles failed: ${response.status}`);
    }

    const result: OscCommandResponse = await response.json();

    if (result.state === COMMAND_STATUS.ERROR) {
      throw new Error(
        `listFiles error: ${result.error?.code} - ${result.error?.message}`
      );
    }

    return result.results as unknown as OscListFilesResult;
  }

  // Download file from camera to local filesystem
  async downloadFile(fileUrl: string): Promise<string> {
    const fileName = fileUrl.split("/").pop() || `theta_${Date.now()}.jpg`;
    const localUri = `${FileSystem.documentDirectory}photos/${fileName}`;

    // Ensure directory exists
    const dirInfo = await FileSystem.getInfoAsync(
      `${FileSystem.documentDirectory}photos/`
    );
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}photos/`,
        { intermediates: true }
      );
    }

    const downloadResult = await FileSystem.downloadAsync(fileUrl, localUri);

    if (downloadResult.status !== 200) {
      throw new Error(`Download failed with status ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }

  // Quick connectivity check — calls getInfo with 5s timeout
  async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.INFO}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }

  // Delete a single file from camera
  async deleteFile(fileUrl: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}${OSC_ENDPOINTS.EXECUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        name: OSC_COMMANDS.DELETE,
        parameters: { fileUrls: [fileUrl] },
      }),
    });
    if (!response.ok) throw new Error(`deleteFile failed: ${response.status}`);
    const result: OscCommandResponse = await response.json();
    if (result.state === COMMAND_STATUS.ERROR) {
      throw new Error(
        `deleteFile error: ${result.error?.code} - ${result.error?.message}`
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const ricohClient = new RicohClient();
export { RicohClient };
