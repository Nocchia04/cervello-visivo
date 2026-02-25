# THETA Client React Native SDK - Research Summary

## 1. SDK Overview

**Package:** `theta-client-react-native` (npm)
**Latest version:** 1.13.2
**Repository:** https://github.com/ricohapi/theta-client
**License:** MIT
**Architecture:** Kotlin Multiplatform Mobile (KMM) with native bridges

### Nature: Native Module (NOT pure JS)

theta-client is a **native module** built with Kotlin Multiplatform. The React Native wrapper communicates via `NativeModules.ThetaClientReactNative` bridge. This means:

- **Android:** Ships a compiled `.aar` (Kotlin/JVM) that must be linked
- **iOS:** Ships an XCFramework via CocoaPods that must be linked
- The JS layer is a thin TypeScript wrapper that delegates all calls to native code
- The native layer handles HTTP communication, session management, MJPEG frame parsing, and command polling internally

The `index.tsx` entry point explicitly warns:
> "You are not using Expo Go"

This is a turbo/classic native module - it requires native compilation.

---

## 2. Expo Compatibility

### Critical: Does NOT work with Expo Go

Because theta-client is a native module:

| Environment | Compatible? | Notes |
|---|---|---|
| Expo Go | **NO** | Cannot load native modules |
| EAS Dev Build | **YES** | Requires `npx expo prebuild` + custom dev client |
| Bare React Native | **YES** | Standard `react-native link` / autolinking |
| Expo SDK 54 + Dev Build | **Likely YES with caveats** | See compatibility notes below |

### Compatibility Concerns with Current Stack

Our app uses:
- **Expo SDK 54** (`expo: ~54.0.0`)
- **React Native 0.81.5** (`react-native: ^0.81.5`)
- **React 19.1** (`react: ^19.1.0`)

theta-client was developed against:
- **React Native 0.70.8** (devDependencies show `@types/react-native: 0.70.8`)
- **React 18.2.0**
- **Uses old-style `NativeModules` bridge** (not TurboModules / New Architecture)

**Risk factors:**
1. **RN 0.81 vs 0.70 gap:** The native bridge API is mostly stable, but 11 major versions is a large gap. Breaking changes in the native module resolution or bridge behavior could cause issues.
2. **React 19 vs 18:** The JS wrapper doesn't deeply use React internals (just NativeEventEmitter), so this is likely fine.
3. **New Architecture:** RN 0.81 defaults to New Architecture (Fabric + TurboModules). theta-client uses the old `NativeModules` bridge. The interop layer should handle this, but it's untested.
4. **No Expo config plugin:** theta-client doesn't ship an Expo config plugin, so `expo prebuild` won't auto-configure Android `minSdkVersion` or iOS `platform` settings. Manual configuration needed in `app.json` or plugin.

---

## 3. Installation

### For Expo (EAS Dev Build)

```bash
# Install the package
npx expo install theta-client-react-native

# Or with yarn
yarn add theta-client-react-native

# Prebuild to generate native projects
npx expo prebuild

# Build dev client
eas build --profile development --platform all
```

### Manual Configuration Required

**Android** (`android/build.gradle`):
- `minSdkVersion` must be **26 or later**

**iOS** (`ios/Podfile`):
- `platform :ios` must be **'15.0' or later**
- Need to add CocoaPods dependency for THETAClient

**iOS** (`Info.plist`) - Allow HTTP to camera IP:
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSExceptionDomains</key>
  <dict>
    <key>192.168.1.1</key>
    <dict>
      <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key>
      <true/>
    </dict>
  </dict>
</dict>
```

**Android** (`res/xml/network_security_config.xml`) - Allow cleartext to camera IP:
```xml
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.1.1</domain>
  </domain-config>
</network-security-config>
```

---

## 4. API Reference

### Initialization

```typescript
import { initialize, isInitialized } from 'theta-client-react-native';

// Default endpoint (192.168.1.1)
await initialize();

// Custom endpoint
await initialize('http://192.168.1.1', config?, timeout?);

// Check initialization status
const ready: boolean = await isInitialized();
```

### Camera Info & State

```typescript
import { getThetaInfo, getThetaState, getThetaModel } from 'theta-client-react-native';

const info: ThetaInfo = await getThetaInfo();
// { manufacturer, model, serialNumber, firmwareVersion, ... }

const state: ThetaState = await getThetaState();
// { batteryLevel, storageUri, captureStatus, ... }

const model: ThetaModel | undefined = await getThetaModel();
```

### Take Picture (Builder Pattern)

```typescript
import { getPhotoCaptureBuilder, PhotoFileFormatEnum } from 'theta-client-react-native';

// 1. Configure and build
const photoCapture = await getPhotoCaptureBuilder()
  .setFileFormat(PhotoFileFormatEnum.IMAGE_5K)
  .setIsoAutoHighLimit(IsoAutoHighLimitEnum.ISO_1000)
  .build();

// 2. Take picture - returns file URL on camera
const fileUrl: string | undefined = await photoCapture.takePicture();
```

### Live Preview (MJPEG via Native Events)

```typescript
import { getLivePreview, stopLivePreview, THETA_EVENT_NAME } from 'theta-client-react-native';
import { NativeModules, NativeEventEmitter, Image } from 'react-native';

// Subscribe to frame events
const emitter = new NativeEventEmitter(NativeModules.ThetaClientReactNative);
const listener = emitter.addListener(THETA_EVENT_NAME, (event) => {
  // event.data = DataURL of JPEG frame (base64)
  setFrameUri(event.data);
});

// Start preview (resolves when preview ends)
await getLivePreview();

// Stop preview
await stopLivePreview();
listener.remove();

// Render: <Image source={{ uri: frameDataUrl }} />
```

### List Files

```typescript
import { listFiles, FileTypeEnum } from 'theta-client-react-native';

const { fileList, totalEntries }: ThetaFiles = await listFiles(
  FileTypeEnum.IMAGE,  // IMAGE | VIDEO | ALL
  0,                    // startPosition
  100                   // entryCount
);

// fileList[0] = { name, fileUrl, size, dateTime, thumbnailUrl, width, height, ... }
```

### Delete Files

```typescript
import { deleteFiles, deleteAllFiles, deleteAllImageFiles } from 'theta-client-react-native';

await deleteFiles(['http://192.168.1.1/files/.../image.jpg']);
await deleteAllFiles();
await deleteAllImageFiles();
```

### Camera Options

```typescript
import { getOptions, setOptions, OptionNameEnum } from 'theta-client-react-native';

const opts = await getOptions([
  OptionNameEnum.Aperture,
  OptionNameEnum.CaptureMode,
  OptionNameEnum.ColorTemperature,
]);

await setOptions({ aperture: ApertureEnum.APERTURE_AUTO });
```

### Video Capture

```typescript
import { getVideoCaptureBuilder } from 'theta-client-react-native';

const videoCapture = await getVideoCaptureBuilder()
  .setFileFormat(VideoFileFormatEnum.VIDEO_HD)
  .build();

const fileUrl = await videoCapture.startCapture((error) => {
  // stop capture error handler
});

videoCapture.stopCapture();
```

### Other Capture Modes

- `getTimeShiftCaptureBuilder()` - Time-shift capture
- `getLimitlessIntervalCaptureBuilder()` - Limitless interval shooting
- `getShotCountSpecifiedIntervalCaptureBuilder(count)` - Fixed-count interval
- `getCompositeIntervalCaptureBuilder(sec)` - Composite interval
- `getBurstCaptureBuilder(...)` - Burst shooting
- `getMultiBracketCaptureBuilder()` - Multi-bracket
- `getContinuousCaptureBuilder()` - Continuous shooting

### Utility Functions

```typescript
reset()                              // Reset camera
reboot()                             // Reboot (THETA A1 only)
finishWlan()                         // Turn off WiFi
restoreSettings()                    // Restore saved settings
stopSelfTimer()                      // Cancel self-timer
convertVideoFormats(url, lowRes, topBottom)  // Convert video format
getMetadata(fileUrl)                 // Get EXIF/XMP metadata
setBluetoothDevice(uuid)            // Register BLE device
```

### Access Point Management

```typescript
listAccessPoints()
setAccessPointDynamically(ssid, { authMode, password, ... })
setAccessPointStatically(ssid, ip, subnet, gateway, { ... })
deleteAccessPoint(ssid)
```

### Plugin Management (THETA V/X/Z1)

```typescript
listPlugins()
setPlugin(packageName)
startPlugin(packageName)
stopPlugin()
getPluginLicense(packageName)
getPluginOrders()
setPluginOrders(plugins)
```

---

## 5. Comparison: theta-client vs Current OSC Implementation

### Current Implementation (`RicohClient.ts`)

Our `RicohClient` is a lightweight class (~188 lines) using raw `fetch()` calls to the OSC API:

| Method | What it does | Lines |
|---|---|---|
| `getInfo()` | GET /osc/info | 6 |
| `getState()` | POST /osc/state | 8 |
| `takePicture()` | POST execute + poll for completion | 20 |
| `checkCommandStatus()` | POST /osc/commands/status | 10 |
| `waitForCompletion()` | Poll loop (500ms x 60 max) | 15 |
| `getLivePreviewUrl()` | Returns execute endpoint URL | 2 |
| `getPreviewCommandBody()` | Returns JSON body string | 2 |
| `listFiles()` | POST execute camera.listFiles | 20 |
| `downloadFile()` | expo-file-system download | 15 |

### What theta-client adds over raw OSC

| Feature | Our OSC | theta-client |
|---|---|---|
| **Take picture** | Manual poll loop | Handled natively, with capturing status callbacks |
| **Live preview** | Raw MJPEG URL (must parse stream) | Native MJPEG parser, delivers base64 frames via events |
| **List files** | Basic fields | Rich FileInfo with thumbnailUrl, codec, projectionType, favorites |
| **Delete files** | Not implemented | Full delete API (single, all, by type) |
| **Camera options** | Not implemented | Full get/set options with typed enums |
| **Video capture** | Not implemented | Full start/stop with builder pattern |
| **Advanced captures** | Not implemented | Time-shift, interval, burst, bracket, composite |
| **Session management** | None (stateless fetch) | `initialize()` sets up connection, native handles session |
| **Error handling** | Basic HTTP status checks | Native layer with typed errors |
| **Command polling** | Manual JS setTimeout loop | Handled natively (more reliable) |
| **Access points** | Not implemented | Full WiFi AP management |
| **Plugins** | Not implemented | Full plugin management |
| **Type safety** | Partial (hand-written types) | Comprehensive TypeScript types from KMM |

### What we'd lose

| Concern | Detail |
|---|---|
| **Expo Go development** | Cannot use Expo Go anymore; must use EAS dev builds |
| **Simplicity** | 188-line file vs. large native dependency |
| **Bundle size** | Adds KMM runtime + native binaries for both platforms |
| **Control** | Can't easily debug native layer or patch OSC quirks |
| **Compatibility risk** | RN 0.70-era module on RN 0.81 |

---

## 6. Migration Guide

### Method Mapping

| Current (`ricohClient.xxx`) | theta-client equivalent |
|---|---|
| `ricohClient.getInfo()` | `getThetaInfo()` |
| `ricohClient.getState()` | `getThetaState()` |
| `ricohClient.takePicture()` | `getPhotoCaptureBuilder().build()` then `photoCapture.takePicture()` |
| `ricohClient.listFiles(count)` | `listFiles(FileTypeEnum.IMAGE, 0, count)` |
| `ricohClient.checkCommandStatus(id)` | Not needed (handled internally) |
| `ricohClient.downloadFile(url)` | Still use `expo-file-system` or `fetch()` - theta-client doesn't handle downloads |
| `ricohClient.getLivePreviewUrl()` | `getLivePreview()` + NativeEventEmitter for frames |
| `ricohClient.getPreviewCommandBody()` | Not needed (handled by `getLivePreview()`) |

### Key Differences in Usage

1. **Initialization required:** Must call `await initialize()` before any other method
2. **Builder pattern for capture:** Instead of a direct `takePicture()`, you build a `PhotoCapture` first
3. **Live preview is event-based:** No more parsing MJPEG streams - receive base64 frames via NativeEventEmitter
4. **No singleton class:** theta-client exports standalone functions, not a class instance

### Migration Steps

1. Install `theta-client-react-native`
2. Run `npx expo prebuild` (switches from Expo Go to dev builds)
3. Configure native settings (minSdk, iOS platform, ATS exceptions)
4. Replace `ricohClient.getInfo()` -> `initialize()` + `getThetaInfo()`
5. Replace `ricohClient.takePicture()` -> builder pattern
6. Replace live preview component to use NativeEventEmitter
7. Replace `ricohClient.listFiles()` -> `listFiles(FileTypeEnum.IMAGE, 0, count)`
8. Keep `expo-file-system` for file downloads (theta-client doesn't handle this)

---

## 7. Gotchas and Limitations

1. **No Expo Go support** - This is the single biggest impact. All developers must use EAS dev builds.
2. **RN version gap (0.70 vs 0.81)** - Untested on modern RN. The NativeModules bridge still works via interop, but native compilation issues are possible.
3. **React 19 untested** - The SDK was built for React 18. The JS surface is minimal so likely fine, but NativeEventEmitter behavior may differ.
4. **No Expo config plugin** - Must manually configure `minSdkVersion`, iOS platform, and cleartext traffic settings. Would need a custom Expo config plugin or manual `app.json` adjustments.
5. **Large dependency** - KMM runtime adds significant native binary size to both platforms.
6. **Live preview memory pressure** - Each frame is a full base64 JPEG string passed through the bridge. For real-time preview this means high bridge traffic and GC pressure.
7. **Maintained but not actively developed** - Last npm publish matches repo v1.13.2. The project is maintained by RICOH but updates are infrequent.
8. **Build complexity** - The README describes building from source with Gradle + CocoaPods. The npm package should have prebuilt binaries, but if they don't link on RN 0.81 we'd need to build from source.

---

## 8. Recommendation

### Keep the current OSC implementation, with targeted enhancements

**Reasoning:**

1. **Expo Go development is too valuable to lose.** Switching to theta-client means every developer needs EAS dev builds for every change. This dramatically slows iteration speed for an app in active development.

2. **The RN version gap is a real risk.** theta-client targets RN 0.70 and our app runs RN 0.81. Native module compatibility across 11 major versions is not guaranteed, and debugging KMM native crashes is significantly harder than debugging fetch calls.

3. **Our OSC implementation covers the core use case.** We have `takePicture()`, `listFiles()`, `getInfo()`, `getState()`, and live preview support. These are the features we actually use.

4. **The benefits are marginal for our use case.** theta-client's main advantages - native MJPEG parsing, advanced capture modes (burst, interval, time-shift), plugin management - are features we don't currently need. Our app takes pictures and lists them.

5. **The OSC API is stable and well-documented.** RICOH's OSC API v2.1 hasn't changed. Raw fetch calls are predictable, debuggable, and have zero native dependencies.

### Suggested OSC Enhancements Instead

If we want to improve the current implementation without switching to theta-client:

1. **Add `deleteFile()`/`deleteFiles()` methods** - Simple POST to execute endpoint
2. **Add `getOptions()`/`setOptions()` methods** - Same pattern as listFiles
3. **Improve live preview** - Use a streaming fetch approach or WebSocket for MJPEG frames, which can work in Expo Go
4. **Better error types** - Create typed error classes instead of generic Error throws
5. **Connection status** - Add a `checkConnection()` method that hits `/osc/info` with a short timeout

These additions would bring our 188-line client to ~300 lines while maintaining full Expo Go compatibility.

### When theta-client WOULD make sense

- If we needed advanced capture modes (time-shift, burst, bracket, interval)
- If we were building a bare React Native app (no Expo)
- If RICOH published an Expo config plugin
- If the SDK was updated for RN 0.80+ and New Architecture
