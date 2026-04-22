/**
 * RICOH THETA BLE API — Service e Characteristic UUIDs
 * https://api.ricoh/docs/theta-ble-api/characteristics_list/
 */

export const THETA_BLE_SERVICES = {
  /** Autenticazione BLE (registrazione UUID device) */
  BLUETOOTH_CONTROL: '0F291746-0C80-4726-87A7-3C501FD3B4B6',
  /** Comandi scatto: takePicture, fileFormat, captureMode */
  SHOOTING_CONTROL: '1D0F3602-8DFB-4340-9045-513040DAD991',
  /** Info, state, opzioni camera */
  CAMERA_CONTROL_V2: 'b6ac7a7e-8c01-4a52-b188-68d53df53ea2',
  /** Power on/off camera */
  CAMERA_STATUS: '8AF982B1-F1FF-4D49-83F0-A56DB4C431A7',
} as const;

export const THETA_BLE_CHARACTERISTICS = {
  // BLUETOOTH_CONTROL service
  /** Write: UUID string UTF-8 per autenticarsi alla camera */
  AUTH_BLUETOOTH_DEVICE: 'EBAFB2F0-0E0F-40A2-A84F-E2F098DC13C3',

  // SHOOTING_CONTROL service
  /** Write 0x01 → scatta; Notify 0x00 → scatto completato */
  TAKE_PICTURE: 'FEC1805C-8905-4477-B862-BA5E447528A5',
  /** Write: formato file */
  FILE_FORMAT: 'E8F0EDD1-6C0F-494A-95C3-3244AE0B9A01',
  /** Write: modalità cattura */
  CAPTURE_MODE: '78009238-AC3D-4370-9B6F-C9CE2F4E3CA8',

  // CAMERA_CONTROL_V2 service
  /** Read: stato camera JSON */
  GET_STATE: '083d92b0-21e0-4fb2-9503-7d8b2c2bb1d1',

  // CAMERA_STATUS service
  /** Write: accendi/spegni camera */
  CAMERA_POWER: 'B58CE84C-0666-4DE9-BEC8-2D27B27B3211',
} as const;

/** Scansione: filtra per nome device salvato in storage (es. "00101234") */
export const BLE_SCAN_TIMEOUT_MS = 30_000;
/** Timeout scatto: SC2 scatta in 10-15s; se non arriva notify in 30s
 * passiamo al fallback polling WiFi (la camera spesso ha scattato lo stesso
 * ma l'antenna 2.4GHz condivisa BLE+WiFi fa perdere la notifica). */
export const BLE_TAKE_PICTURE_TIMEOUT_MS = 30_000;
