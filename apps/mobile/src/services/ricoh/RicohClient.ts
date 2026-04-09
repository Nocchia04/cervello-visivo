/**
 * RicohClient — Client HTTP per la RICOH THETA SC2.
 *
 * Usa cameraFetch() da ThetaWifi.ts che su Android 10+ instrada
 * le richieste sulla rete camera (WifiNetworkSpecifier) mantenendo
 * i dati mobili per il resto dell'app.
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { cameraFetch, downloadFileViaCameraNetwork } from "./ThetaWifi";
import { dlog } from "../../lib/debugLog";
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

  private async oscGet(endpoint: string): Promise<any> {
    dlog('CAM', `GET ${endpoint}`);
    const res = await cameraFetch(`${this.baseUrl}${endpoint}`);
    if (res.status !== 200) {
      dlog('CAM', `GET ${endpoint} → HTTP ${res.status}: ${res.body.substring(0, 200)}`);
      throw new Error(`HTTP ${res.status} on ${endpoint}`);
    }
    return JSON.parse(res.body);
  }

  private async oscPost(endpoint: string, body: object): Promise<any> {
    dlog('CAM', `POST ${endpoint} ${JSON.stringify(body).substring(0, 100)}`);
    const res = await cameraFetch(
      `${this.baseUrl}${endpoint}`,
      "POST",
      JSON.stringify(body)
    );
    if (res.status !== 200) {
      dlog('CAM', `POST ${endpoint} → HTTP ${res.status}: ${res.body.substring(0, 200)}`);
      throw new Error(`HTTP ${res.status} on ${endpoint}`);
    }
    if (!res.body.trim()) return {};
    return JSON.parse(res.body);
  }

  async getInfo(): Promise<OscInfo> {
    return this.oscGet(OSC_ENDPOINTS.INFO);
  }

  async getState(): Promise<OscState> {
    return this.oscPost(OSC_ENDPOINTS.STATE, {});
  }

  async takePicture(): Promise<string> {
    const result: OscCommandResponse = await this.oscPost(
      OSC_ENDPOINTS.EXECUTE,
      { name: OSC_COMMANDS.TAKE_PICTURE }
    );

    if (result.state === COMMAND_STATUS.DONE && result.results?.fileUrl) {
      return result.results.fileUrl as string;
    }
    if (result.state === COMMAND_STATUS.ERROR) {
      throw new Error(
        `takePicture error: ${result.error?.code} - ${result.error?.message}`
      );
    }
    if (result.id) {
      return this.waitForCompletion(result.id);
    }
    throw new Error("takePicture: nessun command ID");
  }

  async checkCommandStatus(commandId: string): Promise<OscCommandResponse> {
    return this.oscPost(OSC_ENDPOINTS.STATUS, { id: commandId });
  }

  private async waitForCompletion(commandId: string): Promise<string> {
    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await this.delay(POLLING_INTERVAL_MS);
      const status = await this.checkCommandStatus(commandId);
      if (status.state === COMMAND_STATUS.DONE) {
        if (status.results?.fileUrl) return status.results.fileUrl as string;
        throw new Error("Command completato ma nessun fileUrl");
      }
      if (status.state === COMMAND_STATUS.ERROR) {
        throw new Error(
          `Command error: ${status.error?.code} - ${status.error?.message}`
        );
      }
    }
    throw new Error("takePicture: timeout polling");
  }

  async listFiles(entryCount: number = 10): Promise<OscListFilesResult> {
    const result: OscCommandResponse = await this.oscPost(
      OSC_ENDPOINTS.EXECUTE,
      {
        name: OSC_COMMANDS.LIST_FILES,
        parameters: {
          fileType: "image",
          entryCount,
          maxThumbSize: 0, // SC2: maxThumbSize 640 causa freeze! Usa 0
        },
      }
    );
    if (result.state === COMMAND_STATUS.ERROR) {
      throw new Error(
        `listFiles error: ${result.error?.code} - ${result.error?.message}`
      );
    }
    return result.results as unknown as OscListFilesResult;
  }

  // Download file — su Android 10+ usa il modulo nativo (network.openConnection)
  // così il socket è legato alla rete camera; altrove usa expo-file-system.
  async downloadFile(fileUrl: string): Promise<string> {
    const fileName = fileUrl.split("/").pop() || `theta_${Date.now()}.jpg`;
    const dirUri = `${FileSystem.documentDirectory}photos/`;
    const localUri = `${dirUri}${fileName}`;

    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }

    const isAndroid10 = Platform.OS === "android" && (Platform.Version as number) >= 29;
    if (isAndroid10) {
      // Rimuovi prefisso file:// per il path nativo Java
      const nativePath = localUri.replace(/^file:\/\//, "");
      await downloadFileViaCameraNetwork(fileUrl, nativePath);
      return localUri;
    }

    const downloadResult = await FileSystem.downloadAsync(fileUrl, localUri);
    if (downloadResult.status !== 200) {
      throw new Error(`Download fallito: ${downloadResult.status}`);
    }
    return downloadResult.uri;
  }

  async checkConnection(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      dlog('CAM', `checkConnection OK: ${info.model ?? 'unknown'} (${info.serialNumber ?? '?'})`);
      return true;
    } catch (e: any) {
      dlog('CAM', `checkConnection FAIL: ${e.message}`);
      return false;
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const result: OscCommandResponse = await this.oscPost(
      OSC_ENDPOINTS.EXECUTE,
      {
        name: OSC_COMMANDS.DELETE,
        parameters: { fileUrls: [fileUrl] },
      }
    );
    if (result.state === COMMAND_STATUS.ERROR) {
      throw new Error(
        `deleteFile error: ${result.error?.code} - ${result.error?.message}`
      );
    }
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ricohClient = new RicohClient();
export { RicohClient };
