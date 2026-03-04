/**
 * RicohPreview — live preview MJPEG nativo della Ricoh Theta SC2.
 *
 * Android 10+: usa ThetaWifiModule (OkHttp legato alla rete camera,
 *   parser MJPEG in Kotlin, eventi ThetaLiveFrame via NativeEventEmitter).
 * iOS / Android < 10: live preview non disponibile nativamente.
 *   L'utente scatta e vede l'anteprima solo dopo il download.
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
  Image,
} from "react-native";
import type { EmitterSubscription } from "react-native";
import {
  thetaWifiEmitter,
  THETA_FRAME_EVENT,
  THETA_PREVIEW_ERROR_EVENT,
  startNativeLivePreview,
  stopNativeLivePreview,
} from "../services/ricoh/ThetaWifi";
import { RICOH_BASE_URL } from "../services/ricoh/constants";
import { colors, spacing, radius, typography } from "../lib/theme";

export interface RicohPreviewHandle {
  stopStream: () => void;
  startStream: () => void;
}

interface RicohPreviewProps {
  isConnected: boolean;
}

const RicohPreviewInner = forwardRef<RicohPreviewHandle, RicohPreviewProps>(
  ({ isConnected }, ref) => {
    const [frameUri, setFrameUri] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [streaming, setStreaming] = useState(false);
    const frameListenerRef = useRef<EmitterSubscription | null>(null);
    const errorListenerRef = useRef<EmitterSubscription | null>(null);
    const streamActiveRef = useRef(false);

    const stopStream = useCallback(async () => {
      if (!streamActiveRef.current) return;
      streamActiveRef.current = false;
      setStreaming(false);
      frameListenerRef.current?.remove();
      frameListenerRef.current = null;
      errorListenerRef.current?.remove();
      errorListenerRef.current = null;
      await stopNativeLivePreview();
    }, []);

    const startStream = useCallback(async () => {
      if (streamActiveRef.current) return;

      // Live preview richiede il modulo nativo (Android 10+)
      if (!thetaWifiEmitter) {
        setError("Live preview disponibile solo su Android 10+");
        return;
      }

      setFrameUri(null);
      setError(null);
      setStreaming(true);

      // Registra listener PRIMA di avviare lo stream
      frameListenerRef.current?.remove();
      frameListenerRef.current = thetaWifiEmitter.addListener(
        THETA_FRAME_EVENT,
        (dataUrl: string) => {
          if (dataUrl) setFrameUri(dataUrl);
        }
      );

      errorListenerRef.current?.remove();
      errorListenerRef.current = thetaWifiEmitter.addListener(
        THETA_PREVIEW_ERROR_EVENT,
        (message: string) => {
          setError(message ?? "Errore stream");
          setStreaming(false);
          streamActiveRef.current = false;
        }
      );

      try {
        const started = await startNativeLivePreview(RICOH_BASE_URL);
        if (!started) {
          // Piattaforma non supportata (non dovrebbe succedere se thetaWifiEmitter != null)
          setStreaming(false);
          setError("Live preview non supportata su questo dispositivo");
          frameListenerRef.current?.remove();
          frameListenerRef.current = null;
          errorListenerRef.current?.remove();
          errorListenerRef.current = null;
          return;
        }
        streamActiveRef.current = true;
      } catch (err) {
        setStreaming(false);
        setError(
          err instanceof Error ? err.message : "Errore avvio stream"
        );
        frameListenerRef.current?.remove();
        frameListenerRef.current = null;
        errorListenerRef.current?.remove();
        errorListenerRef.current = null;
      }
    }, []);

    useImperativeHandle(ref, () => ({ stopStream, startStream }), [
      stopStream,
      startStream,
    ]);

    useEffect(() => {
      if (isConnected) {
        startStream();
      } else {
        stopStream();
        setFrameUri(null);
        setError(null);
      }
      return () => {
        stopStream();
      };
    }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

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
        {/* Frame dalla camera */}
        {frameUri && (
          <Image
            source={{ uri: frameUri }}
            style={styles.frame}
            resizeMode="contain"
          />
        )}

        {/* Loading: nessun frame ancora */}
        {streaming && !frameUri && !error && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Avvio preview...</Text>
          </View>
        )}

        {/* Errore */}
        {error && (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Badge LIVE */}
        {!!frameUri && (
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
    backgroundColor: "rgba(0,0,0,0.7)",
    gap: spacing.sm,
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
    paddingHorizontal: spacing.xl,
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
