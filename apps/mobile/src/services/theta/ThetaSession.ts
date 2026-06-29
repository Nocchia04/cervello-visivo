/**
 * ThetaSession — control-plane UFFICIALE della camera RICOH THETA.
 *
 * Wrappa l'SDK ufficiale `theta-client-react-native` (Ktor) gestendo il ciclo
 * di vita completo della sessione camera su Android 10+:
 *
 *   connectToCamera (WifiNetworkSpecifier, modulo nativo nostro)
 *     → bindToCameraNetwork (bindProcessToNetwork: l'SDK usa la rete di
 *       default del processo, senza bind ogni chiamata Ktor fallirebbe)
 *     → initialize() con retry (l'httpd della camera parte qualche secondo
 *       dopo l'AP al wake)
 *     → getThetaInfo() → modello rilevato e salvato (THETA_V / SC2 / SC2_B)
 *     → setOptions sleep/offDelay DISABLE (una volta per sessione)
 *   NB: il PhotoCapture dell'SDK è MONOUSO (il nativo lo azzera dopo ogni
 *   takePicture) → si ricostruisce con build() prima di OGNI scatto, non
 *   una volta per sessione.
 *
 * Modelli supportati: THETA V, THETA SC2, THETA SC2 for business.
 * La distinzione SC2 vs SC2_B la fa l'SDK dalla prima lettera del seriale.
 *
 * Il download del file resta sul modulo nativo (downloadFileViaCameraNetwork,
 * 4 chunk + retry + verifica completezza): l'SDK non ha API di download.
 * La live preview resta su ThetaPreviewView (nativo, Network esplicita) e
 * NON dipende dal bind del processo.
 */
import * as FileSystem from "expo-file-system/legacy";
import { Platform, AppState } from "react-native";
import {
  initialize,
  getThetaInfo,
  getThetaState,
  getPhotoCaptureBuilder,
  setOptions,
  PhotoCapture,
  ThetaModel,
  PhotoFileFormatEnum,
  FilterEnum,
  SleepDelayEnum,
  OffDelayEnum,
  BluetoothPowerEnum,
  WlanAntennaConfigEnum,
  CapturingStatusEnum,
  type Options,
} from "theta-client-react-native";
import {
  connectToCamera,
  disconnectFromCamera,
  isCameraWifiConnected,
  bindToCameraNetwork,
  unbindFromCameraNetwork,
  downloadFileViaCameraNetwork,
  capturePreviewFrame as nativeCapturePreviewFrame,
  countOtherWifiNetworks,
  onWifiLost,
} from "../ricoh/ThetaWifi";
import { setCameraModel } from "../../lib/storage";
import { dlog } from "../../lib/debugLog";

const CAMERA_ENDPOINT = "http://192.168.1.1";

/**
 * Intervallo polling commands/status dell'SDK durante takePicture.
 * Default SDK 1000ms → in media +500ms di latenza post-scatto. 500ms la
 * dimezza; non sotto: l'httpd della SC2 è single-thread e fragile sotto
 * polling fitto.
 */
const CHECK_STATUS_INTERVAL_MS = 500;

/** Tentativi di initialize() — copre l'httpd camera in avvio dopo il wake. */
const INIT_ATTEMPTS = 3;
const INIT_BACKOFF_MS = [1_500, 3_000];

export type SessionStatus = "disconnected" | "connecting" | "ready";

type StatusListener = (status: SessionStatus) => void;

const isAndroid10Plus =
  Platform.OS === "android" && (Platform.Version as number) >= 29;

class ThetaSession {
  private status: SessionStatus = "disconnected";
  private model: ThetaModel | null = null;
  private serial: string | null = null;
  private firmware: string | null = null;
  // SDK inizializzato e opzioni di sessione applicate. NB: il PhotoCapture
  // dell'SDK è MONOUSO (azzerato dal nativo dopo ogni takePicture), quindi
  // NON lo teniamo in sessione — lo ricostruiamo prima di ogni scatto.
  private initialized = false;
  // Mutex: connessioni concorrenti (es. preview + scatto al mount) condividono
  // la stessa promise invece di duplicare il flusso connect/initialize.
  private connectPromise: Promise<void> | null = null;
  // Contatore di bind: il processo è bindato alla rete camera SOLO durante le
  // chiamate SDK (Ktor usa la rete di default). Fuori da quelle resta UNBOUND
  // → internet sempre disponibile (Apollo, upload). Reentrante (setOptions
  // dentro doConnect). Vedi withBind().
  private bindDepth = 0;
  private listeners = new Set<StatusListener>();
  private bgTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // La rete camera può cadere in qualsiasi momento (sleep camera, RF):
    // invalida la sessione, il prossimo ensureConnected rifà tutto.
    onWifiLost(() => {
      dlog("CAM", "WiFi camera perso — sessione invalidata");
      this.invalidate();
    });
    // La sessione resta viva tra gli screen (scatto ↔ piantina). Si chiude del
    // tutto solo quando l'app resta DAVVERO in background per qualche secondo.
    // CRITICO: il dialogo WiFi di sistema ("Connetti a THETA…") porta l'app a
    // 'inactive'/'background' transitoriamente — disconnettere lì ANNULLEREBBE
    // il dialogo stesso. Quindi: ignora 'inactive', debounce 5s su 'background'
    // (annullato se si torna 'active'), e mai disconnettere durante una
    // connessione in corso (connectPromise) o una chiamata SDK (bindDepth>0).
    AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (this.bgTimer) {
          clearTimeout(this.bgTimer);
          this.bgTimer = null;
        }
        return;
      }
      if (s !== "background") return; // ignora 'inactive' (transitorio)
      if (this.bgTimer) clearTimeout(this.bgTimer);
      this.bgTimer = setTimeout(() => {
        this.bgTimer = null;
        if (this.connectPromise || this.bindDepth > 0) return; // non interrompere
        this.disconnect().catch(() => {});
      }, 5000);
    });
  }

  /**
   * Esegue una chiamata SDK con il processo bindato alla rete camera, poi
   * sbinda. Reentrante (bind solo al primo livello, unbind all'ultimo) così
   * setOptions annidati dentro doConnect non sbindano a metà.
   */
  private async withBind<T>(fn: () => Promise<T>): Promise<T> {
    if (this.bindDepth === 0) {
      await bindToCameraNetwork().catch(() => {});
    }
    this.bindDepth++;
    try {
      return await fn();
    } finally {
      this.bindDepth--;
      if (this.bindDepth === 0) {
        await unbindFromCameraNetwork().catch(() => {});
      }
    }
  }

  // ── Stato ──────────────────────────────────────────────────────────────────

  getStatus(): SessionStatus {
    return this.status;
  }

  getModel(): ThetaModel | null {
    return this.model;
  }

  getSerial(): string | null {
    return this.serial;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(status: SessionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach((fn) => {
      try {
        fn(status);
      } catch {}
    });
  }

  private invalidate() {
    this.initialized = false;
    this.setStatus("disconnected");
  }

  // ── Connessione ────────────────────────────────────────────────────────────

  /**
   * Porta la sessione a "ready": WiFi connesso, processo bindato, SDK
   * inizializzato, opzioni di sessione applicate, PhotoCapture pronto.
   * Idempotente: se già ready (e il WiFi è ancora su) è un no-op; se una
   * connessione è in corso, si aggancia a quella.
   */
  async ensureConnected(ssid: string, password: string): Promise<void> {
    if (this.status === "ready" && this.initialized) {
      const stillConnected = await isCameraWifiConnected();
      if (stillConnected) return; // sessione viva → no-op (punto 2 istantaneo)
      this.invalidate();
    }
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect(ssid, password).finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async doConnect(ssid: string, password: string): Promise<void> {
    this.setStatus("connecting");
    try {
      // 1. WiFi camera (WifiNetworkSpecifier — retry x3 interno). Resta
      //    connessa per tutta la sessione (non si disconnette tra gli screen).
      await connectToCamera(ssid, password);

      // 2-6. Init SDK: tutte chiamate Ktop → bindate (withBind), poi unbind.
      await this.withBind(async () => {
        // initialize() con retry: dopo il wake l'httpd della camera arriva
        // qualche secondo dopo l'AP — un connect rifiutato qui è normale.
        let lastErr: unknown = null;
        let initialized = false;
        for (let attempt = 0; attempt < INIT_ATTEMPTS; attempt++) {
          try {
            await initialize(CAMERA_ENDPOINT, undefined, {
              connectTimeout: 5_000,
              requestTimeout: 15_000,
              socketTimeout: 15_000,
            });
            initialized = true;
            break;
          } catch (err) {
            lastErr = err;
            dlog(
              "CAM",
              `initialize tentativo ${attempt + 1} fallito: ${err instanceof Error ? err.message : err}`
            );
            if (attempt < INIT_ATTEMPTS - 1) {
              await new Promise((r) => setTimeout(r, INIT_BACKOFF_MS[attempt]));
            }
          }
        }
        if (!initialized) throw lastErr ?? new Error("initialize fallito");

        // Modello camera (l'SDK distingue SC2 vs SC2_B dal seriale)
        const info = await getThetaInfo();
        this.model = info.thetaModel ?? null;
        this.serial = info.serialNumber;
        this.firmware = info.firmwareVersion;
        dlog("CAM", `Camera: ${info.model} (${info.serialNumber}) fw ${info.firmwareVersion} → ${this.model}`);
        if (this.model) {
          setCameraModel(this.model).catch(() => {});
        }

        // Opzioni di sessione: niente sleep/spegnimento durante il lavoro.
        await this.trySetOptions({
          sleepDelay: SleepDelayEnum.DISABLE,
          offDelay: OffDelayEnum.DISABLE,
        });
        // Spegni il BLE della camera (antenna condivisa BLE+WiFi sulla SC2).
        await this.trySetOptions({ bluetoothPower: BluetoothPowerEnum.OFF });
      });

      // NB: il PhotoCapture si costruisce in takePhoto (monouso), non qui.
      this.initialized = true;
      this.setStatus("ready");
    } catch (err) {
      this.invalidate();
      throw err;
    }
  }

  /**
   * Solo unbind del processo (ripristina internet). NON disconnette il WiFi
   * né invalida la sessione: con il modello bind-per-chiamata il processo è
   * già unbound fuori dalle chiamate SDK, quindi questo è quasi un no-op —
   * tenuto per compatibilità di chiamata dallo screen.
   */
  async suspend(): Promise<void> {
    if (this.bindDepth === 0) {
      await unbindFromCameraNetwork().catch(() => {});
    }
  }

  /**
   * Chiude DEL TUTTO la sessione: invalida SDK + disconnette il WiFi camera.
   * Chiamata solo quando l'app va in background (non tra gli screen).
   */
  async disconnect(): Promise<void> {
    this.invalidate();
    try {
      await unbindFromCameraNetwork();
    } catch {}
    try {
      await disconnectFromCamera();
    } catch {}
  }

  // ── Operazioni camera ──────────────────────────────────────────────────────

  /**
   * Scatta una foto (procedura ufficiale: camera.takePicture → polling
   * commands/status → results.fileUrl). Richiede sessione ready.
   * @returns fileUrl del JPEG sulla camera
   */
  async takePhoto(
    onCapturing?: (status: CapturingStatusEnum) => void
  ): Promise<string> {
    if (this.status !== "ready" || !this.initialized) {
      throw new Error("Camera non connessa. Riapri la schermata di scatto.");
    }
    // PhotoCapture è MONOUSO nell'SDK (il nativo lo azzera dopo ogni
    // takePicture): va COSTRUITO fresco prima di ogni scatto. build() +
    // takePicture sono chiamate SDK → un solo bind del processo per entrambe.
    const fileUrl = await this.withBind(async () => {
      const pc = await getPhotoCaptureBuilder()
        .setFileFormat(PhotoFileFormatEnum.IMAGE_5K)
        .setFilter(FilterEnum.OFF)
        .setCheckStatusCommandInterval(CHECK_STATUS_INTERVAL_MS)
        .build();
      return pc.takePicture(onCapturing);
    });
    if (!fileUrl) {
      throw new Error("Scatto annullato dalla camera.");
    }
    return fileUrl;
  }

  /**
   * "Scatta" catturando l'ultimo frame della live preview (1024×512) come
   * JPEG locale. Zero download dalla camera, istantaneo. Richiede preview
   * attiva. Ritorna il file:// uri locale.
   */
  async capturePreviewFrame(): Promise<string> {
    const dirUri = `${FileSystem.documentDirectory}photos/`;
    const localUri = `${dirUri}frame_${Date.now()}.jpg`;
    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }
    const nativePath = localUri.replace(/^file:\/\//, "");
    await nativeCapturePreviewFrame(nativePath);
    return localUri;
  }

  /** Batteria 0-100, o null se lo stato non è leggibile (soft-fail). */
  async getBatteryLevel(): Promise<number | null> {
    try {
      const state = await this.withBind(() => getThetaState());
      if (typeof state.batteryLevel !== "number") return null;
      const pct = Math.round(state.batteryLevel * 100);
      // Telemetria: sotto ~20% la SC2 riduce la potenza radio (download lenti)
      dlog("CAM", `Batteria camera: ${pct}%${pct < 20 ? " ⚠️ BASSA — la camera riduce la potenza WiFi" : ""}`);
      return pct;
    } catch {
      return null;
    }
  }

  /**
   * Applica opzioni ignorando gli errori (opzioni non supportate dal
   * modello/firmware non devono far fallire il flusso).
   */
  async trySetOptions(options: Options): Promise<boolean> {
    try {
      await this.withBind(() => setOptions(options));
      return true;
    } catch (err) {
      dlog(
        "CAM",
        `setOptions ignorato (${err instanceof Error ? err.message : err}): ${JSON.stringify(options).substring(0, 120)}`
      );
      return false;
    }
  }

  // ── Download (modulo nativo — l'SDK non ha API di download) ───────────────

  /**
   * Scarica il JPEG pieno dalla camera su storage locale.
   * Android 10+: modulo nativo (singolo GET + retry + verifica completezza).
   * Logga tempo e velocità nel Debug Log in-app (bottone "Log") per
   * diagnosi in cantiere senza adb.
   */
  async downloadPhoto(fileUrl: string): Promise<string> {
    const fileName = fileUrl.split("/").pop() || `theta_${Date.now()}.jpg`;
    const dirUri = `${FileSystem.documentDirectory}photos/`;
    const localUri = `${dirUri}${fileName}`;

    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }

    const start = Date.now();
    let resultUri: string;

    // Diagnostica dual-STA: un secondo WiFi attivo (casa/ufficio) divide
    // l'airtime della radio col link camera → download strozzato (~50 KB/s).
    countOtherWifiNetworks()
      .then((n) => {
        if (n > 0) {
          dlog(
            "WARN",
            `DUAL-WIFI: ${n} altra rete WiFi attiva oltre alla camera — la radio è condivisa e il download rallenta molto. Disattiva il WiFi di casa/ufficio.`
          );
        }
      })
      .catch(() => {});

    if (isAndroid10Plus) {
      const nativePath = localUri.replace(/^file:\/\//, "");
      // Il download usa la Network camera ESPLICITA (network.openConnection),
      // non il routing di default → indipendente dal bind. Col modello
      // bind-per-chiamata il processo è già unbound qui (internet disponibile
      // per gli upload concorrenti). Niente bind management.
      const { diag } = await downloadFileViaCameraNetwork(fileUrl, nativePath);
      diag.forEach((line) => dlog("CAM", line)); // diagnostica nel Debug Log
      resultUri = localUri;
    } else {
      // iOS / Android < 10: il processo non è bindato a reti separate,
      // downloadAsync raggiunge la camera direttamente.
      const result = await FileSystem.downloadAsync(fileUrl, localUri);
      if (result.status !== 200) {
        throw new Error(`Download fallito: ${result.status}`);
      }
      resultUri = result.uri;
    }

    // Telemetria leggibile in-app: secondi, MB e KB/s del transfer.
    try {
      const elapsed = Date.now() - start;
      const info = await FileSystem.getInfoAsync(resultUri);
      const bytes = info.exists && "size" in info ? (info.size ?? 0) : 0;
      const kbs = elapsed > 0 ? Math.round((bytes / 1024) / (elapsed / 1000)) : 0;
      dlog(
        "CAM",
        `Download foto: ${(elapsed / 1000).toFixed(1)}s, ${(bytes / 1024 / 1024).toFixed(1)} MB, ${kbs} KB/s`
      );
    } catch {}

    return resultUri;
  }

  /**
   * Scarica solo la thumbnail (~100-300 KB) via `<fileUrl>?type=thumb`
   * (variante documentata in theta-client listFilesCommand.kt).
   */
  async downloadThumbnail(fileUrl: string): Promise<string> {
    const thumbUrl = `${fileUrl}?type=thumb`;
    const fileName = `thumb_${fileUrl.split("/").pop() || `theta_${Date.now()}.jpg`}`;
    const dirUri = `${FileSystem.documentDirectory}photos/thumbs/`;
    const localUri = `${dirUri}${fileName}`;

    const dirInfo = await FileSystem.getInfoAsync(dirUri);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
    }

    if (isAndroid10Plus) {
      const nativePath = localUri.replace(/^file:\/\//, "");
      await downloadFileViaCameraNetwork(thumbUrl, nativePath);
      return localUri;
    }

    const result = await FileSystem.downloadAsync(thumbUrl, localUri);
    if (result.status !== 200) {
      throw new Error(`Download thumbnail fallito: ${result.status}`);
    }
    return result.uri;
  }
}

export const thetaSession = new ThetaSession();
export { ThetaModel };
export type { Options };

/** Label leggibili per i modelli supportati */
const MODEL_LABELS: Record<string, string> = {
  THETA_V: "RICOH THETA V",
  THETA_SC2: "RICOH THETA SC2",
  THETA_SC2_B: "RICOH THETA SC2 Business",
};

export function getModelLabel(model: string | null | undefined): string {
  return (model && MODEL_LABELS[model]) || "RICOH THETA";
}
