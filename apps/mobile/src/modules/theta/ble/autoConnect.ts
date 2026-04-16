/**
 * Logica comune per connettere la camera via BLE.
 * Tenta prima la connessione diretta per peripheral ID (veloce),
 * poi fallback a scan per nome (lenta ma affidabile).
 * Ritorna il deviceName salvato; lancia errore in caso di fallimento.
 * Lancia BleNoSetupError se il setup non è stato completato.
 */

import { scanAndConnect, connectByPeripheralId } from "./ThetaBleService";
import { getThetaBleCredentials } from "../../../lib/storage";
import { dlog } from "../../../lib/debugLog";

export class BleNoSetupError extends Error {
  constructor() {
    super("BLE non configurato");
    this.name = "BleNoSetupError";
  }
}

export async function performBleConnect(): Promise<string> {
  const { uuid, deviceName, peripheralId, setupComplete } = await getThetaBleCredentials();
  dlog("BLE", `Credenziali: setup=${setupComplete}, device="${deviceName}", periph="${peripheralId?.substring(0, 12) ?? "null"}"`);
  if (!setupComplete || !uuid || !deviceName) {
    dlog("BLE", "Setup non completato — skip");
    throw new BleNoSetupError();
  }
  if (peripheralId) {
    try {
      dlog("BLE", "Tentativo connessione diretta per peripheralId...");
      await connectByPeripheralId(peripheralId, uuid);
      dlog("BLE", "Connessione diretta OK");
    } catch (e: any) {
      dlog("BLE", `Connessione diretta fallita: ${e.message} — fallback scan`);
      await scanAndConnect(deviceName, uuid);
    }
  } else {
    dlog("BLE", "Nessun peripheralId — scan completo");
    await scanAndConnect(deviceName, uuid);
  }
  return deviceName;
}
