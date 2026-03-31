/**
 * RicohPreview — live preview MJPEG della Ricoh Theta SC2.
 *
 * Architettura:
 *   - ThetaPreviewNativeView (SurfaceView) renderizza i frame JPEG direttamente
 *     tramite BitmapFactory + Canvas.drawBitmap() — zero base64, zero bridge.
 *   - La prop `isStreaming` controlla start/stop del thread MJPEG nativo.
 *   - `onFirstFrame` → nasconde il loading spinner al primo frame.
 *   - `onPreviewError` → mostra errore + retry.
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from "react-native";
import type { EmitterSubscription } from "react-native";
import {
  thetaWifiEmitter,
  THETA_WIFI_LOST_EVENT,
  connectToCamera,
  disconnectFromCamera,
  isCameraWifiConnected,
} from "../services/ricoh/ThetaWifi";
import ThetaPreviewNativeView from "./ThetaPreviewNativeView";
import { colors, spacing, radius, typography } from "../lib/theme";

export interface RicohPreviewHandle {
  /** Ferma il preview (WiFi rimane connesso). */
  stopStream: () => Promise<void>;
  /** Riavvia il preview. */
  startStream: () => Promise<void>;
  /** Teardown completo: stop + disconnetti WiFi. Da chiamare all'uscita. */
  cleanup: () => Promise<void>;
}

interface RicohPreviewProps {
  isConnected: boolean;
  ssid: string | null;
  password: string | null;
}

const RicohPreviewInner = forwardRef<RicohPreviewHandle, RicohPreviewProps>(
  ({ isConnected, ssid, password }, ref) => {
    const [streaming, setStreaming] = useState(false);
    const [firstFrame, setFirstFrame] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const wifiLostRef = useRef<EmitterSubscription | null>(null);
    const streamActiveRef = useRef(false);

    const removeListeners = useCallback(() => {
      wifiLostRef.current?.remove();
      wifiLostRef.current = null;
    }, []);

    // ── stopStream ──────────────────────────────────────────────────────────

    const stopStream = useCallback(async () => {
      if (!streamActiveRef.current) return;
      streamActiveRef.current = false;
      setStreaming(false);
      setFirstFrame(false);
      removeListeners();
    }, [removeListeners]);

    // ── cleanup ─────────────────────────────────────────────────────────────

    const cleanup = useCallback(async () => {
      streamActiveRef.current = false;
      setStreaming(false);
      setFirstFrame(false);
      removeListeners();
      await disconnectFromCamera().catch(() => {});
    }, [removeListeners]);

    // ── startStream ─────────────────────────────────────────────────────────

    const startStream = useCallback(async () => {
      if (streamActiveRef.current) return;
      if (!isConnected) return;

      if (Platform.OS !== "android" || (Platform.Version as number) < 29) {
        setError("Live preview disponibile solo su Android 10+");
        return;
      }

      setError(null);
      setFirstFrame(false);

      if (ssid) {
        try {
          const alreadyConnected = await isCameraWifiConnected();
          if (!alreadyConnected) {
            await connectToCamera(ssid, password ?? "");
          }
        } catch {
          setError(
            "Camera non raggiungibile.\nAssicurati che sia accesa e vicina."
          );
          return;
        }
      }

      removeListeners();

      if (thetaWifiEmitter) {
        wifiLostRef.current = thetaWifiEmitter.addListener(
          THETA_WIFI_LOST_EVENT,
          () => {
            if (streamActiveRef.current) {
              streamActiveRef.current = false;
              setStreaming(false);
              setFirstFrame(false);
              setError("WiFi camera disconnesso.");
              removeListeners();
            }
          }
        );
      }

      streamActiveRef.current = true;
      setStreaming(true);
    }, [isConnected, ssid, password, removeListeners]);

    useImperativeHandle(
      ref,
      () => ({ stopStream, startStream, cleanup }),
      [stopStream, startStream, cleanup]
    );

    useEffect(() => {
      if (isConnected) {
        startStream();
      } else {
        stopStream();
        setError(null);
      }
      return () => { cleanup(); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    // ── Render ──────────────────────────────────────────────────────────────

    if (!isConnected) {
      return (
        <View style={styles.container}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderText}>
            Connetti la camera per il live preview
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {/* SurfaceView nativa — frame JPEG renderizzati direttamente su Canvas */}
        <ThetaPreviewNativeView
          isStreaming={streaming && !error}
          style={styles.frame}
          onFirstFrame={() => setFirstFrame(true)}
          onPreviewError={() => {
            if (streamActiveRef.current) {
              streamActiveRef.current = false;
              setStreaming(false);
              setFirstFrame(false);
              setError("Errore stream preview");
              removeListeners();
            }
          }}
        />

        {/* Loading spinner — visibile finché non arriva il primo frame */}
        {streaming && !firstFrame && !error && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Connessione camera...</Text>
          </View>
        )}

        {/* Errore con retry */}
        {!!error && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={() => {
                streamActiveRef.current = false;
                setStreaming(false);
                setFirstFrame(false);
                setError(null);
                startStream();
              }}
              style={styles.retryButton}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Badge LIVE — appare al primo frame */}
        {streaming && firstFrame && !error && (
          <View style={styles.liveBadge} pointerEvents="none">
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
    );
  }
);

RicohPreviewInner.displayName = "RicohPreview";
export const RicohPreview = RicohPreviewInner;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 2 / 1,
    backgroundColor: colors.black,
    borderRadius: radius.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.75)",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  placeholderText: {
    ...typography.bodySmall,
    color: colors.textSubtle,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textSubtle,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    textAlign: "center",
  },
  retryButton: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  retryText: {
    ...typography.label,
    color: colors.white,
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  liveText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
