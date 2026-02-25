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

/**
 * Riscrive gli URL salvati dal server (es. "http://localhost:4000/uploads/...")
 * sostituendo localhost/127.0.0.1 con l'IP reale del Mac.
 * Da usare su ogni <Image source={{ uri: resolveMediaUrl(url) }} />.
 */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  const host = getServerHost();
  return url
    .replace(/localhost/g, host)
    .replace(/127\.0\.0\.1/g, host);
}
