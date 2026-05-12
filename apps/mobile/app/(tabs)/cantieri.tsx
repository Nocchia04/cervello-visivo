import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { CANTIERI_QUERY } from '../../src/graphql/queries';
import { UploadQueueBadge } from '../../src/components/UploadQueueBadge';
import { TutorialVideoModal } from '../../src/components/TutorialVideoModal';
import {
  getTutorialSeen,
  setTutorialSeen,
  removeAuthToken,
  removeUserData,
} from '../../src/lib/storage';
import { colors, spacing, radius, typography, shadow } from '../../src/lib/theme';

interface CantiereItem {
  id: string;
  nome: string;
  indirizzo: string;
  stato: string;
  piantine: { id: string; nome: string; livello: number }[];
}

type Filter = 'tutti' | 'attivi' | 'archiviati';

const CARD_ACCENTS = ['#2DD4BF', '#818CF8', '#F59E0B', '#F472B6', '#34D399'];

function BuildingFacade() {
  return (
    <View style={facadeStyles.wrap} pointerEvents="none">
      {Array.from({ length: 4 }).map((_, row) => (
        <View key={row} style={facadeStyles.row}>
          {Array.from({ length: 8 }).map((_, col) => (
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
    right: 0,
    bottom: 0,
    gap: 4,
    padding: spacing.md,
    opacity: 0.09,
  },
  row: { flexDirection: 'row', gap: 4 },
  cell: { width: 12, height: 18, backgroundColor: '#FFFFFF', borderRadius: 2 },
});

export default function CantieriScreen() {
  const [filter, setFilter] = useState<Filter>('tutti');
  const [showTutorial, setShowTutorial] = useState(false);
  const { data, loading, error, refetch } = useQuery(CANTIERI_QUERY);
  const allCantieri: CantiereItem[] = data?.cantieri ?? [];

  // Auto-apre il tutorial al primo accesso. Flag persistito in AsyncStorage
  // così non si ripropone ad ogni apertura. Riapribile da impostazioni.
  useEffect(() => {
    let cancelled = false;
    getTutorialSeen().then((seen) => {
      if (!cancelled && !seen) setShowTutorial(true);
    });
    return () => { cancelled = true; };
  }, []);

  const handleTutorialClose = () => {
    setShowTutorial(false);
    // Best-effort: ignora errori storage (es. permessi)
    setTutorialSeen().catch(() => {});
  };

  const cantieri = allCantieri.filter(c => {
    if (filter === 'attivi') return c.stato === 'ATTIVO';
    if (filter === 'archiviati') return c.stato === 'ARCHIVIATO';
    return true;
  });

  const handleLogout = () => {
    Alert.alert('Esci', 'Vuoi davvero uscire?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Esci',
        style: 'destructive',
        onPress: async () => {
          await removeAuthToken();
          await removeUserData();
          router.replace('/login');
        },
      },
    ]);
  };

  const renderCantiere = ({ item, index }: { item: CantiereItem; index: number }) => {
    const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
    const isAttivo = item.stato === 'ATTIVO';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: '/piantina/[cantiereId]',
            params: { cantiereId: item.id, cantiereNome: item.nome },
          })
        }
        activeOpacity={0.88}
      >
        <BuildingFacade />

        {/* Top accent bar */}
        <View style={[styles.cardAccent, { backgroundColor: accent }]} />

        <View style={styles.cardInner}>
          {/* Header row */}
          <View style={styles.cardTopRow}>
            <View style={[styles.cardBadge, isAttivo ? styles.badgeAttivo : styles.badgeArchiviato]}>
              <View style={[styles.badgeDot, { backgroundColor: isAttivo ? '#2DD4BF' : colors.borderStrong }]} />
              <Text style={[styles.badgeText, { color: isAttivo ? '#0D9488' : colors.textMuted }]}>
                {item.stato}
              </Text>
            </View>
            <View style={[styles.cardArrow, { backgroundColor: accent + '22' }]}>
              <Feather name="arrow-up-right" size={13} color={accent} />
            </View>
          </View>

          {/* Name */}
          <Text style={styles.cardName} numberOfLines={2}>{item.nome}</Text>

          {/* Footer */}
          <View style={styles.cardFooter}>
            <View style={styles.cardLocation}>
              <Feather name="map-pin" size={10} color="rgba(255,255,255,0.4)" />
              <Text style={styles.cardAddress} numberOfLines={1}> {item.indirizzo}</Text>
            </View>
            <View style={styles.cardFloorsBadge}>
              <Feather name="layers" size={10} color="rgba(255,255,255,0.6)" />
              <Text style={styles.cardFloorsText}> {item.piantine.length}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Caricamento cantieri...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Feather name="alert-circle" size={32} color={colors.danger} style={{ marginBottom: spacing.lg }} />
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cantieri</Text>
        <View style={styles.headerRight}>
          <UploadQueueBadge />
        </View>
      </View>

      {/* Filter tabs — underline style */}
      <View style={styles.filterRow}>
        {(['tutti', 'attivi', 'archiviati'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={styles.filterTab}
            onPress={() => setFilter(f)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
            {filter === f && <View style={styles.filterUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {cantieri.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="inbox" size={32} color={colors.textSubtle} style={{ marginBottom: spacing.lg }} />
          <Text style={styles.emptyTitle}>Nessun cantiere</Text>
          <Text style={styles.emptyText}>
            {filter === 'tutti' ? 'Non hai cantieri al momento' : `Nessun cantiere ${filter}`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={cantieri}
          renderItem={renderCantiere}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.accent} />
          }
        />
      )}

      <TutorialVideoModal visible={showTutorial} onClose={handleTutorialClose} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },

  // Filter tabs — underline style, consistent with piantina tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterTab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    position: 'relative',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.text,
  },
  filterUnderline: {
    position: 'absolute',
    bottom: 0,
    left: spacing.lg,
    right: spacing.lg,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 108,
    gap: spacing.md,
  },

  // Card
  card: {
    backgroundColor: '#111827',
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.md,
  },
  cardAccent: { height: 3 },
  cardInner: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeAttivo: { backgroundColor: 'rgba(45,212,191,0.15)' },
  badgeArchiviato: { backgroundColor: 'rgba(255,255,255,0.08)' },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  cardArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    lineHeight: 26,
    flex: 1,
    marginBottom: spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardAddress: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    flex: 1,
  },
  cardFloorsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.full,
  },
  cardFloorsText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },

  // States
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  loadingText: { marginTop: spacing.md, ...typography.body, color: colors.textMuted },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center', marginBottom: spacing.lg },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  retryText: { color: colors.white, ...typography.h4 },
  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  emptyText: { ...typography.body, color: colors.textSubtle, textAlign: 'center' },
});
