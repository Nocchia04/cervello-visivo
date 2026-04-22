import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Platform,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ricohClient } from "../../src/services/ricoh/RicohClient";
import { connectToCamera, isCameraWifiConnected, unbindFromCameraNetwork } from "../../src/services/ricoh/ThetaWifi";
import { CAMERA_ERROR_MESSAGES } from "../../src/services/ricoh/constants";
import {
  takePictureViaBle,
  disconnectBle,
  isBluetoothConnected,
} from "../../src/modules/theta/ble/ThetaBleService";
import { performBleConnect, BleNoSetupError } from "../../src/modules/theta/ble/autoConnect";
import { getCameraCredentials, getThetaBleCredentials } from "../../src/lib/storage";
import { uploadQueue } from "../../src/services/upload/UploadQueue";
import { RicohPreview } from "../../src/components/RicohPreview";
import type { RicohPreviewHandle } from "../../src/components/RicohPreview";
import Viewer360Native from "../../src/components/Viewer360Native";
import { UploadQueueBadge } from "../../src/components/UploadQueueBadge";
import { DebugLogOverlay } from "../../src/components/DebugLogOverlay";
import { colors, spacing, radius, typography, shadow } from "../../src/lib/theme";
import { dlog } from "../../src/lib/debugLog";

type BleStatus = "idle" | "connecting" | "connected" | "error" | "no_setup";

export default function ScattoScreen() {
  const { puntoId, puntoNome, piantinaId, piantinaNome } = useLocalSearchParams<{
    puntoId: string;
    puntoNome: string;
    piantinaId: string;
    piantinaNome: string;
  }>();

  const insets = useSafeAreaInsets();
  const previewRef = useRef<RicohPreviewHandle>(null);

  const [cameraCredentials, setCameraCredentials] = useState<{ ssid: string | null; password: string | null }>({ ssid: null, password: null });

  const [bleStatus, setBleStatus] = useState<BleStatus>("idle");
  const [bleStatusMsg, setBleStatusMsg] = useState("");
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [takingStep, setTakingStep] = useState("");
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Pending photo waiting for user confirmation before upload
  const [pendingPhoto, setPendingPhoto] = useState<{
    localUri: string;
    queueId: string;
    timestamp: string;
  } | null>(null);

  // Refresh pending count periodically
  useEffect(() => {
    const refresh = () => uploadQueue.getPendingCount().then(setPendingCount);
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-connette BLE all'apertura della schermata
  useEffect(() => {
    let cancelled = false;

    // Carica le credenziali WiFi camera per passarle al preview
    getCameraCredentials().then(({ ssid, password }) => {
      if (!cancelled) setCameraCredentials({ ssid: ssid ?? null, password: password ?? null });
    }).catch(() => {});

    async function autoConnect() {
      // Se già connessa (es. si torna allo screen senza aver chiuso l'app), non riscannare
      if (isBluetoothConnected()) {
        const { deviceName } = await getThetaBleCredentials();
        if (!cancelled) {
          setBleStatus("connected");
          setBleStatusMsg(deviceName ?? "RICOH THETA SC2");
          // Non chiamiamo loadCameraFiles qui: richiede WiFi che non è ancora connesso
        }
        return;
      }

      if (!cancelled) {
        setBleStatus("connecting");
        setBleStatusMsg("Ricerca camera...");
      }
      try {
        const deviceName = await performBleConnect();
        if (!cancelled) {
          setBleStatus("connected");
          setBleStatusMsg(deviceName);
          // Non chiamiamo loadCameraFiles qui: richiede WiFi che non è ancora connesso.
          // Verrà caricato automaticamente dopo lo scatto o quando l'utente avvia la preview.
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof BleNoSetupError) {
            setBleStatus("no_setup");
          } else {
            setBleStatus("error");
            setBleStatusMsg(err instanceof Error ? err.message : "Errore BLE");
          }
        }
      }
    }

    autoConnect();

    return () => {
      cancelled = true;
      // Non disconnettere BLE: _device è singleton, rimane connesso tra schermate.
      // Teardown completo del preview: stopLivePreview + unbind + disconnetti WiFi.
      previewRef.current?.cleanup().catch(() => {});
      // Unbind di sicurezza: se cleanup viene chiamato mentre il bind è ancora attivo
      unbindFromCameraNetwork().catch(() => {});
    };
  }, []);

  const retryBleConnect = useCallback(async () => {
    setBleStatus("connecting");
    setBleStatusMsg("Ricerca camera...");
    try {
      const deviceName = await performBleConnect();
      setBleStatus("connected");
      setBleStatusMsg(deviceName);
    } catch (err) {
      if (err instanceof BleNoSetupError) {
        setBleStatus("no_setup");
      } else {
        setBleStatus("error");
        setBleStatusMsg(err instanceof Error ? err.message : "Errore BLE");
      }
    }
  }, []);

  const takePicture = useCallback(async () => {
    if (bleStatus !== "connected") return;

    setIsTakingPicture(true);
    setTakingStep("");
    previewRef.current?.stopStream();

    const isAndroid10 = Platform.OS === "android" && (Platform.Version as number) >= 29;

    // Helper: assicura WiFi camera connesso (necessario per getState/download)
    const ensureWifi = async () => {
      if (!isAndroid10) return;
      const alreadyConnected = await isCameraWifiConnected();
      if (!alreadyConnected) {
        const { ssid, password } = await getCameraCredentials();
        if (ssid) await connectToCamera(ssid, password ?? "");
      }
    };

    // Helper: pollinga _latestFileUrl finché non cambia rispetto al baseline
    // Ritorna la nuova fileUrl, o null se timeout.
    const pollForNewPhoto = async (
      baselineUrl: string | null | undefined,
      maxMs: number
    ): Promise<string | null> => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const s = await ricohClient.getState();
          const url = s.state._latestFileUrl;
          if (url && url !== baselineUrl) return url;
        } catch {
          // transient WiFi error — ignora e riprova
        }
      }
      return null;
    };

    try {
      // ── 0. Snapshot stato pre-scatto (per detectare nuovi file) ──────────
      setTakingStep("Preparazione...");
      await ensureWifi();
      let baselineUrl: string | null = null;
      try {
        const preState = await ricohClient.getState();
        baselineUrl = preState.state._latestFileUrl ?? null;
        setBatteryLevel(Math.round(preState.state.batteryLevel * 100));
      } catch { /* ignora, useremo baseline null */ }

      // ── 1. Scatto via BLE (nessun WiFi necessario) ────────────────────────
      setTakingStep("Scatto...");
      let fileUrl: string | null = null;
      try {
        await takePictureViaBle();
        setTakingStep("Scatto completato. Download foto...");
      } catch (bleErr) {
        // BLE timeout/fail: sulla SC2 l'antenna condivisa può perdere la
        // notifica BLE anche quando la camera HA effettivamente scattato.
        // Fallback: polling getState per verificare se c'è un nuovo file.
        dlog("CAM", `BLE scatto fallito: ${bleErr instanceof Error ? bleErr.message : bleErr} — fallback polling WiFi`);
        setTakingStep("Verifica stato camera...");
        await ensureWifi();
        const found = await pollForNewPhoto(baselineUrl, 25_000);
        if (!found) throw bleErr; // rilancia l'errore BLE originale
        fileUrl = found;
        dlog("CAM", `Polling ha trovato nuovo file dopo timeout BLE: ${fileUrl}`);
      }

      // ── 2. Connetti WiFi per download (se non già fatto) ─────────────────
      await ensureWifi();

      // ── 3. Se non abbiamo già la fileUrl dal polling, leggi stato camera ─
      if (!fileUrl) {
        setTakingStep("Lettura stato camera...");
        const camState = await ricohClient.getState();
        fileUrl = camState.state._latestFileUrl ?? null;
        setBatteryLevel(Math.round(camState.state.batteryLevel * 100));

        // Se ancora non c'è, fai un po' di polling anche qui (scatto appena fatto
        // potrebbe non essere indicizzato immediatamente)
        if (!fileUrl || fileUrl === baselineUrl) {
          fileUrl = await pollForNewPhoto(baselineUrl, 10_000);
        }

        if (!fileUrl) {
          const errorCode = camState.state._cameraError?.[0];
          const errorMsg = errorCode
            ? CAMERA_ERROR_MESSAGES[errorCode] ?? `Errore camera: ${errorCode}`
            : "Nessun file trovato sulla camera — verifica che lo scatto sia andato a buon fine.";
          throw new Error(errorMsg);
        }
      }

      setTakingStep("Download foto...");
      const localUri = await ricohClient.downloadFile(fileUrl);

      // ── 4. WiFi rimane connesso — il preview lo riusa al prossimo startStream ──

      setTakingStep("");
      const queueItemId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setPendingPhoto({ localUri, queueId: queueItemId, timestamp: new Date().toISOString() });
    } catch (err) {
      setTakingStep("");
      Alert.alert("Errore scatto", err instanceof Error ? err.message : "Errore durante lo scatto");
      previewRef.current?.startStream();
    } finally {
      setIsTakingPicture(false);
    }
  }, [bleStatus]);

  const handleConfermaPhoto = useCallback(async () => {
    if (!pendingPhoto) return;
    await uploadQueue.addToQueue({
      id: pendingPhoto.queueId,
      localUri: pendingPhoto.localUri,
      puntoDiScattoId: puntoId as string,
      timestamp: pendingPhoto.timestamp,
    });
    setLastPhotoUri(pendingPhoto.localUri);
    uploadQueue.getPendingCount().then(setPendingCount);
    setPendingPhoto(null);
    // Torna alla piantina — lì riparte la riconnessione BLE per lo scatto successivo
    router.back();
  }, [pendingPhoto, puntoId]);

  const handleScartaPhoto = useCallback(async () => {
    if (!pendingPhoto) return;
    try {
      await FileSystem.deleteAsync(pendingPhoto.localUri, { idempotent: true });
    } catch {}
    setPendingPhoto(null);
    previewRef.current?.startStream();
  }, [pendingPhoto]);

  const pickFromDevice = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const localUri = result.assets[0].uri;
      setLastPhotoUri(localUri);

      const queueItemId = `pick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await uploadQueue.addToQueue({
        id: queueItemId,
        localUri,
        puntoDiScattoId: puntoId as string,
        timestamp: new Date().toISOString(),
      });
      uploadQueue.getPendingCount().then(setPendingCount);

      Alert.alert("Foto aggiunta", "Foto dal dispositivo aggiunta alla coda di upload.");
    } catch (err) {
      Alert.alert(
        "Errore",
        err instanceof Error ? err.message : "Errore nella selezione foto"
      );
    }
  }, [puntoId]);

  const viewAnnotazioni = useCallback(() => {
    if (lastPhotoUri) {
      router.push({
        pathname: "/annotazioni/[puntoId]",
        params: { puntoId: puntoId as string, puntoNome: puntoNome as string },
      });
    }
  }, [lastPhotoUri, puntoId, puntoNome]);

  const retryUploads = useCallback(async () => {
    await uploadQueue.retryFailed();
    uploadQueue.getPendingCount().then(setPendingCount);
  }, []);

  const isCapturing = bleStatus !== "connected" || isTakingPicture;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Stack.Screen
          options={{
            title: "Scatto 360°",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
          }}
        />

        {/* Header inline */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.puntoName}>{puntoNome ?? "Punto di scatto"}</Text>
            {piantinaNome && (
              <Text style={styles.piantinaLabel}>{piantinaNome}</Text>
            )}
          </View>
          <UploadQueueBadge />
        </View>

        {/* Camera BLE status */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fotocamera</Text>

          {bleStatus === "no_setup" && (
            <View style={styles.statusCardCentered}>
              <Feather name="bluetooth" size={32} color={colors.textSubtle} />
              <Text style={styles.statusCardTitle}>BLE non configurato</Text>
              <Text style={styles.statusCardHint}>
                Vai in Impostazioni e completa il setup della camera per abilitare lo scatto Bluetooth.
              </Text>
            </View>
          )}

          {bleStatus === "connecting" && (
            <View style={styles.statusCardCentered}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.connectingText}>Connessione BLE...</Text>
              {!!bleStatusMsg && (
                <Text style={styles.discoveryStatusText}>{bleStatusMsg}</Text>
              )}
            </View>
          )}

          {bleStatus === "connected" && (
            <View style={styles.connectedRow}>
              <View style={styles.connectedDot} />
              <View style={styles.connectedInfo}>
                <Text style={styles.connectedModel}>RICOH THETA SC2</Text>
                <Text style={styles.batteryText}>
                  BLE · {bleStatusMsg}
                  {batteryLevel !== null ? ` · Batteria ${batteryLevel}%` : ""}
                </Text>
              </View>
              <Feather name="bluetooth" size={18} color={colors.success} />
            </View>
          )}

          {bleStatus === "error" && (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={32} color={colors.danger} />
              <Text style={styles.errorText}>{bleStatusMsg}</Text>
              <TouchableOpacity style={styles.retryConnectButton} onPress={retryBleConnect} activeOpacity={0.8}>
                <Text style={styles.retryConnectText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          )}

          {(bleStatus === "idle") && (
            <View style={styles.statusCardCentered}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.connectingText}>Avvio...</Text>
            </View>
          )}

          {/* Step download in progress */}
          {isTakingPicture && !!takingStep && (
            <Text style={[styles.discoveryStatusText, { marginTop: spacing.sm }]}>{takingStep}</Text>
          )}
        </View>

        {/* Live Preview — richiede WiFi, disponibile solo quando BLE connesso */}
        {bleStatus === "connected" && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Live Preview</Text>
            <RicohPreview
              ref={previewRef}
              isConnected={bleStatus === "connected"}
              ssid={cameraCredentials.ssid}
              password={cameraCredentials.password}
            />
          </View>
        )}

        {/* Capture button */}
        <View style={styles.captureSection}>
          <TouchableOpacity
            style={styles.captureOuter}
            onPress={takePicture}
            disabled={isCapturing}
            activeOpacity={0.75}
          >
            <View style={[styles.captureInner, isCapturing && styles.captureInnerDisabled]}>
              {isTakingPicture ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Feather
                  name="aperture"
                  size={26}
                  color={isCapturing ? colors.textSubtle : colors.white}
                />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.captureLabel}>
            {isTakingPicture
              ? takingStep || "Scatto in corso..."
              : bleStatus === "connected"
              ? "Scatta 360°"
              : bleStatus === "connecting"
              ? "Connessione BLE..."
              : bleStatus === "no_setup"
              ? "Setup BLE richiesto"
              : "Camera non connessa"}
          </Text>
        </View>

        {/* Import from device */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.pickButton}
            onPress={pickFromDevice}
            activeOpacity={0.8}
          >
            <Feather name="image" size={18} color={colors.accent} />
            <Text style={styles.pickButtonText}>Importa dal dispositivo</Text>
          </TouchableOpacity>
        </View>

        {/* Upload queue card */}
        {pendingCount > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Coda Upload</Text>
            <View style={styles.queueCard}>
              <View style={styles.queueLeft}>
                <Feather name="upload-cloud" size={20} color={colors.warning} />
                <View style={styles.queueTextGroup}>
                  <Text style={styles.queueCount}>
                    {pendingCount} {pendingCount === 1 ? "foto" : "foto"}
                  </Text>
                  <Text style={styles.queueSubtext}>in attesa di upload</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.queueRetryButton}
                onPress={retryUploads}
                activeOpacity={0.8}
              >
                <Text style={styles.queueRetryText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Last photo saved */}
        {lastPhotoUri && (
          <View style={styles.section}>
            <View style={styles.lastPhotoCard}>
              <View style={styles.lastPhotoRow}>
                <Feather name="check-circle" size={20} color={colors.success} />
                <Text style={styles.lastPhotoTitle}>Foto salvata con successo</Text>
              </View>
              <TouchableOpacity
                style={styles.annotazioniButton}
                onPress={viewAnnotazioni}
                activeOpacity={0.8}
              >
                <Text style={styles.annotazioniButtonText}>Vedi annotazioni</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bottom spacer */}
        <View style={{ height: spacing.xxxl }} />
      </ScrollView>

      {/* Full-screen loading overlay during capture + download */}
      <Modal
        visible={isTakingPicture}
        animationType="fade"
        transparent
        onRequestClose={() => { /* blocca back button durante scatto */ }}
      >
        <View style={styles.captureOverlay}>
          <View style={styles.captureOverlayInner}>
            <ActivityIndicator size="large" color={colors.white} />
            <Text style={styles.captureOverlayTitle}>
              {takingStep.includes("Download") ? "Download foto in corso" : takingStep || "Scatto in corso"}
            </Text>
            <Text style={styles.captureOverlaySubtitle}>
              Attendi che la foto 360° sia pronta — non chiudere l'app.
            </Text>
          </View>
        </View>
      </Modal>

      {/* 360° preview modal — shown after shot, before upload */}
      <Modal
        visible={!!pendingPhoto}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleScartaPhoto}
      >
        <View style={styles.previewModal}>
          {pendingPhoto && (
            <Viewer360Native
              foto={[{ id: "preview", url: pendingPhoto.localUri, timestamp: pendingPhoto.timestamp }]}
              currentIndex={0}
              annotations={[]}
              addingAnnotation={false}
              onSphereClick={() => {}}
            />
          )}

          {/* Top bar */}
          <View style={styles.previewTopBar} pointerEvents="box-none">
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>Anteprima 360°</Text>
            </View>
            <Text style={styles.previewHint}>Trascina per esplorare la foto</Text>
          </View>

          {/* Action buttons */}
          <View style={[styles.previewActions, { paddingBottom: insets.bottom + spacing.lg }]}>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={handleScartaPhoto}
              activeOpacity={0.85}
            >
              <Text style={styles.discardButtonText}>Scarta</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfermaPhoto}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmButtonText}>Conferma e carica</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Debug log button */}
      <TouchableOpacity
        onPress={() => setShowDebugLog(true)}
        style={{
          position: "absolute",
          bottom: insets.bottom + 12,
          right: 12,
          backgroundColor: "rgba(0,0,0,0.6)",
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 6,
          zIndex: 50,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>Log</Text>
      </TouchableOpacity>

      {/* Debug log overlay */}
      <DebugLogOverlay visible={showDebugLog} onClose={() => setShowDebugLog(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },

  // Header inline
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xxl,
  },
  headerText: {
    flex: 1,
    marginRight: spacing.md,
  },
  puntoName: {
    ...typography.h2,
    color: colors.text,
  },
  piantinaLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Section
  section: {
    marginBottom: spacing.xxl,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },

  // Status — disconnected / connecting / error (centered card)
  statusCardCentered: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  statusCardTitle: {
    ...typography.h4,
    color: colors.textMuted,
  },
  statusCardHint: {
    ...typography.bodySmall,
    color: colors.textSubtle,
    textAlign: "center",
  },
  connectButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xs,
  },
  connectButtonText: {
    ...typography.h4,
    color: colors.white,
  },
  connectingText: {
    ...typography.body,
    color: colors.textMuted,
  },
  discoveryStatusText: {
    ...typography.caption,
    color: colors.accent,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 2,
  },

  // Connected row
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.successLight,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  connectedInfo: {
    flex: 1,
    gap: 2,
  },
  connectedModel: {
    ...typography.h4,
    color: colors.success,
  },
  batteryText: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  discoveryStatusConnected: {
    ...typography.caption,
    color: colors.textSubtle,
    marginTop: 2,
  },
  connectedRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 0,
  },
  modeBadge: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  modeBadgeText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: "700",
  },

  // Error
  errorCard: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
    ...shadow.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  retryConnectButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xs,
  },
  retryConnectText: {
    ...typography.h4,
    color: colors.white,
  },

  // Capture — double ring
  captureSection: {
    alignItems: "center",
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  captureOuter: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: "rgba(220, 38, 38, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.capture,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.capture,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  captureInnerDisabled: {
    backgroundColor: colors.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  captureLabel: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },


  // Import from device
  pickButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
    ...shadow.sm,
  },
  pickButtonText: {
    ...typography.h4,
    color: colors.accent,
  },

  // Upload queue
  queueCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  queueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  queueTextGroup: {
    gap: 2,
  },
  queueCount: {
    ...typography.h4,
    color: colors.warning,
  },
  queueSubtext: {
    ...typography.caption,
    color: colors.warning,
  },
  queueRetryButton: {
    backgroundColor: colors.warning,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  queueRetryText: {
    ...typography.label,
    color: colors.white,
  },

  // Last photo saved
  lastPhotoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  lastPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  lastPhotoTitle: {
    ...typography.h4,
    color: colors.success,
  },
  annotazioniButton: {
    backgroundColor: colors.accentLight,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  annotazioniButtonText: {
    ...typography.h4,
    color: colors.accent,
  },

  // Full-screen capture loading overlay
  captureOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  captureOverlayInner: {
    alignItems: "center",
    gap: spacing.lg,
  },
  captureOverlayTitle: {
    ...typography.h3,
    color: colors.white,
    textAlign: "center",
  },
  captureOverlaySubtitle: {
    ...typography.bodySmall,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    lineHeight: 20,
  },

  // 360° preview modal
  previewModal: {
    flex: 1,
    backgroundColor: "#000",
  },
  previewTopBar: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
    gap: spacing.xs,
    pointerEvents: "none",
  },
  previewBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  previewBadgeText: {
    color: colors.white,
    ...typography.label,
    letterSpacing: 0.5,
  },
  previewHint: {
    ...typography.caption,
    color: "rgba(255,255,255,0.55)",
  },
  previewActions: {
    position: "absolute",
    bottom: 0,
    left: spacing.xl,
    right: spacing.xl,
    flexDirection: "row",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  discardButton: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  discardButtonText: {
    ...typography.h4,
    color: colors.white,
  },
  confirmButton: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  confirmButtonText: {
    ...typography.h4,
    color: colors.white,
  },
});
