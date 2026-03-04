/**
 * ThetaBleService — Gestione BLE per RICOH THETA SC2.
 *
 * Flusso normale:
 *   1. scanAndConnect(deviceName, bleUuid) → connette + autentica
 *   2. takePictureViaBle() → scatta senza WiFi (scrive 0x01, aspetta notify 0x00)
 *   3. disconnectBle() → cleanup
 *
 * Prerequisito (una volta sola, via impostazioni):
 *   - Registrare UUID via Web API camera._setBluetoothDevice (WiFi manuale)
 *   - Abilitare BT sulla camera via camera.setOptions { _bluetoothPower: "ON" }
 *   - Salvare bleUuid + deviceName in AsyncStorage
 */

import { BleManager, Device, State, type Subscription } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import {
  THETA_BLE_SERVICES,
  THETA_BLE_CHARACTERISTICS,
  BLE_SCAN_TIMEOUT_MS,
  BLE_TAKE_PICTURE_TIMEOUT_MS,
} from './ThetaBleConstants';

// Singleton BleManager — deve esistere uno solo per processo
const _manager = new BleManager();
let _device: Device | null = null;

// ── Permissions ──────────────────────────────────────────────────────────────

async function requestBlePermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const version = Platform.Version as number;

  if (version >= 31) {
    // Android 12+ — BLUETOOTH_SCAN + BLUETOOTH_CONNECT
    const results = await PermissionsAndroid.requestMultiple([
      'android.permission.BLUETOOTH_SCAN' as any,
      'android.permission.BLUETOOTH_CONNECT' as any,
    ]);
    const denied = Object.values(results).some(
      (r) => r !== PermissionsAndroid.RESULTS.GRANTED
    );
    if (denied) throw new Error('Permessi Bluetooth non concessi. Vai in Impostazioni > App > Permessi.');
  }
  // Android 6–11: usa ACCESS_FINE_LOCATION (già richiesto per WiFi)
}

// ── Bluetooth state ───────────────────────────────────────────────────────────

async function waitForBluetooth(): Promise<void> {
  const state = await _manager.state();
  if (state === State.PoweredOn) return;

  return new Promise((resolve, reject) => {
    const sub = _manager.onStateChange((s) => {
      if (s === State.PoweredOn) {
        sub.remove();
        resolve();
      } else if (s === State.PoweredOff || s === State.Unauthorized || s === State.Unsupported) {
        sub.remove();
        reject(new Error('Bluetooth non disponibile. Attiva il Bluetooth nelle impostazioni del telefono.'));
      }
    }, true);

    setTimeout(() => {
      sub.remove();
      reject(new Error('Timeout attesa Bluetooth (10s).'));
    }, 10_000);
  });
}

// ── Scan ──────────────────────────────────────────────────────────────────────
//
// La THETA SC2 si pubblicizza via BLE usando il "deviceName" restituito da
// camera._setBluetoothDevice (es. "00101234", "10106083").
// Filtra per corrispondenza esatta su quel nome.

function scanForDevice(deviceName: string): Promise<Device> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      _manager.stopDeviceScan();
      reject(
        new Error(
          `Camera BLE "${deviceName}" non trovata. Assicurati che la camera sia accesa e vicina.`
        )
      );
    }, BLE_SCAN_TIMEOUT_MS);

    _manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        clearTimeout(timeout);
        _manager.stopDeviceScan();
        reject(new Error(error.message));
        return;
      }
      if (device?.name === deviceName) {
        clearTimeout(timeout);
        _manager.stopDeviceScan();
        resolve(device);
      }
    });
  });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authenticateDevice(uuid: string): Promise<void> {
  if (!_device) throw new Error('Device non connesso');
  // Write UUID string as UTF-8 bytes → base64
  const uuidB64 = btoa(unescape(encodeURIComponent(uuid)));
  await _device.writeCharacteristicWithResponseForService(
    THETA_BLE_SERVICES.BLUETOOTH_CONTROL,
    THETA_BLE_CHARACTERISTICS.AUTH_BLUETOOTH_DEVICE,
    uuidB64
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scansiona, connette e autentica la camera BLE.
 * Filtra per il deviceName restituito da camera._setBluetoothDevice (es. "00101234").
 * @param deviceName  Nome BLE della camera salvato al setup
 * @param bleUuid     UUID registrato in camera._setBluetoothDevice
 * @returns           peripheralId da salvare per `connectByPeripheralId`
 */
export async function scanAndConnect(deviceName: string, bleUuid: string): Promise<string> {
  await requestBlePermissions();
  await waitForBluetooth();
  await disconnectBle(); // cleanup connessione precedente

  const device = await scanForDevice(deviceName);
  return _connectAndAuth(device, bleUuid);
}

/**
 * Connette direttamente a un peripheral noto (no scan) — molto più veloce.
 * Usa il peripheralId salvato dopo il primo scanAndConnect.
 * Se la connessione fallisce, rilancia l'errore: il chiamante può fare fallback su scanAndConnect.
 */
export async function connectByPeripheralId(peripheralId: string, bleUuid: string): Promise<void> {
  await requestBlePermissions();
  await waitForBluetooth();
  await disconnectBle();

  const device = await _manager.connectToDevice(peripheralId, { autoConnect: false });
  await _connectAndAuth(device, bleUuid);
}

async function _connectAndAuth(device: Device, bleUuid: string): Promise<string> {
  const connected = await device.connect({ autoConnect: false });
  await connected.discoverAllServicesAndCharacteristics();
  _device = connected;

  connected.onDisconnected(() => {
    _device = null;
  });

  await authenticateDevice(bleUuid);
  return connected.id;
}

/** Restituisce l'ID del peripheral BLE connesso (undefined se non connesso) */
export function getConnectedDeviceId(): string | undefined {
  return _device?.id;
}

/**
 * Scatta una foto via BLE — NON richiede WiFi.
 * Scrive 0x01 su TAKE_PICTURE, aspetta notifica 0x00 (= scatto completato).
 */
export async function takePictureViaBle(): Promise<void> {
  if (!_device) throw new Error('Camera BLE non connessa. Premi "Connetti Camera" prima di scattare.');

  return new Promise((resolve, reject) => {
    let sub: Subscription | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      sub?.remove();
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Iscriviti alle notifiche PRIMA di scrivere
    sub = _device!.monitorCharacteristicForService(
      THETA_BLE_SERVICES.SHOOTING_CONTROL,
      THETA_BLE_CHARACTERISTICS.TAKE_PICTURE,
      (error, characteristic) => {
        if (error) {
          cleanup();
          reject(new Error(error.message));
          return;
        }
        if (characteristic?.value) {
          const byte = atob(characteristic.value).charCodeAt(0);
          if (byte === 0x00) {
            // 0x00 = scatto completato
            cleanup();
            resolve();
          }
          // 0x01 = scatto in corso — continua ad aspettare
        }
      }
    );

    // Timeout SC2: fino a 35s
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout scatto BLE (35s). La camera potrebbe essere occupata.'));
    }, BLE_TAKE_PICTURE_TIMEOUT_MS);

    // Scrivi 0x01 per triggerare lo scatto
    _device!
      .writeCharacteristicWithResponseForService(
        THETA_BLE_SERVICES.SHOOTING_CONTROL,
        THETA_BLE_CHARACTERISTICS.TAKE_PICTURE,
        btoa(String.fromCharCode(0x01))
      )
      .catch((err: any) => {
        cleanup();
        reject(new Error(err?.message ?? 'Errore scrittura BLE'));
      });
  });
}

/** Disconnette il dispositivo BLE */
export async function disconnectBle(): Promise<void> {
  if (_device) {
    try {
      await _device.cancelConnection();
    } catch {}
    _device = null;
  }
}

/** Restituisce true se la camera è connessa via BLE */
export function isBluetoothConnected(): boolean {
  return _device !== null;
}
