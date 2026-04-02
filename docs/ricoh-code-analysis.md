# Analisi Codice Ricoh — Confronto SDK vs Implementazione Custom

## Architettura della nostra implementazione

```
app/scatto/[puntoId].tsx          ← Schermata scatto
├── ThetaBleService.ts            ← BLE: scan, connect, auth, takePicture
├── RicohClient.ts                ← OSC API: getInfo, getState, listFiles, download, delete
├── ThetaWifi.ts                  ← Bridge nativo Android 10+ (WifiNetworkSpecifier)
├── CameraDiscovery.ts            ← Client Mode: subnet scan per trovare IP camera
├── RicohPreview.tsx              ← UI live preview (delega a ThetaPreviewNativeView)
└── ThetaPreviewNativeView.ts     ← Binding a ThetaWifiModule.kt (SurfaceView)

app/(tabs)/impostazioni.tsx       ← Setup wizard BLE (one-time)
src/lib/storage.ts                ← AsyncStorage: credenziali WiFi + BLE
src/services/upload/UploadQueue   ← Coda di upload persistita
src/services/upload/UploadWorker  ← Worker 15s interval + pub/sub UI
```

---

## Dove il nostro codice è MEGLIO del SDK

### 1. Network Binding Android 10+ (WifiNetworkSpecifier)

**Nostro**: `ThetaWifi.ts` usa `WifiNetworkSpecifier` tramite `ThetaWifiModule.kt`. Risultato: WiFi camera attivo **senza** perdere i dati mobili. `network.openConnection()` instrada solo le richieste alla camera sulla rete giusta senza `bindProcessToNetwork` (che romperebbe internet per tutta l'app).

**SDK**: Non gestisce questo scenario. L'SDK si aspetta che la connessione WiFi sia già disponibile e usa OkHttp standard. Su Android 10+ senza il nostro bridge, i dati mobili verrebbero disconnessi.

**Giudizio**: La nostra soluzione è superiore e necessaria su Android 10+. Il SDK richiederebbe comunque il nostro `bindToCameraNetwork()` prima di `initialize()`.

---

### 2. BLE Pipeline Completa

**Nostro**: `ThetaBleService.ts` implementa l'intera pipeline:
- Permission request (BLUETOOTH_SCAN + BLUETOOTH_CONNECT su Android 12+)
- Wait for Bluetooth radio to power on (con timeout 10s)
- Scan per nome device (con timeout 15s)
- Connect + discover services
- Auth: write UUID → `AUTH_BLUETOOTH_DEVICE` characteristic
- `takePictureViaBle()`: subscribe notify PRIMA di scrivere 0x01, timeout 35s
- `connectByPeripheralId()`: riconnessione rapida senza scan (usa ID salvato)
- `getConnectedDeviceId()`: singleton _device, persiste tra schermate

**SDK**: Solo `setBluetoothDevice(uuid)` — registra l'UUID via WiFi. Nessun scan, connect, auth, né takePicture via BLE.

**Giudizio**: La nostra implementazione è l'unica opzione per BLE photo trigger. Il SDK non offre alternativa.

---

### 3. Live Preview Nativa (SurfaceView)

**Nostro**: `ThetaPreviewNativeView` → `ThetaWifiModule.kt` → SurfaceView con BitmapFactory + Canvas. I frame JPEG vengono decodificati e renderizzati direttamente in Kotlin, **zero bridge JS**, zero serializzazione base64.

**SDK**: Emette ogni frame come `data:image/jpeg;base64,...` via `NativeEventEmitter`. Il frame attraversa il bridge React Native, viene decodificato e renderizzato come `<Image>` in JS.

**Giudizio**: Il nostro approach è più performante per il live preview (nessun bridge overhead, nessun base64). Per schermi con frame rate elevato (MJPEG a 10+ fps), la differenza è significativa.

---

### 4. Upload Queue Asincrona + Persistita

**Nostro**: `UploadQueue` + `UploadWorker` — separazione completa tra cattura e upload. Upload persistito su `AsyncStorage`, retry fino a 3 volte, worker con polling 15s. L'operatore può scattare offline e ricaricare quando torna in rete.

**SDK**: Fuori scope. Il SDK restituisce solo URL del file sulla camera; il trasferimento al server è responsabilità dell'applicazione.

**Giudizio**: Architettura corretta per l'uso in cantiere dove la connettività è discontinua.

---

### 5. Client Mode Discovery

**Nostro**: `CameraDiscovery.ts` — quando la camera è in Client Mode (connessa all'hotspot del telefono), fa subnet scanning automatico. Prioritizza range tipici degli hotspot (.2-.50, .100-.120), batch paralleli da 30, timeout 1.5s per IP, cache IP in AsyncStorage.

**SDK**: Non gestisce la modalità Client. Assume sempre AP mode con IP fisso 192.168.1.1.

**Giudizio**: Funzionalità extra non coperta dal SDK — utile per setup avanzati.

---

### 6. Setup Wizard Guidato

**Nostro**: `impostazioni.tsx` ha un wizard 5-step con step indicator, messaggi di stato per ogni fase, error recovery specifico (LOCATION_DISABLED, NEARBY_WIFI_DENIED, WIFI_UNAVAILABLE), link diretto alle impostazioni sistema, e reset BLE one-button.

**SDK**: Non fornisce UI di setup. Solo `setBluetoothDevice()` come API.

**Giudizio**: UX notevolmente migliore per l'operatore medio.

---

## Dove il SDK è MEGLIO del nostro codice

### 1. Modalità di Cattura Avanzate

**SDK**: 11 modalità di cattura (burst, time-shift, continuous, interval, composite, multi-bracket).

**Nostro**: Solo singolo scatto via BLE o OSC diretto. Nessun burst, nessun time-shift, nessun video.

**Impatto**: Basso per il nostro use case (cantiere, foto 360° puntuali). Ma se si volessero bracketing HDR o video 360°, il SDK avrebbe tutto pronto.

---

### 2. Builder Pattern per Opzioni Scatto

**SDK**: Chainable builder con validazione a build-time:
```typescript
getPhotoCaptureBuilder()
  .setFileFormat(PhotoFileFormatEnum.IMAGE_5K)
  .setPreset(PresetEnum.ROOM)
  .setIsoAutoHighLimit(IsoAutoHighLimitEnum.ISO_1000)
  .build()
```

**Nostro**: `camera.takePicture` via OSC senza configurare le opzioni scatto. Usiamo le impostazioni di default della camera.

**Impatto**: Medio. Le impostazioni default della SC2 sono buone per uso generale, ma impostare esplicitamente `preset: ROOM` per interni o `filter: NOISE_REDUCTION` potrebbe migliorare la qualità in certi cantieri.

---

### 3. Error Codes Strutturati

**SDK**: Espone `cameraError[]` in ThetaState con codici tipizzati (es. `disabledShootingWhileBatteryCharging`, `cameraFileSystemError`, `noMemoryCard`).

**Nostro**: I tipi `OscState` e `OscCommandResponse` espongono `error.code` come string generica. Non mappiamo i codici noti a messaggi utente in italiano.

**Impatto**: Medio. Un operatore che vede "Errore camera: disabledShootingWhileBatteryCharging" non sa cosa fare. Un messaggio "Batteria in carica — stacca il cavo e riprova" è molto più utile.

---

### 4. State Monitoring Avanzato

**SDK**: `ThetaState` include: `boardTemp`, `batteryTemp`, `chargingState`, `cameraError[]`, `isSdCard`, `isPluginRunning`.

**Nostro**: Mostriamo solo `batteryLevel`. Non sfruttiamo le informazioni di temperatura, stato carica, o presenza SD.

**Impatto**: Basso per uso normale, utile per diagnostica (es. se la camera è surriscaldata in estate).

---

### 5. Metadata EXIF

**SDK**: `getMetadata(fileUrl)` ritorna i metadati EXIF della foto (GPS, orientazione, timestamp, ecc.).

**Nostro**: Non accediamo ai metadati EXIF. Il file viene scaricato come blob e uplodato al server senza arricchimento metadata.

**Impatto**: Basso al momento, ma potrebbe essere utile in futuro per geolocalizzare i punti di scatto automaticamente.

---

## Analisi del Flusso Scatto — Problema Identificato

### Flusso attuale (prima delle correzioni)
```
1. takePictureViaBle()       ← BLE
2. connectToCamera(ssid, pw) ← WiFi (se non già connesso)
3. listFiles(1)              ← WiFi OSC — LENTO, rischio freeze SC2
4. downloadFile(entries[0].fileUrl) ← WiFi
```

**Problema con `listFiles(1)`**:
- Richiesta più lenta di `getState()` (parsing lista file vs. stato camera)
- Rischio di freeze su SC2 se `maxThumbSize` viene passato errato (già mitigato con `0`)
- Spreca una chiamata OSC quando l'informazione è già in `state._latestFileUrl`

### Flusso corretto (dopo le correzioni)
```
1. takePictureViaBle()       ← BLE
2. connectToCamera(ssid, pw) ← WiFi (se non già connesso)
3. getState()                ← WiFi OSC — veloce, ritorna _latestFileUrl + batteryLevel + _cameraError
4. downloadFile(state._latestFileUrl) ← WiFi
```

**Vantaggi**:
- `getState()` è più veloce di `listFiles(1)`
- Otteniamo `batteryLevel` gratis per mostrarlo in UI
- Otteniamo `_cameraError[]` per rilevare errori specifici (carica, memoria, filesystem)
- Zero rischio freeze thumbnail

---

## Gap Analysis — Cosa Manca

| Feature | SDK | Nostro | Priorità |
|---------|-----|--------|----------|
| `_latestFileUrl` via getState | ✅ | ⚠️ Usa listFiles(1) | **Alta — IMPLEMENTATO** |
| Battery display dopo scatto | ✅ | ❌ | **Alta — IMPLEMENTATO** |
| Camera error codes → messaggi IT | ✅ | ❌ | **Alta — IMPLEMENTATO** |
| Setup countdown 5s wait | N/A | ⚠️ Silent | **Media — IMPLEMENTATO** |
| Burst/time-shift capture | ✅ | ❌ | Bassa (fuori scope) |
| Video capture | ✅ | ❌ | Bassa (fuori scope) |
| EXIF metadata | ✅ | ❌ | Bassa |
| Builder options (preset, filter) | ✅ | ❌ | Bassa |
| Temperature monitoring | ✅ | ❌ | Bassa |
| BLE dedup connect function | N/A | ⚠️ Duplicato | **Media — IMPLEMENTATO** |

---

## Miglioramenti Implementati

### 1. `types.ts` — `_cameraError` in OscState
Aggiunto campo `_cameraError?: string[]` allo stato camera. Permette di rilevare errori specifici come `disabledShootingWhileBatteryCharging` e `noMemoryCard`.

### 2. `constants.ts` — `CAMERA_ERROR_MESSAGES`
Mappa da codice errore camera a messaggio italiano user-friendly.

### 3. `scatto/[puntoId].tsx` — `getState()` invece di `listFiles(1)`
Dopo il BLE shot, si chiama `getState()` per ottenere `_latestFileUrl`. Più veloce, elimina il rischio freeze thumbnail, e ci dà battery level + error detection gratis.

### 4. `scatto/[puntoId].tsx` — Battery display
`batteryLevel` state aggiunto. Viene aggiornato dopo ogni scatto (tramite `getState()`). Mostrato nel badge camera connessa come "XX%".

### 5. `scatto/[puntoId].tsx` — `performBleConnect()` deduplicated
Estratta funzione module-level `performBleConnect()` con la logica comune tra `autoConnect` e `retryBleConnect`. Riduce duplicazione di ~20 righe.

### 6. `impostazioni.tsx` — Countdown BLE wait
Il silent `await sleep(5000)` è diventato un countdown 5→1s che aggiorna `setupStatusMsg` ogni secondo. L'operatore sa esattamente quanto manca all'avvio della scansione BLE.

---

## Note su Cosa NON Cambiare

- **BLE Service**: La nostra implementazione è completa e corretta. Il SDK non offre nulla di comparabile. Non sostituire.
- **ThetaWifi.ts + native module**: La soluzione WifiNetworkSpecifier è la corretta per Android 10+. Non toccare.
- **RicohPreview SurfaceView**: Più performante del SDK. Non sostituire con event emitter JS-side.
- **Upload Queue**: Logica di dominio, nulla a che fare con il SDK.
- **CameraDiscovery**: Funzionalità extra non coperta dal SDK. Tenere.
- **`maxThumbSize: 0` in listFiles**: Bug specifico SC2, documentato nel codice, non rimuovere.
