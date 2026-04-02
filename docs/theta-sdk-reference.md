# RICOH THETA Client — SDK Reference (theta-client-react-native)

Repository clonato in `TethaDocs/theta-client/`.

---

## Panoramica

Il pacchetto `theta-client-react-native` è l'SDK ufficiale Ricoh per controllare la THETA via WiFi in React Native. Usa Kotlin/Swift nativi per le operazioni core (OkHttp, networking, preview MJPEG) e li espone come promise TypeScript.

**Nota importante**: richiede che i moduli nativi (`theta-client`) siano compilati e linkati al progetto. Non è un wrapper puro JS. Il pacchetto `theta-client-react-native` in `node_modules/` nella nostra app è già installato e buildato.

---

## Inizializzazione

```typescript
import { initialize, isInitialized } from 'theta-client-react-native';

await initialize();                              // default endpoint: 192.168.1.1
await initialize('http://192.168.1.1');          // esplicito
await initialize(endpoint, config, {             // con timeout custom
  connectTimeout: 20000,
  readTimeout: 60000,
  writeTimeout: 60000,
});
await isInitialized(): Promise<boolean>
```

**Nota SC2**: Dopo aver connesso il WiFi camera su Android 10+ con WifiNetworkSpecifier, chiamare `bindToCameraNetwork()` prima di `initialize()` in modo che l'OkHttp interno del SDK raggiunga 192.168.1.1 sulla rete camera.

---

## Camera Info & State

```typescript
getThetaInfo(): Promise<ThetaInfo>
// Ritorna: manufacturer, model, serialNumber, wlanMacAddress, bluetoothMacAddress,
//          firmwareVersion, supportUrl, hasGps, hasGyro, uptime, api,
//          endpoints, apiLevel, thetaModel

getThetaState(): Promise<ThetaState>
// Ritorna: fingerprint, batteryLevel (0.0–1.0), storageUri, storageID,
//          captureStatus, recordedTime, recordableTime, capturedPictures,
//          compositeShootingElapsedTime, latestFileUrl, chargingState,
//          apiVersion, isPluginRunning, isPluginWebServer, function,
//          isMySettingChanged, currentMicrophone, isSdCard,
//          cameraError: string[], isBatteryInsert,
//          externalGpsInfo, internalGpsInfo, boardTemp, batteryTemp

getThetaModel(): Promise<ThetaModel | undefined>
// Valori: THETA_S, THETA_SC, THETA_V, THETA_Z1, THETA_X, THETA_SC2, THETA_SC2_B, THETA_A1
```

**Uso chiave**: `getThetaState()` ritorna `latestFileUrl` — l'URL dell'ultimo file scattato. È più veloce di `listFiles(1)` e non ha il rischio di freeze thumbnail della SC2.

---

## Scatto Foto (PhotoCapture)

```typescript
const photoCapture = await getPhotoCaptureBuilder()
  .setFileFormat(PhotoFileFormatEnum.IMAGE_5K)  // 5376x2688
  .setIsoAutoHighLimit(IsoAutoHighLimitEnum.ISO_1000)
  .setFilter(FilterEnum.OFF)
  .setPreset(PresetEnum.ROOM)          // solo SC2/SC2B
  .build();

const fileUrl: string = await photoCapture.takePicture(
  (status: CapturingStatusEnum) => {  // opzionale
    // STARTING, CAPTURING, SELF_TIMER_COUNTDOWN
  }
);
```

**PhotoFileFormatEnum**: IMAGE_2K, IMAGE_4K, IMAGE_5K, IMAGE_6_7K, RAW_P_6_7K (per modello)

**FilterEnum**: OFF, NOISE_REDUCTION, HDR, HANDHELD_HDR, DR_COMP

**PresetEnum** (SC2/SC2B): FACE, NIGHT, LENS_BY_LENS_EXPOSURE, ROOM

---

## Modalità di Cattura Avanzate (non usate da noi)

| Metodo | Descrizione |
|--------|-------------|
| `getVideoCaptureBuilder()` | Video con `startCapture()` / `stopCapture()` |
| `getTimeShiftCaptureBuilder()` | Time-shift (due scatti con delay) |
| `getTimeShiftManualCaptureBuilder()` | Time-shift manuale: `takePicture1()` + `takePicture2()` |
| `getLimitlessIntervalCaptureBuilder()` | Scatto ad intervallo continuo |
| `getShotCountSpecifiedIntervalCaptureBuilder(n)` | Scatto ad intervallo per N foto |
| `getCompositeIntervalCaptureBuilder(sec)` | Scatto composito |
| `getBurstCaptureBuilder(...)` | Burst multi-shot con bracketing |
| `getContinuousCaptureBuilder()` | Continuous shooting |
| `getMultiBracketCaptureBuilder()` | Multi-bracketing |

Tutti i builder supportano callback: `onCapturing(CapturingStatusEnum)`, `onProgress(0-100)`, `onStopFailed(error)`.

---

## Live Preview

```typescript
// Avvia stream MJPEG — emette THETA_FRAME_EVENT con {data: "data:image/jpeg;base64,..."}
getLivePreview(): Promise<boolean>
stopLivePreview(): Promise<boolean>

// Ascolto eventi (JS side):
import { NativeModules, NativeEventEmitter } from 'react-native';
const emitter = new NativeEventEmitter(NativeModules.ThetaClientReactNative);
const sub = emitter.addListener('THETA_FRAME_EVENT', event => {
  // event.data = "data:image/jpeg;base64,..."
  setFrameUri(event.data);
});
```

**vs. nostro approccio**: Il SDK emette frame in JS → rendering tramite `<Image source={{uri: dataUrl}}/>`. La nostra implementazione usa SurfaceView nativa (BitmapFactory + Canvas) senza passare per il bridge JS — più performante ma richiede modulo nativo custom.

---

## File Management

```typescript
listFiles(
  fileType: FileTypeEnum,  // IMAGE | VIDEO | ALL
  startPosition?: number,
  entryCount: number,
  storage?: StorageEnum    // INTERNAL | SD_CARD
): Promise<ThetaFiles>
// ThetaFiles: { fileList: FileInfo[], totalEntries: number }
// FileInfo: { name, size, dateTime, fileUrl, thumbnailUrl }

deleteFiles(fileUrls: string[]): Promise<boolean>
deleteAllFiles(): Promise<boolean>
deleteAllImageFiles(): Promise<boolean>
deleteAllVideoFiles(): Promise<boolean>
```

**Nota SC2**: Il SDK non documenta il freeze con `maxThumbSize: 640`. La nostra implementazione OSC diretta usa `maxThumbSize: 0` per evitarlo.

---

## Opzioni Camera (setOptions / getOptions)

```typescript
setOptions(options: Options): Promise<boolean>
getOptions(optionNames: OptionNameEnum[]): Promise<Options>
```

**~60+ opzioni disponibili** tra cui:
- `aperture`, `iso`, `isoAutoHighLimit`, `whiteBalance`
- `exposureProgram`, `exposureCompensation`, `exposureDelay` (self-timer)
- `fileFormat`, `filter`, `preset` (SC2)
- `captureMode`, `continuousNumber`
- `_bluetoothPower` (ON/OFF), `_bluetoothRole`
- `networkType`, `gpsInfo`, `gpsTagRecording`
- `sleepDelay`, `offDelay`, `powerSaving`
- `colorTemperature`, `microphone`, `microphoneNoiseReduction`
- `cameraPower`, `cameraLock`

**Uso chiave per noi**: `_bluetoothPower: "ON"` per abilitare BT sulla camera durante il setup. Già usato via OSC diretto nel nostro setup wizard.

---

## Bluetooth

```typescript
setBluetoothDevice(uuid: string): Promise<string>
// Registra questo dispositivo come BLE peer della camera.
// Ritorna deviceName (es. "00101234") — necessario per la scansione BLE.
```

**Nota**: Il SDK si ferma qui per BLE. Non implementa scan, connect, auth, take picture via BLE. Quella parte è interamente custom nel nostro codice.

---

## Operazioni Avanzate

```typescript
reset(): Promise<boolean>           // Ripristina impostazioni di fabbrica
reboot(): Promise<void>             // Solo THETA A1
finishWlan(): Promise<boolean>      // Termina connessione WLAN
restoreSettings(): Promise<boolean> // Ripristina my settings
stopSelfTimer(): Promise<boolean>   // Annulla self-timer attivo

convertVideoFormats(
  fileUrl: string,
  toLowResolution: boolean,
  applyTopBottomCorrection: boolean,
  onProgress?: (completion: number) => void
): Promise<string>
cancelVideoConvert(): Promise<boolean>

getMetadata(fileUrl: string): Promise<MetaInfo>  // EXIF della foto
getThetaLicense(): Promise<string>               // HTML della licenza

// Logging per debug
setApiLogListener(listener?: (message: string) => void): Promise<void>
```

---

## Error Handling

Tutte le operazioni ritornano Promise e lanciano eccezioni in caso di errore. L'oggetto error contiene:

```typescript
error.code    // codice errore camera
error.message // descrizione
```

**Codici errore camera noti (da `cameraError` in state)**:

| Codice | Significato |
|--------|-------------|
| `disabledShootingWhileBatteryCharging` | Scatto disabilitato durante la carica |
| `cameraFileSystemError` | Errore filesystem camera |
| `noMemoryCard` | SD assente o non riconosciuta |
| `imageProcessingFailed` | Errore elaborazione immagine |
| `recordingHardwareError` | Errore hardware registrazione |
| `failToDownloadFile` | Download file fallito |
| `batteryChargeFail` | Errore ricarica batteria |
| `highTemperatureWarning` | Temperatura elevata |
| `batteryHighTemperature` | Batteria surriscaldata |

---

## Modelli THETA Supportati

| Modello | Note |
|---------|------|
| THETA SC2 | Preset, Filter (limitati), AP mode only, BLE API |
| THETA SC2 B | Come SC2 con varianti BLE |
| THETA X | GPS integrato, più formati file |
| THETA Z1 | RAW support, apertura variabile |
| THETA V | Predecessor SC2, simile feature set |

---

## Limiti del SDK rispetto alla nostra implementazione

1. **Network binding Android 10+**: Il SDK non gestisce `WifiNetworkSpecifier`. Richiede `bindToCameraNetwork()` (nostra funzione) prima di `initialize()`.
2. **BLE completo**: Il SDK offre solo `setBluetoothDevice()`. L'intera pipeline BLE (scan, connect, auth, takePicture) è custom nostra.
3. **Preview nativa**: Il nostro SurfaceView è più veloce dell'event-based del SDK.
4. **Client Mode discovery**: Il nostro `CameraDiscovery.ts` fa subnet scanning automatico — non coperto dal SDK.
5. **Upload queue**: Fuori dallo scope del SDK — è logica di dominio nostra.
