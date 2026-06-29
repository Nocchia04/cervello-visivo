import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { FOTO360_QUERY } from "../../src/graphql/queries";
import { resolveMediaUrl } from "../../src/lib/mediaUrl";
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
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { thetaSession, getModelLabel } from "../../src/services/theta/ThetaSession";
import { getCameraCredentials } from "../../src/lib/storage";
import { uploadQueue } from "../../src/services/upload/UploadQueue";
import { RicohPreview } from "../../src/components/RicohPreview";
import type { RicohPreviewHandle } from "../../src/components/RicohPreview";
import Viewer360Native from "../../src/components/Viewer360Native";
import { UploadQueueBadge } from "../../src/components/UploadQueueBadge";
import { DebugLogOverlay } from "../../src/components/DebugLogOverlay";
import { colors, spacing, radius, typography, shadow } from "../../src/lib/theme";
import { dlog } from "../../src/lib/debugLog";

type CameraStatus = "idle" | "connecting" | "ready" | "error" | "no_setup";

function modelLabel(): string {
  return getModelLabel(thetaSession.getModel());
}

/** True se l'errore è un fallimento di CONNESSIONE (comando mai arrivato). */
function isConnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ailed to connect|ECONNREFUSED|ETIMEDOUT|unreachable|NOT_CONNECTED/i.test(msg);
}

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

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraStatusMsg, setCameraStatusMsg] = useState("");
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [takingStep, setTakingStep] = useState("");
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Scatto in attesa di conferma. Contiene il JPEG 5K (5376×2688) GIÀ scaricato
  // dalla camera sul telefono: lo scatto mostra una schermata di caricamento
  // durante il download, poi questa preview 360° a piena risoluzione. Alla
  // conferma il file va alla coda di upload (persistita) che lo carica in
  // background ridimensionandolo a 3072px.
  const [pendingPhoto, setPendingPhoto] = useState<{
    localUri: string;     // JPEG 5K scaricato, mostrato in preview 360° e poi caricato
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

  // ── Foto del giorno precedente per questo punto ───────────────────────────
  // Mostriamo sopra la live preview l'ultima foto di questo punto scattata
  // PRIMA del giorno corrente, così l'operatore vede com'era la scena ieri
  // (o ancora prima se ieri non è stato scattato nulla) mentre allinea la
  // camera per il nuovo scatto. Re-fetch cache-and-network per pescare le
  // foto appena uploadate dopo il ritorno dalla schermata.
  const { data: fotoData } = useQuery(FOTO360_QUERY, {
    variables: { puntoId: puntoId as string },
    skip: !puntoId,
    fetchPolicy: "cache-and-network",
  });

  const previousDayFoto = useMemo(() => {
    const fotos = (fotoData?.foto360 ?? []) as Array<{
      id: string;
      url: string;
      thumbnailUrl: string | null;
      timestamp: string;
    }>;
    if (fotos.length === 0) return null;
    // Filtra foto con timestamp anteriore alla mezzanotte di oggi.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const cutoff = startOfToday.getTime();
    const prev = fotos
      .filter((f) => new Date(f.timestamp).getTime() < cutoff)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return prev[0] ?? null;
  }, [fotoData]);

  // Connessione sessione camera (SDK theta-client) all'apertura della schermata.
  // ensureConnected: WiFi (WifiNetworkSpecifier, dialogo Android al primo uso)
  // → bind processo → initialize SDK → modello rilevato → PhotoCapture pronto.
  const connectCamera = useCallback(async (cancelledRef?: { cancelled: boolean }) => {
    const isCancelled = () => cancelledRef?.cancelled === true;

    const { ssid, password } = await getCameraCredentials();
    if (isCancelled()) return;
    setCameraCredentials({ ssid: ssid ?? null, password: password ?? null });

    if (!ssid) {
      setCameraStatus("no_setup");
      return;
    }

    setCameraStatus("connecting");
    setCameraStatusMsg("Connessione alla camera...");
    try {
      await thetaSession.ensureConnected(ssid, password ?? "");
      if (isCancelled()) return;
      setCameraStatus("ready");
      setCameraStatusMsg(thetaSession.getSerial() ?? "");
      // Batteria: best-effort, una sola richiesta
      thetaSession.getBatteryLevel().then((b) => {
        if (!isCancelled() && b !== null) setBatteryLevel(b);
      });
    } catch (err) {
      if (isCancelled()) return;
      dlog("CAM", `Connessione sessione fallita: ${err instanceof Error ? err.message : err}`);
      setCameraStatus("error");
      setCameraStatusMsg(
        isConnectError(err)
          ? "Camera non raggiungibile. Verifica che sia accesa e vicina, poi riprova."
          : err instanceof Error ? err.message : "Errore di connessione"
      );
    }
  }, []);

  useEffect(() => {
    const ref = { cancelled: false };
    connectCamera(ref);

    // Se la sessione cade mentre siamo sullo screen (sleep camera, RF),
    // riflettiamo lo stato così la UI mostra il retry.
    const unsubscribe = thetaSession.onStatusChange((s) => {
      if (ref.cancelled) return;
      if (s === "disconnected") {
        setCameraStatus((prev) => {
          if (prev !== "ready") return prev;
          setCameraStatusMsg("Connessione camera persa. Riprova.");
          return "error";
        });
      }
    });

    return () => {
      ref.cancelled = true;
      unsubscribe();
      // Stop SOLO lo stream MJPEG. La SESSIONE camera resta viva tra gli
      // screen (la chiude ThetaSession quando l'app va in background): così
      // il download 5K in background sopravvive al ritorno in piantina e il
      // rientro su un altro punto è istantaneo (niente riconnessione WiFi).
      previewRef.current?.cleanup().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retryConnect = useCallback(() => {
    connectCamera();
  }, [connectCamera]);

  const takePicture = useCallback(async () => {
    if (cameraStatus !== "ready") return;

    setIsTakingPicture(true);
    setTakingStep("Scatto in corso...");

    try {
      // 1. Ferma lo stream MJPEG: occupa l'httpd single-thread della camera e
      //    ~3-4 MB/s della banda 2.4GHz → senza stop il download 5K crolla.
      await previewRef.current?.stopStream().catch(() => {});

      // 2. SCATTO 5K (procedura ufficiale SDK: takePicture → fileUrl). Su SC2
      //    l'IMAGE_5K è l'unica risoluzione (5376×2688).
      const fileUrl = await thetaSession.takePhoto();

      // 3. DOWNLOAD del JPEG pieno sul telefono (schermata di caricamento
      //    visibile finché non è scaricato). Sulla SC2 il link 2.4GHz è lento
      //    → può richiedere fino a ~1 minuto; è il collo di bottiglia hardware.
      setTakingStep("Download foto...");
      const localUri = await thetaSession.downloadPhoto(fileUrl);

      setTakingStep("");
      setIsTakingPicture(false);

      // 4. Preview 360° a piena risoluzione → conferma/scarta.
      const queueItemId = `theta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      setPendingPhoto({
        localUri,
        queueId: queueItemId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      setTakingStep("");
      setIsTakingPicture(false);
      dlog("CAM", `Scatto fallito: ${err instanceof Error ? err.message : err}`);
      Alert.alert(
        "Errore scatto",
        isConnectError(err)
          ? "Camera non raggiungibile durante lo scatto. Verifica che sia accesa e vicina."
          : err instanceof Error ? err.message : "Errore durante lo scatto"
      );
      // Riavvia il mirino per riprovare.
      await previewRef.current?.startStream().catch(() => {});
    }
  }, [cameraStatus]);

  const handleConfermaPhoto = useCallback(() => {
    if (!pendingPhoto) return;
    const pp = pendingPhoto;
    setPendingPhoto(null);
    // Il JPEG 5K è già sul telefono → upload in background via coda persistita
    // (sopravvive alla chiusura app). La coda lo ridimensiona a 3072px.
    uploadQueue.addToQueue({
      id: pp.queueId,
      localUri: pp.localUri,
      puntoDiScattoId: puntoId as string,
      timestamp: pp.timestamp,
    });
    uploadQueue.getPendingCount().then(setPendingCount);
    setLastPhotoUri(pp.localUri);
    router.back();
  }, [pendingPhoto, puntoId]);

  const handleScartaPhoto = useCallback(async () => {
    if (!pendingPhoto) return;
    const pp = pendingPhoto;
    setPendingPhoto(null);
    try {
      await FileSystem.deleteAsync(pp.localUri, { idempotent: true });
    } catch {}
    await previewRef.current?.startStream().catch(() => {});
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

  const isCapturing = cameraStatus !== "ready" || isTakingPicture;

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

        {/* Camera status (sessione SDK theta-client) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fotocamera</Text>

          {cameraStatus === "no_setup" && (
            <View style={styles.statusCardCentered}>
              <Feather name="camera-off" size={32} color={colors.textSubtle} />
              <Text style={styles.statusCardTitle}>Camera non configurata</Text>
              <Text style={styles.statusCardHint}>
                Vai in Impostazioni e inserisci numero di serie e password della camera.
              </Text>
            </View>
          )}

          {cameraStatus === "connecting" && (
            <View style={styles.statusCardCentered}>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.connectingText}>Connessione camera...</Text>
              {!!cameraStatusMsg && (
                <Text style={styles.discoveryStatusText}>{cameraStatusMsg}</Text>
              )}
            </View>
          )}

          {cameraStatus === "ready" && (
            <View style={styles.connectedRow}>
              <View style={styles.connectedDot} />
              <View style={styles.connectedInfo}>
                <Text style={styles.connectedModel}>{modelLabel()}</Text>
                <Text style={styles.batteryText}>
                  WiFi · {cameraStatusMsg}
                  {batteryLevel !== null ? ` · Batteria ${batteryLevel}%` : ""}
                </Text>
              </View>
              <Feather name="wifi" size={18} color={colors.success} />
            </View>
          )}

          {cameraStatus === "error" && (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={32} color={colors.danger} />
              <Text style={styles.errorText}>{cameraStatusMsg}</Text>
              <TouchableOpacity style={styles.retryConnectButton} onPress={retryConnect} activeOpacity={0.8}>
                <Text style={styles.retryConnectText}>Riprova</Text>
              </TouchableOpacity>
            </View>
          )}

          {(cameraStatus === "idle") && (
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

        {/* Foto del giorno precedente — riferimento per allineare la camera. */}
        {previousDayFoto && (
          <View style={styles.section}>
            <View style={styles.previousFotoHeader}>
              <Text style={styles.sectionLabel}>Ultima foto</Text>
              <Text style={styles.previousFotoDate}>
                {new Date(previousDayFoto.timestamp).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            </View>
            <Image
              source={{ uri: resolveMediaUrl(previousDayFoto.thumbnailUrl || previousDayFoto.url) }}
              style={styles.previousFoto}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Live Preview — disponibile quando la sessione camera è pronta */}
        {cameraStatus === "ready" && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Live Preview</Text>
            <RicohPreview
              ref={previewRef}
              isConnected={cameraStatus === "ready"}
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
              : cameraStatus === "ready"
              ? "Scatta 360°"
              : cameraStatus === "connecting"
              ? "Connessione camera..."
              : cameraStatus === "no_setup"
              ? "Configurazione richiesta"
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
            <Text style={styles.sectionLabel}>Caricamento foto in corso</Text>
            <View style={styles.queueCard}>
              <View style={styles.queueLeft}>
                <ActivityIndicator size="small" color={colors.warning} />
                <View style={styles.queueTextGroup}>
                  <Text style={styles.queueCount}>
                    {pendingCount} {pendingCount === 1 ? "foto" : "foto"}
                  </Text>
                  <Text style={styles.queueSubtext}>upload in corso...</Text>
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
              {takingStep || "Scatto in corso"}
            </Text>
            <Text style={styles.captureOverlaySubtitle}>
              Ci siamo quasi — non chiudere l'app.
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
              <Text style={styles.previewBadgeText}>Foto 360°</Text>
            </View>
            <Text style={styles.previewHint}>
              Trascina per esplorare. Conferma per salvare.
            </Text>
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
              <Text style={styles.confirmButtonText}>Conferma</Text>
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

  // Foto del giorno precedente (riferimento sopra la live preview)
  previousFotoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  previousFotoDate: {
    ...typography.caption,
    color: colors.textMuted,
  },
  previousFoto: {
    width: "100%",
    aspectRatio: 2,            // equirettangolare 2:1, stesse proporzioni della live preview
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
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
