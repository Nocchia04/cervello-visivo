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
  UIManager,
  findNodeHandle,
} from "react-native";
import type { EmitterSubscription } from "react-native";
import {
  thetaWifiEmitter,
  THETA_WIFI_LOST_EVENT,
} from "../services/ricoh/ThetaWifi";
import { thetaSession } from "../services/theta/ThetaSession";
import { capturePipeline } from "../services/theta/CapturePipeline";
import { PreviewFormatEnum, CaptureModeEnum } from "theta-client-react-native";
import ThetaPreviewNativeView from "./ThetaPreviewNativeView";
import { dlog } from "../lib/debugLog";
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
    // True mentre la preview attende che un download 5K in background finisca
    // (sulla SC2 camera = un accesso alla volta).
    const [preparing, setPreparing] = useState(false);

    const wifiLostRef = useRef<EmitterSubscription | null>(null);
    const streamActiveRef = useRef(false);
    const nativeViewRef = useRef<any>(null);
    // Token di generazione: stopStream/cleanup/wifi-lost lo incrementano.
    // startStream (async, può durare secondi tra ensureConnected e setOptions)
    // lo cattura all'ingresso e lo ricontrolla prima di accendere lo stream:
    // se nel frattempo è arrivato uno stop (es. scatto partito), NON parte.
    // Senza questo, la preview poteva accendersi DURANTE il download
    // saturando la banda 2.4GHz della camera.
    const generationRef = useRef(0);
    // Mutex anti-rientro per startStream (vedi commento in startStream).
    const startInFlightRef = useRef(false);

    const removeListeners = useCallback(() => {
      wifiLostRef.current?.remove();
      wifiLostRef.current = null;
    }, []);

    /**
     * Chiude IMMEDIATAMENTE la socket TCP del MJPEG via command nativo.
     * Bypassa il React render → prop dispatch round-trip che lascia la
     * camera streamare frame inutilmente per qualche frame extra,
     * occupando la banda WiFi 2.4GHz prima del download (critico su SC2).
     */
    const dispatchNativeStopPreview = useCallback(() => {
      if (Platform.OS !== "android") return;
      const tag = findNodeHandle(nativeViewRef.current);
      if (tag == null) return;
      try {
        UIManager.dispatchViewManagerCommand(tag, "stopPreview", []);
      } catch {
        // command non registrato (es. build non aggiornata) — fallback è
        // comunque la prop change isStreaming=false gestita più sotto
      }
    }, []);

    // ── stopStream ──────────────────────────────────────────────────────────

    const stopStream = useCallback(async () => {
      // Invalida qualsiasi startStream in volo (vedi generationRef).
      generationRef.current += 1;
      // Stop nativo SEMPRE, anche se il flag JS dice "non attivo": se JS e
      // nativo si desincronizzano (race, errore), il socket MJPEG va chiuso
      // comunque — è idempotente e costa nulla.
      dispatchNativeStopPreview();

      if (!streamActiveRef.current) return;
      streamActiveRef.current = false;
      dlog("PREV", "stopStream — stream fermato");
      // Aggiorna state React (declarativo, per UI)
      setStreaming(false);
      setFirstFrame(false);
      removeListeners();

      // QUIRK SC2 (documentato sul campo): dopo getLivePreview la camera
      // RESTA in modalità _liveStreaming anche a socket chiuso — l'encoder
      // MJPEG interno continua a girare a 30fps saturando CPU e banda della
      // camera → il download successivo crolla a ~50 KB/s. Rimettere
      // captureMode=image la fa uscire dallo stato. Soft-fail, no-op
      // innocuo su THETA V / SC2_B.
      await thetaSession.trySetOptions({ captureMode: CaptureModeEnum.IMAGE });
      dlog("PREV", "captureMode=image ripristinato (uscita da _liveStreaming)");

      // Grace period per dare alla camera il tempo di finalizzare la
      // chiusura dello stream e svuotare il buffer TX. Su SC2 (banda
      // 2.4GHz condivisa) anche solo 250ms cambiano sensibilmente la
      // velocità del download successivo. Innocuo per V/SC2_B.
      await new Promise<void>((r) => setTimeout(r, 250));
    }, [removeListeners, dispatchNativeStopPreview]);

    // ── cleanup ─────────────────────────────────────────────────────────────

    const cleanup = useCallback(async () => {
      generationRef.current += 1;
      streamActiveRef.current = false;
      dispatchNativeStopPreview();
      setStreaming(false);
      setFirstFrame(false);
      removeListeners();
      dlog("PREV", "cleanup — preview fermata");
      // NB: NON chiudiamo la sessione camera qui. Il teardown (unbind + WiFi
      // off) è delegato alla CapturePipeline, che lo rimanda se c'è un
      // download full in background — altrimenti lo ucciderebbe.
    }, [removeListeners, dispatchNativeStopPreview]);

    // ── startStream ─────────────────────────────────────────────────────────

    const startStream = useCallback(async () => {
      if (streamActiveRef.current) return;
      // Mutex anti-rientro: due startStream concorrenti (es. recovery da
      // errore scatto + "Scarta" rapido) passerebbero entrambi il check su
      // streamActiveRef (ancora false durante gli await del primo).
      if (startInFlightRef.current) return;
      if (!isConnected) return;

      if (Platform.OS !== "android" || (Platform.Version as number) < 29) {
        setError("Live preview disponibile solo su Android 10+");
        return;
      }

      // Cattura la generazione corrente: se durante gli await qui sotto
      // arriva uno stop (scatto partito, unmount), la generazione cambia
      // e questo start si annulla invece di accendere lo stream in ritardo.
      const generation = generationRef.current;
      startInFlightRef.current = true;
      dlog("PREV", "startStream richiesto");

      try {
        setError(null);
        setFirstFrame(false);

        // ANTI-CONTESA SC2: se c'è un download 5K in background (scatto
        // precedente), aspetta che finisca. Camera = un accesso alla volta:
        // avviare la preview durante il download li rompe entrambi (preview
        // senza frame + download fallito → fallback 1024px).
        if (capturePipeline.isBusy()) {
          dlog("PREV", "preview in attesa: salvataggio 5K scatto precedente in corso...");
          setPreparing(true);
          await capturePipeline.waitIdle();
          setPreparing(false);
          if (generation !== generationRef.current) {
            dlog("PREV", "startStream annullato (stop durante attesa salvataggio)");
            return;
          }
        }

        if (ssid) {
          try {
            // ensureConnected è idempotente: connette WiFi, binda il processo,
            // inizializza l'SDK e prepara il PhotoCapture. Se la sessione è già
            // ready è un no-op — la preview e lo scatto condividono la sessione.
            await thetaSession.ensureConnected(ssid, password ?? "");
          } catch {
            setError(
              "Camera non raggiungibile.\nAssicurati che sia accesa e vicina."
            );
            return;
          }
        }

        if (generation !== generationRef.current) {
          dlog("PREV", "startStream annullato (stop arrivato durante la connessione)");
          return;
        }

        // Forza preview format 1024x512@30fps (default su THETA V firmware < 2.21.1
        // è 8fps — con questa chiamata abbiamo 30fps anche su firmware vecchi).
        // SC2 ignora il framerate (supporta solo 30fps su 1024x512).
        await thetaSession.trySetOptions({
          previewFormat: PreviewFormatEnum.W1024_H512_F30,
        });

        if (generation !== generationRef.current) {
          dlog("PREV", "startStream annullato (stop arrivato durante setOptions)");
          return;
        }

        removeListeners();

        if (thetaWifiEmitter) {
          wifiLostRef.current = thetaWifiEmitter.addListener(
            THETA_WIFI_LOST_EVENT,
            () => {
              // Invalida SEMPRE eventuali startStream in volo: senza rete
              // camera uno start completato in ritardo lascerebbe lo stato
              // JS su streaming=true con la preview nativa spenta.
              generationRef.current += 1;
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
        dlog("PREV", "startStream — stream avviato");
      } finally {
        startInFlightRef.current = false;
        setPreparing(false);
      }
    }, [isConnected, ssid, password, removeListeners]);

    useImperativeHandle(
      ref,
      () => ({ stopStream, startStream, cleanup }),
      [stopStream, startStream, cleanup]
    );

    // Non avvia più la preview automaticamente: l'utente deve premere il tasto
    // "Avvia anteprima" per dare il consenso al dialogo WiFi Android.
    // Quando la connessione cade, ferma SOLO lo stream (niente teardown:
    // il parent potrebbe stare riconnettendo la sessione proprio ora).
    useEffect(() => {
      if (!isConnected) {
        stopStream();
        setError(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    // Teardown completo SOLO all'unmount — non a ogni rimbalzo di
    // isConnected (ready→error→ready), che invaliderebbe la sessione SDK
    // mentre il parent la sta ricostruendo.
    useEffect(() => {
      return () => { cleanup(); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
          ref={nativeViewRef}
          isStreaming={streaming && !error}
          style={styles.frame}
          onFirstFrame={() => setFirstFrame(true)}
          onPreviewError={() => {
            // Invalida startStream in volo + chiudi il socket nativo subito
            // (l'errore può arrivare con lo stream parzialmente attivo).
            generationRef.current += 1;
            dispatchNativeStopPreview();
            if (streamActiveRef.current) {
              streamActiveRef.current = false;
              setStreaming(false);
              setFirstFrame(false);
              setError("Errore stream preview");
              removeListeners();
            }
          }}
        />

        {/* In attesa del salvataggio 5K dello scatto precedente */}
        {preparing && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>
              Salvataggio scatto precedente...{"\n"}L'anteprima parte tra poco.
            </Text>
          </View>
        )}

        {/* CTA iniziale: preview non ancora avviata */}
        {!streaming && !error && !preparing && (
          <View style={styles.overlay}>
            <Text style={styles.placeholderIcon}>📷</Text>
            <Text style={styles.ctaText}>
              Tocca per avviare l'anteprima live.{"\n"}
              Apparirà un dialogo Android — conferma "Connetti".
            </Text>
            <TouchableOpacity
              onPress={startStream}
              style={styles.retryButton}
              activeOpacity={0.8}
            >
              <Text style={styles.retryText}>Avvia anteprima</Text>
            </TouchableOpacity>
          </View>
        )}

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
  ctaText: {
    ...typography.bodySmall,
    color: colors.white,
    textAlign: "center",
    lineHeight: 18,
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
