import React, { useEffect } from "react";
import {
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors, spacing, radius, typography } from "../lib/theme";

// Asset bundled — caricato in build time, niente download
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tutorialAsset = require("../../assets/videos/tutorial.mp4");

interface TutorialVideoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TutorialVideoModal({ visible, onClose }: TutorialVideoModalProps) {
  const insets = useSafeAreaInsets();

  // Player istanziato una sola volta (riusato tra apri/chiudi). Quando il modal
  // si chiude mettiamo in pausa per non lasciare l'audio in background.
  const player = useVideoPlayer(tutorialAsset, (p) => {
    p.loop = false;
    p.muted = false;
  });

  // Auto-play all'apertura, pause alla chiusura.
  useEffect(() => {
    if (visible) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [visible, player]);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls
          allowsFullscreen
        />

        {/* Bottone chiudi in alto a destra, sopra i controls nativi */}
        <TouchableOpacity
          style={[styles.closeButton, { top: insets.top + spacing.sm }]}
          onPress={onClose}
          activeOpacity={0.75}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Feather name="x" size={22} color={colors.white} />
        </TouchableOpacity>

        {/* Footer skip / chiudi (più visibile e tap-friendly del solo close) */}
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + spacing.md },
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.skipButtonText}>Ho capito, inizia</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  video: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  closeButton: {
    position: "absolute",
    right: spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    zIndex: 5,
  },
  skipButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.full,
  },
  skipButtonText: {
    ...typography.label,
    color: colors.white,
    fontSize: 14,
  },
});
