import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getUserData, removeAuthToken, removeUserData } from '../../src/lib/storage';
import { ricohClient } from '../../src/services/ricoh/RicohClient';
import { colors, spacing, radius, typography, shadow } from '../../src/lib/theme';

interface UserData {
  nome?: string;
  cognome?: string;
  email?: string;
  role?: string;
}

export default function ImpostazioniScreen() {
  const [user, setUser] = useState<UserData | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'connected' | 'disconnected'>('idle');

  useEffect(() => {
    getUserData<UserData>().then(setUser);
  }, []);

  const handleCheckConnection = async () => {
    setCameraStatus('checking');
    try {
      const ok = await ricohClient.checkConnection();
      setCameraStatus(ok ? 'connected' : 'disconnected');
    } catch {
      setCameraStatus('disconnected');
    }
  };

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

  const initials = user
    ? `${(user.nome || '')[0] || ''}${(user.cognome || '')[0] || ''}`.toUpperCase()
    : '?';

  const roleLabel =
    user?.role === 'ADMIN'
      ? 'Amministratore'
      : user?.role === 'CAPO_CANTIERE'
      ? 'Capo Cantiere'
      : user?.role || '';

  const cameraStatusColor =
    cameraStatus === 'connected'
      ? colors.success
      : cameraStatus === 'disconnected'
      ? colors.danger
      : colors.textMuted;

  const cameraStatusLabel =
    cameraStatus === 'connected'
      ? 'Connessa'
      : cameraStatus === 'disconnected'
      ? 'Non raggiungibile'
      : cameraStatus === 'checking'
      ? 'Verifica in corso...'
      : 'Testa connessione';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Impostazioni</Text>
        </View>

        {/* ── Profile card ── */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.nome || ''} {user?.cognome || ''}
            </Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          </View>
          {roleLabel ? (
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{roleLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Fotocamera ── */}
        <Text style={styles.sectionLabel}>Fotocamera</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={handleCheckConnection}
            activeOpacity={0.7}
            disabled={cameraStatus === 'checking'}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Ricoh Theta SC2</Text>
              <Text style={styles.rowSub}>Connessione WiFi diretta</Text>
            </View>
            <View style={styles.rowRight}>
              {cameraStatus === 'checking' ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  {(cameraStatus === 'connected' || cameraStatus === 'disconnected') && (
                    <View style={[styles.statusDot, { backgroundColor: cameraStatusColor }]} />
                  )}
                  <Text style={[styles.rowValue, { color: cameraStatusColor }]}>
                    {cameraStatusLabel}
                  </Text>
                </>
              )}
              <Feather name="chevron-right" size={14} color={colors.borderStrong} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── App ── */}
        <Text style={styles.sectionLabel}>Applicazione</Text>
        <View style={styles.card}>
          <View style={[styles.row, styles.rowLast]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Versione</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>1.0.0</Text>
            </View>
          </View>
        </View>

        {/* ── Sessione ── */}
        <Text style={styles.sectionLabel}>Sessione</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Text style={styles.rowLabelDanger}>Esci dall'account</Text>
            <Feather name="chevron-right" size={14} color={colors.danger} style={{ opacity: 0.5 }} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { paddingBottom: 108 },

  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },

  // Profile card
  profileCard: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    ...shadow.sm,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.white },
  profileInfo: { flex: 1 },
  profileName: { ...typography.h4, color: colors.text, marginBottom: 2 },
  profileEmail: { ...typography.bodySmall, color: colors.textMuted },
  roleBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    flexShrink: 0,
  },
  roleText: { ...typography.caption, color: colors.accent, fontWeight: '700' },

  // Section label — plain text, no uppercase tracking overload
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
  },

  // Card container
  card: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.sm,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.text },
  rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowLabelDanger: { flex: 1, ...typography.body, color: colors.danger, fontWeight: '600' },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  rowValue: { ...typography.bodySmall, color: colors.textMuted },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
