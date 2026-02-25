import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { CANTIERI_QUERY } from '../../src/graphql/queries';
import { colors, spacing, radius, typography, shadow } from '../../src/lib/theme';

interface CantiereItem {
  id: string;
  nome: string;
  indirizzo: string;
  stato: string;
  piantine: { id: string; nome: string; livello: number }[];
}

const CARD_ACCENTS = ['#2DD4BF', '#818CF8', '#F59E0B'];

// Building facade decoration — grid of tiny window rects
function BuildingFacade() {
  return (
    <View style={facadeStyles.wrap} pointerEvents="none">
      {Array.from({ length: 5 }).map((_, row) => (
        <View key={row} style={facadeStyles.row}>
          {Array.from({ length: 7 }).map((_, col) => (
            <View key={col} style={facadeStyles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

const facadeStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    gap: 5,
    opacity: 0.1,
  },
  row: { flexDirection: 'row', gap: 5 },
  cell: { width: 14, height: 20, backgroundColor: '#FFFFFF', borderRadius: 2 },
});

export default function HomeScreen() {
  const { data, loading } = useQuery(CANTIERI_QUERY);
  const cantieri: CantiereItem[] = data?.cantieri ?? [];
  const attivi = cantieri.filter(c => c.stato === 'ATTIVO');
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim }}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.appLabel}>CERVELLO VISIVO</Text>
              {loading ? (
                <Text style={styles.heroTitle}>— Cantieri attivi</Text>
              ) : (
                <Text style={styles.heroTitle}>{attivi.length} Cantieri attivi</Text>
              )}
            </View>
            <TouchableOpacity style={styles.notifBtn} activeOpacity={0.7}>
              <Feather name="bell" size={18} color={colors.text} />
              {attivi.length > 0 && <View style={styles.notifDot} />}
            </TouchableOpacity>
          </View>

          {/* ── Hero cards — horizontal scroll ── */}
          {loading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="rgba(255,255,255,0.7)" size="large" />
            </View>
          ) : attivi.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.heroScroll}
              contentContainerStyle={styles.heroScrollContent}
              decelerationRate="fast"
              snapToInterval={264}
              snapToAlignment="start"
            >
              {attivi.slice(0, 4).map((c, i) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.heroCard}
                  onPress={() =>
                    router.push({
                      pathname: '/piantina/[cantiereId]',
                      params: { cantiereId: c.id, cantiereNome: c.nome },
                    })
                  }
                  activeOpacity={0.88}
                >
                  <BuildingFacade />

                  {/* Top accent bar */}
                  <View style={[styles.heroCardAccent, { backgroundColor: CARD_ACCENTS[i % CARD_ACCENTS.length] }]} />

                  <View style={styles.heroCardInner}>
                    {/* Badge + arrow */}
                    <View style={styles.heroCardTopRow}>
                      <View style={[styles.heroBadge, { borderColor: CARD_ACCENTS[i % CARD_ACCENTS.length] }]}>
                        <View style={[styles.heroBadgeDot, { backgroundColor: CARD_ACCENTS[i % CARD_ACCENTS.length] }]} />
                        <Text style={styles.heroBadgeText}>ATTIVO</Text>
                      </View>
                      <View style={styles.heroArrowBtn}>
                        <Feather name="arrow-up-right" size={13} color="#111827" />
                      </View>
                    </View>

                    {/* Name */}
                    <Text style={styles.heroCardName} numberOfLines={2}>{c.nome}</Text>

                    {/* Meta */}
                    <View style={styles.heroCardMetaRow}>
                      <Feather name="map-pin" size={10} color="rgba(255,255,255,0.45)" />
                      <Text style={styles.heroCardAddress} numberOfLines={1}> {c.indirizzo}</Text>
                    </View>
                    <Text style={styles.heroCardFloors}>
                      {c.piantine.length} {c.piantine.length === 1 ? 'piano' : 'piani'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyCard}>
              <Feather name="inbox" size={28} color={colors.textSubtle} />
              <Text style={styles.emptyText}>Nessun cantiere attivo</Text>
            </View>
          )}

          {/* ── Activity feed ── */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Aggiornamenti</Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/(tabs)/cantieri' as any })}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionLink}>Vedi tutti</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.activityCard}>
            {loading ? (
              <View style={styles.activityLoading}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : cantieri.length === 0 ? (
              <View style={styles.activityLoading}>
                <Text style={styles.emptyText}>Nessun dato</Text>
              </View>
            ) : (
              cantieri.slice(0, 5).map((c, i) => {
                const isLast = i === Math.min(cantieri.length, 5) - 1;
                const isAttivo = c.stato === 'ATTIVO';
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.activityRow, isLast && styles.activityRowLast]}
                    onPress={() =>
                      router.push({
                        pathname: '/piantina/[cantiereId]',
                        params: { cantiereId: c.id, cantiereNome: c.nome },
                      })
                    }
                    activeOpacity={0.7}
                  >
                    {/* Status indicator */}
                    <View style={[styles.activityIndicator, { backgroundColor: isAttivo ? '#2DD4BF' : colors.borderStrong }]} />

                    <View style={styles.activityBody}>
                      <Text style={styles.activityName} numberOfLines={1}>{c.nome}</Text>
                      <Text style={styles.activitySub} numberOfLines={1}>
                        {c.piantine.length} {c.piantine.length === 1 ? 'piano' : 'piani'} · {c.indirizzo}
                      </Text>
                    </View>

                    <View style={[styles.activityBadge, isAttivo ? styles.badgeAttivo : styles.badgeArchiviato]}>
                      <Text style={[styles.activityBadgeText, { color: isAttivo ? '#0F766E' : colors.textMuted }]}>
                        {c.stato}
                      </Text>
                    </View>

                    <Feather name="chevron-right" size={14} color={colors.borderStrong} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_W = 252;
const CARD_H = 200;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingTop: spacing.xl, paddingBottom: 108 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
  },
  appLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textSubtle,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2DD4BF',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },

  // Hero cards
  heroScroll: { marginBottom: spacing.xxxl },
  heroScrollContent: { paddingHorizontal: spacing.xl, gap: spacing.md },
  heroCard: {
    width: CARD_W,
    height: CARD_H,
    backgroundColor: '#111827',
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  loadingCard: {
    height: CARD_H,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxxl,
    backgroundColor: '#111827',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCardAccent: {
    height: 3,
    width: '100%',
  },
  heroCardInner: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  heroCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  heroBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  heroBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 1, color: '#FFFFFF' },
  heroArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCardName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 26,
    flex: 1,
    marginVertical: spacing.sm,
  },
  heroCardMetaRow: { flexDirection: 'row', alignItems: 'center' },
  heroCardAddress: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    flex: 1,
  },
  heroCardFloors: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },

  emptyCard: {
    height: CARD_H,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { ...typography.bodySmall, color: colors.textSubtle },

  // Section
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionLink: { fontSize: 13, color: colors.accent, fontWeight: '600' },

  // Activity card
  activityCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    ...shadow.sm,
    overflow: 'hidden',
  },
  activityLoading: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  activityRowLast: { borderBottomWidth: 0 },
  activityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  activityBody: { flex: 1 },
  activityName: { ...typography.h4, color: colors.text, marginBottom: 2 },
  activitySub: { ...typography.bodySmall, color: colors.textMuted },
  activityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  badgeAttivo: { backgroundColor: '#CCFBF1' },
  badgeArchiviato: { backgroundColor: colors.surfaceHover },
  activityBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
});
