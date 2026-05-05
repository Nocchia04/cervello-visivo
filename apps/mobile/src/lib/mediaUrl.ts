import { Platform } from "react-native";
import Constants from "expo-constants";

/**
 * Restituisce l'host del server di sviluppo.
 * Stesso pattern usato in apollo-client.ts.
 * - Android emulatore: 10.0.2.2 (punta al loopback del Mac)
 * - iOS device fisico: IP del Mac letto da Constants.expoConfig.hostUri
 * - Simulatore iOS: localhost (va bene, punta al Mac)
 */
function getServerHost(): string {
  if (Platform.OS === "android") return "10.0.2.2";
  const metroHost = Constants.expoConfig?.hostUri?.split(":").shift();
  return metroHost ?? "localhost";
}

const PROD_SERVER = "https://api.holobuilderino.com";

/**
 * Riscrive gli URL salvati dal server (es. "http://localhost:4000/uploads/...")
 * - In sviluppo: sostituisce localhost/127.0.0.1 con l'IP del Mac
 * - In produzione: punta al server di produzione
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url
    .replace(/http:\/\/localhost(:\d+)?/g, PROD_SERVER)
    .replace(/http:\/\/127\.0\.0\.1(:\d+)?/g, PROD_SERVER)
    .replace(/https?:\/\/holobuilder-api\.aitalia-test\.it/g, PROD_SERVER);
}
