/**
 * ThetaWifi — Bridge JS verso il modulo nativo Android ThetaWifiModule.
 *
 * Android (10+): usa WifiNetworkSpecifier per connettere al WiFi camera
 * senza perdere i dati mobili. Tutte le richieste HTTP alla camera
 * usano network.openConnection() — nessun bindProcessToNetwork necessario.
 *
 * Live preview MJPEG: implementato nativamente in ThetaWifiModule.kt.
 * startMjpegPreview() apre lo stream OSC camera.getLivePreview e
 * emette eventi THETA_FRAME_EVENT con {data: "data:image/jpeg;base64,..."}
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

  // Retry: Android a volte rate-limita WifiNetworkSpecifier dopo rapidi disconnetti/riconnetti
  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await ThetaWifiModule.connectToCamera(ssid, password);
      dlog('WIFI', `WiFi connesso OK (tentativo ${attempt})`);
      return;
    } catch (e: any) {
      lastError = e;
      dlog('WIFI', `Tentativo ${attempt} fallito: ${e?.message ?? e}`);
      if (attempt < 3) {
        // Disconnect + pausa crescente per evitare rate limiting
        try { await ThetaWifiModule.disconnectFromCamera(); } catch {}
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastError ?? new Error('WiFi connect fallito dopo 3 tentativi');
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
 * Diagnostica: restituisce info sulla rete camera (interface, IP, routes).
 */
export async function getCameraNetworkInfo(): Promise<string> {
  if (!isAndroid10Plus || !ThetaWifiModule) return "Non supportato su questa piattaforma";
  return ThetaWifiModule.getNetworkInfo();
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

