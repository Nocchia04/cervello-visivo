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
  FlatList,
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
import {
  scanAndConnect,
  connectByPeripheralId,
  takePictureViaBle,
  disconnectBle,
  isBluetoothConnected,
} from "../../src/modules/theta/ble/ThetaBleService";
import { getCameraCredentials, getThetaBleCredentials } from "../../src/lib/storage";
import { uploadQueue } from "../../src/services/upload/UploadQueue";
import { RicohPreview } from "../../src/components/RicohPreview";
import type { RicohPreviewHandle } from "../../src/components/RicohPreview";
import Viewer360Native from "../../src/components/Viewer360Native";
import { UploadQueueBadge } from "../../src/components/UploadQueueBadge";
import { colors, spacing, radius, typography, shadow } from "../../src/lib/theme";
import type { OscFileEntry } from "../../src/services/ricoh/types";

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
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [takingStep, setTakingStep] = useState("");
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [cameraFiles, setCameraFiles] = useState<OscFileEntry[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
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

  const loadCameraFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const result = await ricohClient.listFiles(5);
      setCameraFiles(result.entries ?? []);
    } catch {
      // Non-critical
    } finally {
      setLoadingFiles(false);
    }
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
        const { deviceName, setupComplete } = await getThetaBleCredentials();
        if (!cancelled) {
          setBleStatus("connected");
          setBleStatusMsg(deviceName ?? "RICOH THETA SC2");
          loadCameraFiles();
        }
        return;
      }

      setBleStatus("connecting");
      setBleStatusMsg("Ricerca camera...");
      try {
        const { uuid, deviceName, peripheralId, setupComplete } = await getThetaBleCredentials();
        if (!setupComplete || !uuid || !deviceName) {
          if (!cancelled) setBleStatus("no_setup");
          return;
        }
        if (!cancelled) setBleStatusMsg(`Connessione BLE (${deviceName})...`);

        if (peripheralId) {
          // Connessione diretta — nessuna scansione, molto più veloce
          try {
            await connectByPeripheralId(peripheralId, uuid);
          } catch {
            // Fallback a scan se connessione diretta fallisce (es. camera riparata/sostituita)
            await scanAndConnect(deviceName, uuid);
          }
        } else {
          await scanAndConnect(deviceName, uuid);
        }

        if (!cancelled) {
          setBleStatus("connected");
          setBleStatusMsg(deviceName);
          loadCameraFiles();
        }
      } catch (err) {
        if (!cancelled) {
          setBleStatus("error");
          setBleStatusMsg(err instanceof Error ? err.message : "Errore BLE");
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
      const { uuid, deviceName, peripheralId, setupComplete } = await getThetaBleCredentials();
      if (!setupComplete || !uuid || !deviceName) {
        setBleStatus("no_setup");
        return;
      }
      setBleStatusMsg(`Connessione BLE (${deviceName})...`);

      if (peripheralId) {
        try {
          await connectByPeripheralId(peripheralId, uuid);
        } catch {
          await scanAndConnect(deviceName, uuid);
        }
      } else {
        await scanAndConnect(deviceName, uuid);
      }

      setBleStatus("connected");
      setBleStatusMsg(deviceName);
      loadCameraFiles();
    } catch (err) {
      setBleStatus("error");
      setBleStatusMsg(err instanceof Error ? err.message : "Errore BLE");
    }
  }, [loadCameraFiles]);

  const takePicture = useCallback(async () => {
    if (bleStatus !== "connected") return;

    setIsTakingPicture(true);
    setTakingStep("");
    previewRef.current?.stopStream();

    const isAndroid10 = Platform.OS === "android" && (Platform.Version as number) >= 29;

    try {
      // ── 1. Scatto via BLE (nessun WiFi necessario) ────────────────────────
      setTakingStep("Scatto...");
      await takePictureViaBle();
      setTakingStep("Scatto completato. Download foto...");

      // ── 2. Connetti WiFi solo se non già connesso ─────────────────────────
      // stopStream() mantiene il WiFi attivo: spesso non serve riconnettersi.
      if (isAndroid10) {
        const alreadyConnected = await isCameraWifiConnected();
        if (!alreadyConnected) {
          const { ssid, password } = await getCameraCredentials();
          if (ssid) await connectToCamera(ssid, password ?? "");
        }
      }

      // ── 3. Trova il file più recente e scaricalo ──────────────────────────
      const files = await ricohClient.listFiles(1);
      const latest = files.entries?.[0];
      if (!latest?.fileUrl) throw new Error("Nessun file trovato sulla camera");
      const localUri = await ricohClient.downloadFile(latest.fileUrl);

      // ── 4. WiFi rimane connesso — il preview lo riusa al prossimo startStream ──

      setTakingStep("");
      const queueItemId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setPendingPhoto({ localUri, queueId: queueItemId, timestamp: new Date().toISOString() });
      loadCameraFiles();
    } catch (err) {
      setTakingStep("");
      Alert.alert("Errore scatto", err instanceof Error ? err.message : "Errore durante lo scatto");
      previewRef.current?.startStream();
    } finally {
      setIsTakingPicture(false);
    }
  }, [bleStatus, loadCameraFiles]);

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
    previewRef.current?.startStream();
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

  const addCameraFileToQueue = useCallback(
    async (fileEntry: OscFileEntry) => {
      try {
        const localUri = await ricohClient.downloadFile(fileEntry.fileUrl);
        const queueItemId = `cam_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await uploadQueue.addToQueue({
          id: queueItemId,
          localUri,
          puntoDiScattoId: puntoId as string,
          timestamp: new Date().toISOString(),
        });
        uploadQueue.getPendingCount().then(setPendingCount);
        Alert.alert("Aggiunta", "Foto aggiunta alla coda di upload.");
      } catch (err) {
        Alert.alert(
          "Errore download",
          err instanceof Error ? err.message : "Errore durante il download"
        );
      }
    },
    [puntoId]
  );

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
                  <Feather name="bluetooth" size={11} /> BLE · {bleStatusMsg}
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

        {/* Camera files thumbnails */}
        {bleStatus === "connected" && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Ultime foto sulla camera</Text>
            {loadingFiles ? (
              <ActivityIndicator
                color={colors.accent}
                style={{ marginVertical: spacing.lg }}
              />
            ) : cameraFiles.length > 0 ? (
              <FlatList
                horizontal
                data={cameraFiles}
                keyExtractor={(item) => item.fileUrl}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.thumbCard}
                    onPress={() => addCameraFileToQueue(item)}
                    activeOpacity={0.7}
                  >
                    {item.thumbnail ? (
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${item.thumbnail}` }}
                        style={styles.thumbImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.thumbPlaceholder}>
                        <Feather name="camera" size={22} color={colors.textSubtle} />
                      </View>
                    )}
                    <Text style={styles.thumbName} numberOfLines={1}>
                      {item.name ?? item.fileUrl.split("/").pop()}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={styles.noFilesText}>Nessuna foto trovata</Text>
            )}
          </View>
        )}

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

  // Camera files thumbnails
  thumbCard: {
    width: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  thumbImage: {
    width: 110,
    height: 82,
  },
  thumbPlaceholder: {
    width: 110,
    height: 82,
    backgroundColor: colors.surfaceHover,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbName: {
    ...typography.caption,
    color: colors.textSubtle,
    padding: spacing.xs,
    textAlign: "center",
  },
  noFilesText: {
    ...typography.bodySmall,
    color: colors.textSubtle,
    textAlign: "center",
    paddingVertical: spacing.lg,
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
