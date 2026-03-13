/**
 * ThetaWifi — Bridge JS verso il modulo nativo Android ThetaWifiModule.
 *
 * Android (10+): usa WifiNetworkSpecifier per connettere al WiFi camera
 * senza perdere i dati mobili. Tutte le richieste HTTP alla camera
 * passano dall'OkHttpClient legato alla rete camera.
 *
 * iOS / Android < 10: fallback a fetch normale. iOS gestisce
 * il dual-stack WiFi+cellulare automaticamente.
 */
import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  EmitterSubscription,
  PermissionsAndroid,
} from "react-native";

const { ThetaWifiModule } = NativeModules;

// Emitter per gli eventi nativi (live preview frame, WiFi lost)
export const thetaWifiEmitter = ThetaWifiModule
  ? new NativeEventEmitter(ThetaWifiModule)
  : null;

export const THETA_FRAME_EVENT = "ThetaLiveFrame";
export const THETA_PREVIEW_ERROR_EVENT = "ThetaPreviewError";
export const THETA_WIFI_LOST_EVENT = "ThetaWifiLost";

const isAndroid10Plus =
  Platform.OS === "android" && (Platform.Version as number) >= 29;

/**
 * Richiede ACCESS_FINE_LOCATION a runtime (Android 10+).
 * Mostra il dialog nativo di Android: "Consenti una volta" /
 * "Consenti solo mentre usi l'app" / "Non consentire".
 */
async function requestWifiPermission(): Promise<void> {
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error(
      "Permesso posizione negato. Necessario per connettersi al WiFi della camera."
    );
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
  if (!isAndroid10Plus || !ThetaWifiModule) return;
  await requestWifiPermission();
  await ThetaWifiModule.connectToCamera(ssid, password);
}

export async function disconnectFromCamera(): Promise<void> {
  if (!isAndroid10Plus || !ThetaWifiModule) return;
  await ThetaWifiModule.disconnectFromCamera();
}

export async function isCameraWifiConnected(): Promise<boolean> {
  if (!isAndroid10Plus || !ThetaWifiModule) return false;
  return ThetaWifiModule.isConnected();
}

/**
 * Esegue una richiesta HTTP verso la camera.
 * Su Android 10+: usa l'OkHttpClient legato alla rete camera (mantiene internet).
 * Altrove: usa fetch normale.
 */
export async function cameraFetch(
  url: string,
  method: string = "GET",
  body?: string
): Promise<{ status: number; body: string }> {
  if (isAndroid10Plus && ThetaWifiModule) {
    return ThetaWifiModule.makeRequest(url, method, body ?? null);
  }
  // Fallback: fetch standard (iOS, Android < 10, emulatore)
  const response = await fetch(url, {
    method,
    headers: body
      ? { "Content-Type": "application/json; charset=utf-8" }
      : undefined,
    body,
  });
  return { status: response.status, body: await response.text() };
}

/**
 * Avvia lo stream MJPEG live preview.
 * Su Android 10+: gestito nativamente (il parser è in Kotlin).
 * Altrove: usa theta-client-react-native.
 */
export async function startNativeLivePreview(
  baseUrl: string
): Promise<boolean> {
  if (!isAndroid10Plus || !ThetaWifiModule) return false;
  await ThetaWifiModule.startLivePreview(
    `${baseUrl}/osc/commands/execute`
  );
  return true;
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
): Promise<string> {
  if (isAndroid10Plus && ThetaWifiModule) {
    return ThetaWifiModule.downloadFileToCameraNetwork(url, destPath);
  }
  // iOS / Android < 10: il download avviene tramite expo-file-system direttamente
  // (il chiamante gestisce questo caso)
  return destPath;
}

/**
 * Diagnostica: restituisce info sulla rete camera (interface, IP, routes).
 * Utile per debug del routing.
 */
export async function getCameraNetworkInfo(): Promise<string> {
  if (!isAndroid10Plus || !ThetaWifiModule) return "Non supportato su questa piattaforma";
  return ThetaWifiModule.getNetworkInfo();
}

/**
 * Verifica che il servizio Posizione (GPS) sia attivo a livello di sistema Android.
 * WifiNetworkSpecifier richiede Location attivo — anche con il permesso concesso,
 * se il toggle GPS è spento la connessione fallisce immediatamente.
 * Su iOS / Android < 10 restituisce sempre true (non necessario).
 */
export async function isLocationServicesEnabled(): Promise<boolean> {
  if (!isAndroid10Plus || !ThetaWifiModule) return true;
  return ThetaWifiModule.isLocationEnabled();
}

export async function stopNativeLivePreview(): Promise<void> {
  if (!isAndroid10Plus || !ThetaWifiModule) return;
  await ThetaWifiModule.stopLivePreview();
}

export function onFrame(
  callback: (dataUrl: string) => void
): EmitterSubscription | null {
  return (
    thetaWifiEmitter?.addListener(THETA_FRAME_EVENT, callback) ?? null
  );
}

export function onPreviewError(
  callback: (message: string) => void
): EmitterSubscription | null {
  return (
    thetaWifiEmitter?.addListener(THETA_PREVIEW_ERROR_EVENT, callback) ?? null
  );
}

export function onWifiLost(
  callback: () => void
): EmitterSubscription | null {
  return (
    thetaWifiEmitter?.addListener(THETA_WIFI_LOST_EVENT, callback) ?? null
  );
}
