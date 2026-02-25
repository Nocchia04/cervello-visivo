import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { RICOH_BASE_URL, OSC_ENDPOINTS, OSC_COMMANDS } from "../services/ricoh/constants";
import { colors, spacing, radius, typography } from "../lib/theme";

export interface RicohPreviewHandle {
  stopStream: () => void;
  startStream: () => void;
}

interface RicohPreviewProps {
  isConnected: boolean;
}

// HTML loaded inline — fetch uses the full absolute URL so no baseUrl needed.
// This avoids the iOS WKWebView "Load Failed" caused by baseUrl navigation attempts.
const MJPEG_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    img { width: 100%; height: 100%; object-fit: contain; display: none; }
  </style>
</head>
<body>
  <img id="frame" />
  <script>
    var controller = null;
    var img = document.getElementById('frame');
    var lastFrame = 0;

    function post(msg) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }

    async function startStream() {
      controller = new AbortController();
      try {
        var response = await fetch('${RICOH_BASE_URL}${OSC_ENDPOINTS.EXECUTE}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ name: '${OSC_COMMANDS.GET_LIVE_PREVIEW}' }),
          signal: controller.signal,
        });

        if (!response.body) { post({ type: 'error', msg: 'Streams API not available' }); return; }

        var reader = response.body.getReader();
        var buffer = new Uint8Array(0);

        while (true) {
          var result = await reader.read();
          if (result.done) break;

          var chunk = result.value;
          var merged = new Uint8Array(buffer.length + chunk.length);
          merged.set(buffer);
          merged.set(chunk, buffer.length);
          buffer = merged;

          // Find JPEG SOI (FF D8)
          var startIdx = -1;
          for (var i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xFF && buffer[i+1] === 0xD8) { startIdx = i; break; }
          }
          if (startIdx === -1) continue;

          // Find JPEG EOI (FF D9)
          for (var j = startIdx + 2; j < buffer.length - 1; j++) {
            if (buffer[j] === 0xFF && buffer[j+1] === 0xD9) {
              var jpeg = buffer.slice(startIdx, j + 2);
              buffer = buffer.slice(j + 2);

              // Throttle to ~10fps
              var now = Date.now();
              if (now - lastFrame < 100) break;
              lastFrame = now;

              // Display via object URL (no base64 needed - faster)
              var blob = new Blob([jpeg], { type: 'image/jpeg' });
              var prevSrc = img.src;
              img.src = URL.createObjectURL(blob);
              img.style.display = 'block';
              if (prevSrc.startsWith('blob:')) URL.revokeObjectURL(prevSrc);

              post({ type: 'frame' });
              break;
            }
          }

          if (buffer.length > 512 * 1024) buffer = new Uint8Array(0);
        }
      } catch(e) {
        if (e.name !== 'AbortError') post({ type: 'error', msg: e.message });
      }
    }

    startStream();
  </script>
</body>
</html>`;

const RicohPreviewInner = forwardRef<RicohPreviewHandle, RicohPreviewProps>(
  ({ isConnected }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [hasFrame, setHasFrame] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const stopStream = useCallback(() => {
      webViewRef.current?.injectJavaScript(
        "if(controller){controller.abort();controller=null;} true;"
      );
    }, []);

    const startStream = useCallback(() => {
      setHasFrame(false);
      setError(null);
      webViewRef.current?.injectJavaScript("startStream(); true;");
    }, []);

    useImperativeHandle(ref, () => ({ stopStream, startStream }), [
      stopStream,
      startStream,
    ]);

    const handleMessage = useCallback((event: any) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === "frame") setHasFrame(true);
        if (msg.type === "error") setError(msg.msg ?? "Errore stream");
      } catch {}
    }, []);

    useEffect(() => {
      if (!isConnected) {
        stopStream();
        setHasFrame(false);
        setError(null);
      }
    }, [isConnected, stopStream]);

    if (!isConnected) {
      return (
        <View style={styles.container}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderText}>
            Connetti la camera per vedere il live preview
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        {/* WebView loads the MJPEG HTML with baseUrl = camera IP → same-origin */}
        <WebView
          ref={webViewRef}
          source={{ html: MJPEG_HTML }}
          style={styles.webview}
          onMessage={handleMessage}
          onError={(e) => setError(`Errore WebView: ${e.nativeEvent.description}`)}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="always"
          originWhitelist={["*"]}
        />

        {/* Loading overlay until first frame */}
        {!hasFrame && !error && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Avvio stream...</Text>
          </View>
        )}

        {/* Error overlay */}
        {error && (
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* LIVE badge */}
        {hasFrame && (
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
  webview: {
    flex: 1,
    backgroundColor: "#000",
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
