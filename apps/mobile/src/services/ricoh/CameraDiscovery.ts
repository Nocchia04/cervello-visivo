/**
 * CameraDiscovery — rileva automaticamente l'IP della Ricoh Theta
 * quando la camera è in Client Mode e connessa all'hotspot del telefono.
 *
 * Flusso:
 *  1. Controlla IP memorizzato → proba con /osc/info (veloce)
 *  2. Se fallisce → rileva subnet dall'IP locale del telefono
 *  3. Scansiona .[1-254] in batch paralleli da 30 IP con timeout breve
 *  4. Alla prima risposta Ricoh valida → salva in AsyncStorage e ritorna
 */
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_IP = "@cervello_visivo:camera_client_ip";
const STORAGE_KEY_MODE = "@cervello_visivo:camera_mode";
const OSC_INFO_PATH = "/osc/info";
const PROBE_TIMEOUT_MS = 1500;
const BATCH_SIZE = 30;

export type CameraMode = "ap" | "client";

export async function getCameraMode(): Promise<CameraMode> {
  const mode = await AsyncStorage.getItem(STORAGE_KEY_MODE);
  return (mode as CameraMode) ?? "ap";
}

export async function setCameraMode(mode: CameraMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_MODE, mode);
}

export async function getCachedClientIp(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_IP);
}

export async function clearCachedClientIp(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_IP);
}

// Proba un singolo IP — ritorna l'IP se risponde come Ricoh, altrimenti null
async function probe(ip: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${ip}${OSC_INFO_PATH}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    // Verifica sia una Ricoh Theta controllando manufacturer o model
    const manufacturer = (json?.manufacturer ?? "").toLowerCase();
    const model = (json?.model ?? "").toLowerCase();
    if (manufacturer.includes("ricoh") || model.includes("theta")) {
      return ip;
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// Scansiona tutti gli IP del subnet in batch paralleli
async function scanSubnet(subnet: string): Promise<string | null> {
  // Priorizza range tipici degli hotspot Android/iOS (.2-.50, .100-.120, poi resto)
  const prioritized: number[] = [];
  for (let i = 2; i <= 50; i++) prioritized.push(i);
  for (let i = 100; i <= 120; i++) prioritized.push(i);
  for (let i = 51; i <= 99; i++) prioritized.push(i);
  for (let i = 121; i <= 254; i++) prioritized.push(i);
  prioritized.push(1);

  for (let b = 0; b < prioritized.length; b += BATCH_SIZE) {
    const batch = prioritized.slice(b, b + BATCH_SIZE);
    const results = await Promise.all(batch.map((n) => probe(`${subnet}.${n}`)));
    const found = results.find((r) => r !== null) ?? null;
    if (found) return found;
  }
  return null;
}

/**
 * Scopre la camera Ricoh sulla rete corrente.
 * Prima controlla l'IP memorizzato, poi fa una scansione completa del subnet.
 *
 * @param onProgress callback opzionale per mostrare lo stato all'utente
 * @returns IP della camera (es. "192.168.43.105") oppure null se non trovata
 */
export async function discoverCamera(
  onProgress?: (message: string) => void
): Promise<string | null> {
  // 1. Prova IP memorizzato (istantaneo se ancora valido)
  const cached = await getCachedClientIp();
  if (cached) {
    onProgress?.(`Verifica IP memorizzato (${cached})...`);
    const found = await probe(cached);
    if (found) {
      onProgress?.("Camera raggiungibile");
      return found;
    }
    onProgress?.("IP memorizzato non più valido, scansione in corso...");
  }

  // 2. Ottieni IP locale per derivare il subnet
  const ipAddress = await Network.getIpAddressAsync();
  if (!ipAddress || ipAddress === "0.0.0.0" || ipAddress === "127.0.0.1") {
    onProgress?.("Impossibile rilevare IP locale — verifica la connessione hotspot");
    return null;
  }

  const parts = ipAddress.split(".");
  if (parts.length !== 4) {
    onProgress?.("IP locale non valido");
    return null;
  }

  const subnet = parts.slice(0, 3).join(".");
  onProgress?.(`Scansione subnet ${subnet}.x...`);

  // 3. Scansiona il subnet
  const discovered = await scanSubnet(subnet);
  if (discovered) {
    await AsyncStorage.setItem(STORAGE_KEY_IP, discovered);
    onProgress?.(`Camera trovata: ${discovered}`);
    return discovered;
  }

  onProgress?.("Camera non trovata — verifica che sia connessa all'hotspot");
  return null;
}
