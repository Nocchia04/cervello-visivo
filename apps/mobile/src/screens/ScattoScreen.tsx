import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { ricohClient } from "../services/ricoh/RicohClient";
import { uploadQueue } from "../services/upload/UploadQueue";
import { RicohPreview } from "../components/RicohPreview";
import { UploadQueueBadge } from "../components/UploadQueueBadge";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/AppNavigator";

type ScattoScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Scatto">;
  route: RouteProp<RootStackParamList, "Scatto">;
};

type CameraStatus = "disconnected" | "connecting" | "connected" | "error";

export function ScattoScreen({ navigation, route }: ScattoScreenProps) {
  const { puntoId, puntoNome } = route.params;

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("disconnected");
  const [cameraInfo, setCameraInfo] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isTakingPicture, setIsTakingPicture] = useState(false);
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null);

  const connectCamera = useCallback(async () => {
    setCameraStatus("connecting");
    try {
      const info = await ricohClient.getInfo();
      setCameraInfo(`${info.model} v${info.firmwareVersion}`);

      const state = await ricohClient.getState();
      setBatteryLevel(Math.round(state.state.batteryLevel * 100));

      setCameraStatus("connected");
    } catch (err) {
      setCameraStatus("error");
      Alert.alert(
        "Connessione fallita",
        "Assicurati di essere connesso alla rete WiFi della Ricoh Theta.\n\n" +
          (err instanceof Error ? err.message : "Errore sconosciuto")
      );
    }
  }, []);

  const takePicture = useCallback(async () => {
    if (cameraStatus !== "connected") return;

    setIsTakingPicture(true);
    try {
      // 1. Take picture via OSC API
      const fileUrl = await ricohClient.takePicture();

      // 2. Download file locally
      const localUri = await ricohClient.downloadFile(fileUrl);
      setLastPhotoUri(localUri);

      // 3. Add to upload queue
      const queueItemId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await uploadQueue.addToQueue({
        id: queueItemId,
        localUri,
        puntoDiScattoId: puntoId,
        timestamp: new Date().toISOString(),
      });

      // Update battery after shot
      try {
        const state = await ricohClient.getState();
        setBatteryLevel(Math.round(state.state.batteryLevel * 100));
      } catch {
        // Non-critical
      }

      Alert.alert("Scatto completato", "Foto salvata e aggiunta alla coda di upload.");
    } catch (err) {
      Alert.alert(
        "Errore scatto",
        err instanceof Error ? err.message : "Errore durante lo scatto"
      );
    } finally {
      setIsTakingPicture(false);
    }
  }, [cameraStatus, puntoId]);

  const viewAnnotazioni = useCallback(() => {
    if (lastPhotoUri) {
      // Navigate to annotations for the latest photo at this punto
      navigation.navigate("Annotazioni", {
        puntoId,
        puntoNome,
      });
    }
  }, [lastPhotoUri, navigation, puntoId, puntoNome]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header info */}
      <View style={styles.headerCard}>
        <Text style={styles.puntoName}>{puntoNome}</Text>
        <UploadQueueBadge />
      </View>

      {/* Camera connection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Camera Ricoh Theta</Text>

        {cameraStatus === "disconnected" && (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={connectCamera}
            activeOpacity={0.8}
          >
            <Text style={styles.connectButtonText}>Connetti Camera</Text>
          </TouchableOpacity>
        )}

        {cameraStatus === "connecting" && (
          <View style={styles.statusRow}>
            <ActivityIndicator color="#1E40AF" />
            <Text style={styles.statusText}>Connessione in corso...</Text>
          </View>
        )}

        {cameraStatus === "connected" && (
          <View style={styles.connectedInfo}>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.connectedText}>Connessa</Text>
            </View>
            {cameraInfo && (
              <Text style={styles.cameraDetail}>{cameraInfo}</Text>
            )}
            {batteryLevel !== null && (
              <Text style={styles.cameraDetail}>
                Batteria: {batteryLevel}%
              </Text>
            )}
          </View>
        )}

        {cameraStatus === "error" && (
          <View>
            <Text style={styles.errorText}>
              Connessione fallita. Verifica il WiFi.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={connectCamera}
            >
              <Text style={styles.retryText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Live Preview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Preview</Text>
        <RicohPreview isConnected={cameraStatus === "connected"} />
      </View>

      {/* Capture button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.captureButton,
            cameraStatus !== "connected" && styles.captureButtonDisabled,
          ]}
          onPress={takePicture}
          disabled={cameraStatus !== "connected" || isTakingPicture}
          activeOpacity={0.8}
        >
          {isTakingPicture ? (
            <View style={styles.capturingRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.captureButtonText}>Scatto in corso...</Text>
            </View>
          ) : (
            <Text style={styles.captureButtonText}>Scatta Foto 360°</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Last photo info */}
      {lastPhotoUri && (
        <View style={styles.section}>
          <View style={styles.lastPhotoCard}>
            <Text style={styles.lastPhotoTitle}>Ultima foto scattata</Text>
            <Text style={styles.lastPhotoUri} numberOfLines={1}>
              {lastPhotoUri}
            </Text>
            <TouchableOpacity
              style={styles.annotazioniButton}
              onPress={viewAnnotazioni}
            >
              <Text style={styles.annotazioniButtonText}>
                Vedi Annotazioni
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  content: {
    padding: 16,
  },
  headerCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  puntoName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1F2937",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  connectButton: {
    backgroundColor: "#1E40AF",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  connectButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 15,
    color: "#6B7280",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#22C55E",
  },
  connectedInfo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  connectedText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#166534",
  },
  cameraDetail: {
    fontSize: 13,
    color: "#6B7280",
    marginLeft: 18,
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: "#FEE2E2",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  retryText: {
    color: "#DC2626",
    fontWeight: "600",
  },
  captureButton: {
    backgroundColor: "#DC2626",
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  captureButtonDisabled: {
    backgroundColor: "#D1D5DB",
    elevation: 0,
    shadowOpacity: 0,
  },
  captureButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  capturingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lastPhotoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  lastPhotoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  lastPhotoUri: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  annotazioniButton: {
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 4,
  },
  annotazioniButtonText: {
    color: "#1E40AF",
    fontWeight: "600",
    fontSize: 14,
  },
});
