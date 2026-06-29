/**
 * ThetaWifi — Bridge JS verso il modulo nativo Android ThetaWifiModule.
 *
 * Android (10+): usa WifiNetworkSpecifier per connettere al WiFi camera
 * senza perdere i dati mobili.
 *
 * Ruolo nella nuova architettura (SDK ufficiale theta-client):
 *  - connectToCamera/disconnectFromCamera: gestione rete camera (l'SDK non la fa)
 *  - bindToCameraNetwork/unbind: bindProcessToNetwork richiesto dall'SDK
 *    (Ktor usa la rete di default del processo) — orchestrato da ThetaSession
 *  - downloadFileViaCameraNetwork: download foto (l'SDK non ha API di download)
 *  - onWifiLost: evento per invalidare la sessione SDK
 *
 * Il control-plane OSC (scatto, opzioni, stato) è in ThetaSession via SDK.
 * La live preview MJPEG è in ThetaPreviewView.kt (Network esplicita).
 */
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  EmitterSubscription,
  PermissionsAndroid,
} from "react-native";
import { dlog } from "../../lib/debugLog";

const { ThetaWifiModule } = NativeModules;

// Emitter per gli eventi nativi (WiFi lost)
export const thetaWifiEmitter = ThetaWifiModule
  ? new NativeEventEmitter(ThetaWifiModule)
  : null;

export const THETA_WIFI_LOST_EVENT = "ThetaWifiLost";

/**
 * Evento emesso da ThetaPreviewView (nativo) in caso di errore dello stream.
 * RicohPreview.tsx lo ascolta via thetaWifiEmitter per mostrare l'errore in UI.
 * I frame NON passano dal bridge — vengono renderizzati nativamente su SurfaceView.
 */
export const THETA_PREVIEW_ERROR_EVENT = "ThetaPreviewError";

const isAndroid10Plus =
  Platform.OS === "android" && (Platform.Version as number) >= 29;

// Android 13+ (API 33+): usa NEARBY_WIFI_DEVICES invece di ACCESS_FINE_LOCATION.
// Con neverForLocation, WifiNetworkSpecifier non richiede Location attiva.
const isAndroid13Plus =
  Platform.OS === "android" && (Platform.Version as number) >= 33;

/**
 * Richiede il permesso WiFi a runtime.
 * Android 13+ → NEARBY_WIFI_DEVICES (neverForLocation, non serve GPS attivo).
 * Android 10–12 → ACCESS_FINE_LOCATION (richiede Location di sistema attiva).
 */
async function requestWifiPermission(): Promise<void> {
  if (!isAndroid10Plus) return;

  if (isAndroid13Plus) {
    // Android 13+: NEARBY_WIFI_DEVICES — non richiede Location di sistema
    const result = await PermissionsAndroid.request(
      "android.permission.NEARBY_WIFI_DEVICES" as any,
      {
        title: "Permesso dispositivi nelle vicinanze",
        message:
          "Necessario per connettersi al WiFi della camera RICOH THETA senza perdere la connessione internet.",
        buttonPositive: "Consenti",
        buttonNegative: "Nega",
      }
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("NEARBY_WIFI_DENIED");
    }
  } else {
    // Android 10–12: ACCESS_FINE_LOCATION
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Permesso posizione",
        message:
          "Necessario per connettersi al WiFi della camera mantenendo i dati mobili attivi.",
        buttonPositive: "Consenti",
        buttonNegative: "Nega",
      }
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error(
        "Permesso posizione negato. Necessario per connettersi al WiFi della camera."
      );
    }
  }
}

/**
 * Connette al WiFi della camera SENZA disconnettere i dati mobili.
 * Su Android 10+ usa WifiNetworkSpecifier.
 * Su iOS / Android < 10 non fa nulla (gestito dall'OS o dall'utente).
 */
export async function connectToCamera(
  ssid: string,
  password: string
): Promise<void> {
  dlog('WIFI', `connectToCamera("${ssid}")`);
  if (!isAndroid10Plus || !ThetaWifiModule) {
    dlog('WIFI', 'Skip — non Android 10+ o modulo non disponibile');
    return;
  }
  await requestWifiPermission();
  dlog('WIFI', 'Permessi OK, connessione...');

  // Un solo tentativo. Il timeout nativo è generoso (60s) → l'operatore ha
  // tempo di trovare e toccare il dialogo "Connetti a THETA?". NIENTE
  // auto-retry con disconnectFromCamera: cancellava il dialogo che l'utente
  // stava per toccare ("L'applicazione ha annullato la richiesta..."). In
  // caso di fallimento il chiamante mostra l'errore e l'utente ritenta a mano.
  try {
    await ThetaWifiModule.connectToCamera(ssid, password);
    dlog('WIFI', 'WiFi connesso OK');
  } catch (e: any) {
    dlog('WIFI', `Connessione fallita: ${e?.message ?? e}`);
    throw e;
  }
}

export async function disconnectFromCamera(): Promise<void> {
  dlog('WIFI', 'disconnectFromCamera()');
  if (!isAndroid10Plus || !ThetaWifiModule) return;
  await ThetaWifiModule.disconnectFromCamera();
}

export async function isCameraWifiConnected(): Promise<boolean> {
  if (!isAndroid10Plus || !ThetaWifiModule) return false;
  return ThetaWifiModule.isConnected();
}

/**
 * Scarica un file binario dalla camera via la rete WiFi camera (Android 10+).
 * Usa network.openConnection() nel modulo nativo — non richiede bindProcessToNetwork.
 * @param url       URL del file sulla camera (es. http://192.168.1.1/files/...)
 * @param destPath  Path filesystem locale (senza file://)
 */
export async function downloadFileViaCameraNetwork(
  url: string,
  destPath: string
): Promise<{ path: string; diag: string[] }> {
  if (isAndroid10Plus && ThetaWifiModule) {
    // Il nativo risolve { path, diag:[...] } — la diag è la diagnostica
    // del transfer (ramo, HEAD, per-chunk/per-segmento, KB/s) da mostrare
    // nel Debug Log in-app.
    const res = await ThetaWifiModule.downloadFileToCameraNetwork(url, destPath);
    return { path: res?.path ?? destPath, diag: res?.diag ?? [] };
  }
  // iOS / Android < 10: il download avviene tramite expo-file-system direttamente
  // (il chiamante gestisce questo caso)
  return { path: destPath, diag: [] };
}

/**
 * Lega tutti gli HTTP del processo alla rete WiFi camera.
 * Necessario affinché theta-client-react-native raggiunga 192.168.1.1
 * tramite il suo OkHttp standard (senza network.openConnection).
 * Da chiamare prima di initialize() e getLivePreview().
 */
export async function bindToCameraNetwork(): Promise<void> {
  if (!isAndroid10Plus || !ThetaWifiModule) return;
  await ThetaWifiModule.bindToCameraNetwork();
}

/**
 * Ripristina il routing di default (dati mobili / rete predefinita).
 * Da chiamare dopo stopLivePreview() per riabilitare internet.
 */
export async function unbindFromCameraNetwork(): Promise<void> {
  if (!isAndroid10Plus || !ThetaWifiModule) return;
  await ThetaWifiModule.unbindFromCameraNetwork();
}

/**
 * "Scatta" salvando l'ultimo frame della live preview (1024×512) come JPEG
 * in [destPath]. Zero download dalla camera. Richiede preview attiva.
 */
export async function capturePreviewFrame(destPath: string): Promise<string> {
  if (!isAndroid10Plus || !ThetaWifiModule) {
    throw new Error("Cattura frame disponibile solo su Android 10+");
  }
  return ThetaWifiModule.capturePreviewFrame(destPath);
}

/**
 * Diagnostica: restituisce info sulla rete camera (interface, IP, routes).
 */
export async function getCameraNetworkInfo(): Promise<string> {
  if (!isAndroid10Plus || !ThetaWifiModule) return "Non supportato su questa piattaforma";
  return ThetaWifiModule.getNetworkInfo();
}

/**
 * Diagnostica dual-STA: numero di reti WiFi attive OLTRE alla rete camera.
 * > 0 = il telefono tiene un secondo WiFi (casa/ufficio) in parallelo:
 * la radio è time-sliced e il link camera si strozza (~50 KB/s).
 */
export async function countOtherWifiNetworks(): Promise<number> {
  if (!isAndroid10Plus || !ThetaWifiModule) return 0;
  return ThetaWifiModule.countOtherWifiNetworks();
}

/**
 * Verifica che il servizio Posizione (GPS) sia attivo a livello di sistema Android.
 * Necessario SOLO su Android 10–12 (dove si usa ACCESS_FINE_LOCATION).
 * Su Android 13+ si usa NEARBY_WIFI_DEVICES neverForLocation → Location non richiesta.
 * Su iOS / Android < 10 restituisce sempre true.
 */
export async function isLocationServicesEnabled(): Promise<boolean> {
  if (isAndroid13Plus) return true; // NEARBY_WIFI_DEVICES non richiede Location
  if (!isAndroid10Plus || !ThetaWifiModule) return true;
  return ThetaWifiModule.isLocationEnabled();
}

export function onWifiLost(
  callback: () => void
): EmitterSubscription | null {
  return (
    thetaWifiEmitter?.addListener(THETA_WIFI_LOST_EVENT, callback) ?? null
  );
}

