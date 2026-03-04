import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  AUTH_TOKEN: "@cervello_visivo:auth_token",
  USER_DATA: "@cervello_visivo:user_data",
  UPLOAD_QUEUE: "@cervello_visivo:upload_queue",
  CAMERA_SERIAL: "@cervello_visivo:camera_serial",
  CAMERA_PASSWORD: "@cervello_visivo:camera_password",
  // BLE credentials (registrati una volta via WiFi manuale)
  THETA_BLE_UUID: "@cervello_visivo:theta_ble_uuid",
  THETA_BLE_DEVICE_NAME: "@cervello_visivo:theta_ble_device_name",
  THETA_BLE_PERIPHERAL_ID: "@cervello_visivo:theta_ble_peripheral_id",
  THETA_SETUP_COMPLETE: "@cervello_visivo:theta_setup_complete",
} as const;

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
}

export async function setAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
}

export async function removeAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
}

export async function getUserData<T>(): Promise<T | null> {
  const data = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
  return data ? JSON.parse(data) : null;
}

export async function setUserData<T>(data: T): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(data));
}

export async function removeUserData(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
}

/** Legge il numero di serie della camera (es. "YP10106083") */
export async function getCameraSerial(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.CAMERA_SERIAL);
}

/** Salva numero di serie e password della camera */
export async function setCameraSerial(serial: string, password: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.CAMERA_SERIAL, serial.trim().toUpperCase()),
    AsyncStorage.setItem(STORAGE_KEYS.CAMERA_PASSWORD, password),
  ]);
}

/** Legge numero di serie e password della camera */
export async function getCameraSerialAndPassword(): Promise<{ serial: string | null; password: string | null }> {
  const [serial, password] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.CAMERA_SERIAL),
    AsyncStorage.getItem(STORAGE_KEYS.CAMERA_PASSWORD),
  ]);
  return { serial, password };
}

/**
 * Deriva SSID = "THETA" + seriale + ".OSC"  (es. THETAYP10106083.OSC)
 * Password = quella salvata manualmente
 */
export async function getCameraCredentials(): Promise<{ ssid: string | null; password: string | null }> {
  const [serial, password] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.CAMERA_SERIAL),
    AsyncStorage.getItem(STORAGE_KEYS.CAMERA_PASSWORD),
  ]);
  if (!serial) return { ssid: null, password: null };
  return { ssid: `THETA${serial}.OSC`, password: password ?? '' };
}

// ── BLE Camera credentials ────────────────────────────────────────────────────

/** Salva UUID BLE, deviceName e peripheralId restituiti dopo il setup */
export async function setThetaBleCredentials(
  uuid: string,
  deviceName: string,
  peripheralId?: string
): Promise<void> {
  const ops: Promise<void>[] = [
    AsyncStorage.setItem(STORAGE_KEYS.THETA_BLE_UUID, uuid),
    AsyncStorage.setItem(STORAGE_KEYS.THETA_BLE_DEVICE_NAME, deviceName),
    AsyncStorage.setItem(STORAGE_KEYS.THETA_SETUP_COMPLETE, 'true'),
  ];
  if (peripheralId) {
    ops.push(AsyncStorage.setItem(STORAGE_KEYS.THETA_BLE_PERIPHERAL_ID, peripheralId));
  }
  await Promise.all(ops);
}

/** Legge UUID BLE, deviceName e peripheralId salvati */
export async function getThetaBleCredentials(): Promise<{
  uuid: string | null;
  deviceName: string | null;
  peripheralId: string | null;
  setupComplete: boolean;
}> {
  const [uuid, deviceName, peripheralId, done] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.THETA_BLE_UUID),
    AsyncStorage.getItem(STORAGE_KEYS.THETA_BLE_DEVICE_NAME),
    AsyncStorage.getItem(STORAGE_KEYS.THETA_BLE_PERIPHERAL_ID),
    AsyncStorage.getItem(STORAGE_KEYS.THETA_SETUP_COMPLETE),
  ]);
  return { uuid, deviceName, peripheralId, setupComplete: done === 'true' };
}

/** Cancella le credenziali BLE (reset setup) */
export async function clearThetaBleCredentials(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEYS.THETA_BLE_UUID),
    AsyncStorage.removeItem(STORAGE_KEYS.THETA_BLE_DEVICE_NAME),
    AsyncStorage.removeItem(STORAGE_KEYS.THETA_BLE_PERIPHERAL_ID),
    AsyncStorage.removeItem(STORAGE_KEYS.THETA_SETUP_COMPLETE),
  ]);
}

export { STORAGE_KEYS };
