import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useSubscription } from "@apollo/client";
import { FOTO360_QUERY, ANNOTAZIONI_QUERY } from "../../src/graphql/queries";
import { NUOVA_ANNOTAZIONE_SUBSCRIPTION } from "../../src/graphql/subscriptions";
import Viewer360Native from "../../src/components/Viewer360Native";
import { colors, spacing, radius, typography } from "../../src/lib/theme";
import { safeDate } from "../../src/lib/dateUtils";
import { resolveMediaUrl } from "../../src/lib/mediaUrl";

interface Annotation {
  id: string;
  testo: string;
  x: number;
  y: number;
  autore: { nome: string; cognome: string };
  createdAt: string;
}

interface Foto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  timestamp: string;
}

export default function Foto360Screen() {
  const { puntoId, puntoNome } = useLocalSearchParams<{
    puntoId: string;
    puntoNome: string;
  }>();

  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnnotations, setShowAnnotations] = useState(false);

  // Fetch photos
  const { data: fotoData, loading: fotoLoading } = useQuery(FOTO360_QUERY, {
    variables: { puntoId },
  });
  const fotos: Foto[] = (fotoData?.foto360 ?? []).slice().sort(
    (a: Foto, b: Foto) => safeDate(a.timestamp).getTime() - safeDate(b.timestamp).getTime()
  );
  const currentFoto = fotos[currentIndex];

  // Fetch annotations for current photo
  const { data: annotData } = useQuery(ANNOTAZIONI_QUERY, {
    variables: { foto360Id: currentFoto?.id ?? "" },
    skip: !currentFoto,
  });

  // Real-time annotations subscription
  useSubscription(NUOVA_ANNOTAZIONE_SUBSCRIPTION, {
    variables: { foto360Id: currentFoto?.id ?? "" },
    skip: !currentFoto,
    onData: ({ client, data: subData }) => {
      const nuova = subData?.data?.nuovaAnnotazione;
      if (!nuova) return;
      const existing = client.readQuery<{ annotazioni: Annotation[] }>({
        query: ANNOTAZIONI_QUERY,
        variables: { foto360Id: currentFoto?.id },
      });
      if (existing && !existing.annotazioni.some((a) => a.id === nuova.id)) {
        client.writeQuery({
          query: ANNOTAZIONI_QUERY,
          variables: { foto360Id: currentFoto?.id },
          data: { annotazioni: [...existing.annotazioni, nuova] },
        });
      }
    },
  });

  const annotations: Annotation[] = annotData?.annotazioni ?? [];

  if (fotoLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (fotos.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nessuna foto 360° per questo punto</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: puntoNome ?? "Foto 360°" }} />

      {/* 360° Viewer fills most of the screen */}
      <View style={styles.viewerContainer}>
        <Viewer360Native
          foto={fotos}
          currentIndex={currentIndex}
          annotations={annotations}
          showAnnotations={showAnnotations}
          addingAnnotation={false}
          onSphereClick={() => {}}
        />

        {/* Top-right 💬 button — toggles annotation pins on sphere */}
        <View style={styles.topButtons}>
          <TouchableOpacity
            style={[styles.iconBtn, showAnnotations && styles.iconBtnActive]}
            onPress={() => setShowAnnotations((v) => !v)}
          >
            <Text style={[styles.iconBtnText, showAnnotations && styles.iconBtnTextActive]}>
              💬 {annotations.length}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Time travel bar */}
      {fotos.length > 1 && (
        <View style={[styles.timeTravelBar, { paddingBottom: insets.bottom + 8 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.timeTravelContent}
          >
            {fotos.map((foto, idx) => {
              const isActive = idx === currentIndex;
              return (
                <TouchableOpacity
                  key={foto.id}
                  style={[styles.thumbBtn, isActive && styles.thumbBtnActive]}
                  onPress={() => setCurrentIndex(idx)}
                  activeOpacity={0.8}
                >
                  {foto.thumbnailUrl ? (
                    <Image
                      source={{ uri: resolveMediaUrl(foto.thumbnailUrl) }}
                      style={styles.thumb}
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Text style={styles.thumbPlaceholderText}>📷</Text>
                    </View>
                  )}
                  <Text style={[styles.thumbDate, isActive && styles.thumbDateActive]} numberOfLines={1}>
                    {safeDate(foto.timestamp).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  viewerContainer: { flex: 1, position: "relative" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyText: { ...typography.body, color: colors.textMuted },

  topButtons: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
    zIndex: 30,
  },
  iconBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  iconBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  iconBtnText: { color: colors.white, ...typography.label, fontSize: 13 },
  iconBtnTextActive: { color: colors.white },

  timeTravelBar: {
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingVertical: 8,
  },
  timeTravelContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  thumbBtn: {
    alignItems: "center",
    opacity: 0.6,
    marginRight: 8,
  },
  thumbBtnActive: { opacity: 1 },
  thumb: {
    width: 52,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
  },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceHover,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: { fontSize: 16 },
  thumbDate: { ...typography.caption, color: "rgba(255,255,255,0.6)", marginTop: 3 },
  thumbDateActive: { color: colors.white, fontWeight: "700" },
});
