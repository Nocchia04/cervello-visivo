import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@apollo/client";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { CANTIERE_QUERY } from "../../src/graphql/queries";
import { PiantinaMap } from "../../src/components/PiantinaMap";
import { UploadQueueBadge } from "../../src/components/UploadQueueBadge";
import { colors, spacing, radius, typography, shadow } from "../../src/lib/theme";

interface PuntoDiScatto {
  id: string;
  nome: string;
  x: number;
  y: number;
}

interface PiantinaData {
  id: string;
  nome: string;
  livello: number;
  fileUrl: string;
  larghezza: number;
  altezza: number;
  puntiDiScatto: PuntoDiScatto[];
}

export default function PiantinaScreen() {
  const { cantiereId, cantiereNome } = useLocalSearchParams<{
    cantiereId: string;
    cantiereNome: string;
  }>();
  const insets = useSafeAreaInsets();
  const [selectedPianta, setSelectedPianta] = useState<number>(0);
  const [selectedPunto, setSelectedPunto] = useState<PuntoDiScatto | null>(null);
  const [tabAnim] = useState(() => new Animated.Value(0));
  const [tabContainerWidth, setTabContainerWidth] = useState(0);

  const { data, loading, error } = useQuery(CANTIERE_QUERY, {
    variables: { id: cantiereId },
  });

  const piantine: PiantinaData[] = data?.cantiere?.piantine ?? [];
  const currentPianta = piantine[selectedPianta];

  const handleTabPress = (idx: number) => {
    setSelectedPianta(idx);
    setSelectedPunto(null);
    Animated.timing(tabAnim, {
      toValue: idx,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const handlePuntoSelect = (punto: PuntoDiScatto) => {
    setSelectedPunto(punto);
  };

  const handleGoToScatto = () => {
    if (selectedPunto && currentPianta) {
      router.push({
        pathname: '/scatto/[puntoId]',
        params: {
          puntoId: selectedPunto.id,
          puntoNome: selectedPunto.nome,
          piantinaId: currentPianta.id,
          piantinaNome: currentPianta.nome,
        },
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={28} color={colors.danger} style={{ marginBottom: spacing.md }} />
        <Text style={styles.errorText}>{error.message}</Text>
      </View>
    );
  }

  if (piantine.length === 0) {
    return (
      <View style={styles.centered}>
        <Feather name="map" size={28} color={colors.textSubtle} style={{ marginBottom: spacing.md }} />
        <Text style={styles.emptyText}>Nessuna piantina per questo cantiere</Text>
      </View>
    );
  }

  const tabCount = piantine.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ── */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{cantiereNome}</Text>
          <Text style={styles.headerSubtitle}>
            {piantine.length} {piantine.length === 1 ? 'piano' : 'piani'}
          </Text>
        </View>

        <UploadQueueBadge />
      </View>

      {/* ── Floor tabs ── */}
      {piantine.length > 1 && (
        <View style={styles.tabsContainer}>
          {tabCount <= 4 ? (
            <View
              style={styles.tabsRow}
              onLayout={(e) => setTabContainerWidth(e.nativeEvent.layout.width)}
            >
              {piantine.map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.tabFlex}
                  onPress={() => handleTabPress(idx)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLevel, idx === selectedPianta && styles.tabLevelActive]}>
                    {p.livello}
                  </Text>
                  <Text style={[styles.tabName, idx === selectedPianta && styles.tabNameActive]}>
                    {p.nome}
                  </Text>
                </TouchableOpacity>
              ))}
              {tabContainerWidth > 0 && (
                <Animated.View
                  style={[
                    styles.tabIndicator,
                    {
                      width: tabContainerWidth / tabCount,
                      transform: [
                        {
                          translateX: tabAnim.interpolate({
                            inputRange: piantine.map((_, i) => i),
                            outputRange: piantine.map((_, i) => i * (tabContainerWidth / tabCount)),
                          }),
                        },
                      ],
                    },
                  ]}
                />
              )}
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsScrollContent}
            >
              {piantine.map((p, idx) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.tabFixed}
                  onPress={() => handleTabPress(idx)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabLevel, idx === selectedPianta && styles.tabLevelActive]}>
                    {p.livello}
                  </Text>
                  <Text style={[styles.tabName, idx === selectedPianta && styles.tabNameActive]}>
                    {p.nome}
                  </Text>
                  {idx === selectedPianta && <View style={styles.tabIndicatorFixed} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Map ── */}
      <View style={styles.mapContainer}>
        {currentPianta && (
          <PiantinaMap
            piantinaUrl={currentPianta.fileUrl}
            imageWidth={currentPianta.larghezza}
            imageHeight={currentPianta.altezza}
            punti={currentPianta.puntiDiScatto}
            selectedPuntoId={selectedPunto?.id}
            onPuntoSelect={handlePuntoSelect}
          />
        )}
      </View>

      {/* ── Bottom action bar ── */}
      {selectedPunto && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {/* Punto info */}
          <View style={styles.puntoInfo}>
            <Text style={styles.puntoLabel}>Punto selezionato</Text>
            <Text style={styles.puntoName} numberOfLines={1}>{selectedPunto.nome}</Text>
          </View>

          {/* 360° viewer */}
          <TouchableOpacity
            style={styles.btn360}
            onPress={() =>
              router.push({
                pathname: '/foto360/[puntoId]',
                params: { puntoId: selectedPunto.id, puntoNome: selectedPunto.nome },
              })
            }
            activeOpacity={0.8}
          >
            <Feather name="eye" size={16} color={colors.accent} />
            <Text style={styles.btn360Text}>360°</Text>
          </TouchableOpacity>

          {/* Primary: go to capture */}
          <TouchableOpacity
            style={styles.btnScatto}
            onPress={handleGoToScatto}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={16} color={colors.white} />
            <Text style={styles.btnScattoText}>Scatto</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // ── Header ──
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 1,
  },

  // ── Floor tabs ──
  tabsContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabsRow: {
    flexDirection: "row",
    position: "relative",
  },
  tabFlex: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  tabFixed: {
    width: 100,
    alignItems: "center",
    paddingVertical: spacing.md,
    position: "relative",
  },
  tabsScrollContent: {
    paddingHorizontal: spacing.sm,
  },
  tabLevel: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textMuted,
  },
  tabLevelActive: {
    color: colors.text,
  },
  tabName: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  tabNameActive: {
    color: colors.text,
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  tabIndicatorFixed: {
    position: "absolute",
    bottom: 0,
    left: spacing.md,
    right: spacing.md,
    height: 2,
    backgroundColor: colors.accent,
  },

  // ── Map ──
  mapContainer: {
    flex: 1,
    margin: spacing.md,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surface,
    ...shadow.sm,
  },

  // ── Bottom bar ──
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.lg,
  },
  puntoInfo: {
    flex: 1,
  },
  puntoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: 2,
  },
  puntoName: {
    ...typography.h4,
    color: colors.text,
  },
  btn360: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  btn360Text: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.accent,
  },
  btnScatto: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  btnScattoText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.white,
  },

  // ── States ──
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textSubtle,
    textAlign: "center",
  },
});
