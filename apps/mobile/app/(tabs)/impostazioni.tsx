import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  getUserData, removeAuthToken, removeUserData,
  getCameraSerialAndPassword, setCameraSerial,
  getCameraModel,
} from '../../src/lib/storage';
import { isLocationServicesEnabled } from '../../src/services/ricoh/ThetaWifi';
import { thetaSession, getModelLabel, ThetaModel } from '../../src/services/theta/ThetaSession';
import { WlanFrequencyEnum } from 'theta-client-react-native';
import { TutorialVideoModal } from '../../src/components/TutorialVideoModal';
import { DebugLogOverlay } from '../../src/components/DebugLogOverlay';
import { colors, spacing, radius, typography, shadow } from '../../src/lib/theme';

interface UserData {
  nome?: string;
  cognome?: string;
  email?: string;
  role?: string;
}

type SetupStep =
  | 'idle'
  | 'wifi_connecting'
  | 'initializing'
  | 'done'
  | 'error';

export default function ImpostazioniScreen() {
  const [user, setUser] = useState<UserData | null>(null);
  const [tutorialVisible, setTutorialVisible] = useState(false);

  // WiFi credentials
  const [serial, setSerial] = useState('');
  const [camPassword, setCamPassword] = useState('');
  const [credModalVisible, setCredModalVisible] = useState(false);
  const [editSerial, setEditSerial] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Camera setup state (verifica via SDK: connetti + initialize + rileva modello)
  const [cameraModel, setCameraModelState] = useState<string | null>(null);
  const [setupStep, setSetupStep] = useState<SetupStep>('idle');
  const [setupStatusMsg, setSetupStatusMsg] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);

  const setupDone = cameraModel !== null;

  const isAndroid10 = Platform.OS === 'android' && (Platform.Version as number) >= 29;

  useEffect(() => {
    getUserData<UserData>().then(setUser);
    getCameraSerialAndPassword().then(({ serial: s, password: p }) => {
      setSerial(s ?? '');
      setCamPassword(p ?? '');
    });
    getCameraModel().then(setCameraModelState).catch(() => {});
  }, []);

  // ── WiFi credentials ──────────────────────────────────────────────────────

  const openCredModal = useCallback(() => {
    setEditSerial(serial);
    setEditPassword(camPassword);
    setShowPassword(false);
    setCredModalVisible(true);
  }, [serial, camPassword]);

  const handleSaveCredentials = useCallback(async () => {
    const s = editSerial.trim().toUpperCase();
    await setCameraSerial(s, editPassword);
    setSerial(s);
    setCamPassword(editPassword);
    setCredModalVisible(false);
  }, [editSerial, editPassword]);

  // ── Verifica Camera (SDK ufficiale: connetti → initialize → rileva modello) ──

  const openSetupModal = useCallback(() => {
    if (!serial) {
      Alert.alert(
        'Numero di serie mancante',
        'Inserisci prima il numero di serie della camera in "Credenziali Camera".'
      );
      return;
    }
    setSetupStep('idle');
    setSetupStatusMsg('');
    setSetupError('');
    setSetupModalVisible(true);
  }, [serial]);

  /**
   * Verifica camera con l'SDK ufficiale theta-client:
   * 1. WifiNetworkSpecifier → WiFi camera (internet resta via dati mobili)
   * 2. initialize() SDK → getThetaInfo → modello rilevato e salvato
   * 3. THETA V: abilita WiFi 5GHz (download 3-5× più veloci; soft-fail su SC2)
   * 4. Disconnetti — la connessione di lavoro avviene nella schermata scatto
   */
  const runSetup = useCallback(async () => {
    const ssid = `THETA${serial}.OSC`;

    try {
      // ── Pre-check: Posizione di sistema attiva (Android 10-12) ──
      setSetupStep('wifi_connecting');
      setSetupStatusMsg('Verifica servizi di posizione...');
      const locationOn = await isLocationServicesEnabled();
      if (!locationOn) {
        throw new Error('LOCATION_DISABLED');
      }

      // ── Step 1: connetti + inizializza SDK (rileva il modello) ──
      setSetupStatusMsg(`Connessione a ${ssid}...\n\nATTENZIONE: apparirà un dialogo Android — tocca "Connetti" per procedere.`);
      await thetaSession.ensureConnected(ssid, camPassword);

      setSetupStep('initializing');
      const model = thetaSession.getModel();
      const detectedSerial = thetaSession.getSerial();
      setSetupStatusMsg(`Rilevata ${getModelLabel(model)} (${detectedSerial ?? serial})`);

      // ── Step 2: THETA V → WiFi 5GHz (cambiando banda l'AP della camera
      // si riavvia: la risposta può non arrivare — soft-fail by design).
      // SC2/SC2_B non supportano 5GHz: l'opzione viene ignorata.
      if (model === ThetaModel.THETA_V) {
        setSetupStatusMsg('THETA V rilevata — abilito WiFi 5GHz...');
        await thetaSession.trySetOptions({ wlanFrequency: WlanFrequencyEnum.GHZ_5 });
      }

      setCameraModelState(model);

      // ── Step 3: chiudi la sessione (la verifica è un one-off; si riapre
      //    nella schermata scatto). disconnect() = unbind + WiFi off.
      await thetaSession.disconnect();
      setSetupStep('done');
    } catch (err) {
      await thetaSession.disconnect().catch(() => {});
      const raw = err instanceof Error ? err.message : 'Errore sconosciuto';
      // Messaggio user-friendly per i casi più comuni
      const msg = raw === 'LOCATION_DISABLED'
        ? 'Posizione (GPS) disattivata.\n\nAndroid richiede che la Posizione sia attiva per connettersi al WiFi della camera. Attivala in Impostazioni → Posizione e riprova.'
        : raw === 'NEARBY_WIFI_DENIED'
          ? 'Permesso "Dispositivi nelle vicinanze" negato.\n\nNecessario su Android 13+ per connettersi al WiFi della camera senza disattivare internet.\n\nVai in Impostazioni → App → Autorizzazioni → Dispositivi nelle vicinanze e consenti.'
          : raw.includes('WIFI_UNAVAILABLE') || raw.includes('Impossibile connettersi')
            ? `Impossibile connettersi a ${serial ? `THETA${serial}.OSC` : 'camera'}.\n\nVerifica:\n• Camera accesa e vicina al telefono\n• Se è apparso un dialogo Android, tocca "Connetti" entro 15s\n• Su Xiaomi/Redmi: abbassa la barra notifiche e tocca "Connetti"`
            : raw;
      setSetupError(msg);
      setSetupStep('error');
    }
  }, [serial, camPassword]);

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
    user?.role === 'ADMIN' ? 'Amministratore'
    : user?.role === 'CAPO_CANTIERE' ? 'Capo Cantiere'
    : user?.role || '';

  const isSettingUp = setupStep !== 'idle' && setupStep !== 'done' && setupStep !== 'error';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>

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
            <Text style={styles.profileName}>{user?.nome || ''} {user?.cognome || ''}</Text>
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

          {/* Credenziali WiFi */}
          <TouchableOpacity style={[styles.row, styles.rowBorder]} onPress={openCredModal} activeOpacity={0.7}>
            <View style={[styles.iconWrap, { backgroundColor: '#EEF2FF' }]}>
              <Feather name="wifi" size={16} color={colors.accent} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Credenziali Camera</Text>
              <Text style={styles.rowSub}>
                {serial
                  ? `S/N: ${serial} · WiFi: THETA${serial}.OSC`
                  : 'Non configurate — tocca per impostare'}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.borderStrong} />
          </TouchableOpacity>

          {/* Verifica camera (rileva modello via SDK) */}
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={openSetupModal}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: setupDone ? '#ECFDF5' : '#FEF3C7' }]}>
              <Feather name={setupDone ? 'check-circle' : 'settings'} size={16} color={setupDone ? colors.success : '#D97706'} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>{setupDone ? 'Camera verificata' : 'Verifica Camera'}</Text>
              <Text style={styles.rowSub}>
                {setupDone
                  ? `${getModelLabel(cameraModel)} · tocca per ri-verificare`
                  : serial
                    ? 'Tocca per verificare la connessione e rilevare il modello'
                    : 'Inserisci prima il numero di serie'}
              </Text>
            </View>
            <Feather name="chevron-right" size={14} color={colors.borderStrong} />
          </TouchableOpacity>
        </View>

        {/* Info */}
        {setupDone ? (
          <View style={styles.infoCard}>
            <Feather name="zap" size={14} color={colors.success} />
            <Text style={[styles.infoText, { color: colors.success }]}>
              {getModelLabel(cameraModel)} pronta. Lo scatto si connette
              automaticamente alla camera — internet resta attivo via dati mobili.
            </Text>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Feather name="info" size={14} color={colors.accent} />
            <Text style={styles.infoText}>
              {isAndroid10
                ? 'Inserisci le credenziali e verifica la camera: il modello viene rilevato automaticamente.'
                : 'Connettiti manualmente alla rete WiFi della Ricoh Theta per scattare.'}
            </Text>
          </View>
        )}

        {/* ── App ── */}
        <Text style={styles.sectionLabel}>Applicazione</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            onPress={() => setTutorialVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Rivedi tutorial</Text>
              <Text style={styles.rowSub}>Guarda di nuovo il video introduttivo</Text>
            </View>
            <Feather name="play-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, styles.rowBorder]}
            onPress={() => setShowDebugLog(true)}
            activeOpacity={0.7}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>Log diagnostico</Text>
              <Text style={styles.rowSub}>Dettagli tecnici di connessione e scatto</Text>
            </View>
            <Feather name="file-text" size={18} color={colors.textMuted} />
          </TouchableOpacity>
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
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={styles.rowLabelDanger}>Esci dall'account</Text>
            <Feather name="chevron-right" size={14} color={colors.danger} style={{ opacity: 0.5 }} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Setup Camera Modal ── */}
      <Modal
        visible={setupModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !isSettingUp && setSetupModalVisible(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Setup Camera</Text>
            {!isSettingUp && (
              <TouchableOpacity onPress={() => setSetupModalVisible(false)} style={styles.modalClose} activeOpacity={0.7}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>

            {/* Idle — mostra riepilogo e pulsante start */}
            {setupStep === 'idle' && (
              <>
                <View style={styles.stepCard}>
                  <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
                    Cosa succede durante la verifica:
                  </Text>
                  {[
                    { n: '1', text: `L'app si connette al WiFi della camera (${serial ? `THETA${serial}.OSC` : '...'}) mantenendo internet attivo via dati mobili` },
                    { n: '2', text: 'Rileva automaticamente il modello (THETA V, SC2, SC2 Business)' },
                    { n: '3', text: 'Applica le impostazioni ottimali per il modello (es. WiFi 5GHz su THETA V)' },
                    { n: '4', text: 'Da ora la schermata di scatto si connette automaticamente alla camera' },
                  ].map(({ n, text }) => (
                    <View key={n} style={styles.stepRow}>
                      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
                      <Text style={styles.stepText}>{text}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.infoCard, { marginHorizontal: 0 }]}>
                  <Feather name="wifi" size={14} color={colors.accent} />
                  <Text style={styles.infoText}>
                    Assicurati che la camera THETA sia accesa e vicina prima di procedere.
                  </Text>
                </View>

                <View style={styles.credPreview}>
                  <Text style={styles.credPreviewLabel}>Camera</Text>
                  <Text style={styles.credPreviewValue}>THETA{serial}.OSC</Text>
                </View>

                <TouchableOpacity style={styles.saveBtn} onPress={runSetup} activeOpacity={0.85}>
                  <Feather name="zap" size={16} color={colors.white} />
                  <Text style={styles.saveBtnText}>Avvia Verifica</Text>
                </TouchableOpacity>
              </>
            )}

            {/* In progress */}
            {isSettingUp && (
              <View style={[styles.stepCard, { alignItems: 'center', gap: spacing.xl }]}>
                <ActivityIndicator size="large" color={colors.accent} />
                <View style={{ alignItems: 'center', gap: spacing.sm }}>
                  <Text style={[typography.h4, { color: colors.text, textAlign: 'center' }]}>
                    {setupStep === 'wifi_connecting' && 'Connessione camera...'}
                    {setupStep === 'initializing' && 'Configurazione modello...'}
                  </Text>
                  {!!setupStatusMsg && (
                    <Text style={[styles.rowSub, { textAlign: 'center' }]}>{setupStatusMsg}</Text>
                  )}
                  {setupStep === 'wifi_connecting' && (
                    <View style={[styles.infoCard, { marginHorizontal: 0, backgroundColor: '#FEF3C7' }]}>
                      <Feather name="bell" size={13} color="#D97706" />
                      <Text style={[styles.infoText, { color: '#92400E' }]}>
                        Cerca il dialogo Android{' '}
                        <Text style={{ fontWeight: '700' }}>"Connetti a THETA{serial}.OSC?"</Text>
                        {'\n'}Su Xiaomi/Redmi abbassa la barra notifiche. Tocca{' '}
                        <Text style={{ fontWeight: '700' }}>"Connetti"</Text>.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Step indicator */}
                <View style={styles.stepIndicator}>
                  {(['wifi_connecting', 'initializing'] as SetupStep[]).map((s, i) => (
                    <View
                      key={s}
                      style={[
                        styles.stepDot,
                        setupStep === s && styles.stepDotActive,
                        (['wifi_connecting', 'initializing'] as SetupStep[]).indexOf(setupStep) > i && styles.stepDotDone,
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Done */}
            {setupStep === 'done' && (
              <View style={[styles.stepCard, { alignItems: 'center', gap: spacing.lg }]}>
                <Feather name="check-circle" size={48} color={colors.success} />
                <Text style={[typography.h3, { color: colors.success, textAlign: 'center' }]}>
                  Camera verificata!
                </Text>
                <Text style={[styles.rowSub, { textAlign: 'center' }]}>
                  Modello: <Text style={{ fontWeight: '700', color: colors.text }}>{getModelLabel(cameraModel)}</Text>
                  {'\n\n'}La schermata di scatto si connetterà automaticamente alla camera.
                </Text>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => setSetupModalVisible(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveBtnText}>Chiudi</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {setupStep === 'error' && (
              <View style={[styles.stepCard, { gap: spacing.lg }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Feather name="alert-circle" size={22} color={colors.danger} />
                  <Text style={[typography.h4, { color: colors.danger }]}>Setup fallito</Text>
                </View>
                <Text style={styles.rowSub}>{setupError}</Text>

                {/* Bottone apri impostazioni — utile per abilitare Location o permessi */}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: colors.border }]}
                  onPress={() => Linking.openSettings()}
                  activeOpacity={0.85}
                >
                  <Feather name="settings" size={16} color={colors.text} />
                  <Text style={[styles.saveBtnText, { color: colors.text }]}>Apri Impostazioni telefono</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.danger }]}
                  onPress={() => setSetupStep('idle')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveBtnText}>Riprova</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Credentials Modal ── */}
      <Modal
        visible={credModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCredModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Credenziali Camera</Text>
              <TouchableOpacity onPress={() => setCredModalVisible(false)} style={styles.modalClose} activeOpacity={0.7}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <View style={styles.stepCard}>
                <View style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                  <Text style={styles.stepText}>
                    Trova il <Text style={styles.stepBold}>numero di serie</Text> sull'etichetta sotto la camera{'\n'}
                    <Text style={styles.stepBold}>es. YP10106083</Text>
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                  <Text style={styles.stepText}>
                    La password WiFi è tipicamente il numero seriale (solo cifre) o quella stampata sull'etichetta
                  </Text>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Numero di serie camera</Text>
                <TextInput
                  style={styles.input}
                  value={editSerial}
                  onChangeText={setEditSerial}
                  placeholder="es. YP10106083"
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                {editSerial.trim().length > 0 && (
                  <Text style={styles.derivedSsid}>WiFi: THETA{editSerial.trim().toUpperCase()}.OSC</Text>
                )}
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Password WiFi camera</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={editPassword}
                    onChangeText={setEditPassword}
                    placeholder="Password WiFi della camera"
                    placeholderTextColor={colors.textSubtle}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword((v) => !v)} activeOpacity={0.7}>
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCredentials} activeOpacity={0.85}>
                <Feather name="save" size={16} color={colors.white} />
                <Text style={styles.saveBtnText}>Salva</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      <TutorialVideoModal
        visible={tutorialVisible}
        onClose={() => setTutorialVisible(false)}
      />

      <DebugLogOverlay visible={showDebugLog} onClose={() => setShowDebugLog(false)} />
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
  headerTitle: { fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -1 },

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
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.white },
  profileInfo: { flex: 1 },
  profileName: { ...typography.h4, color: colors.text, marginBottom: 2 },
  profileEmail: { ...typography.bodySmall, color: colors.textMuted },
  roleBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full, flexShrink: 0,
  },
  roleText: { ...typography.caption, color: colors.accent, fontWeight: '700' },

  sectionLabel: {
    ...typography.label, color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl, paddingBottom: spacing.sm,
  },

  card: {
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.sm,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLast: { borderBottomWidth: 0 },
  rowMain: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.text },
  rowSub: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowLabelDanger: { flex: 1, ...typography.body, color: colors.danger, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 0 },
  rowValue: { ...typography.bodySmall, color: colors.textMuted },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  iconWrap: {
    width: 32, height: 32, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  infoCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg, padding: spacing.lg,
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
  },
  infoText: { flex: 1, ...typography.caption, color: colors.accent, lineHeight: 18 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: { ...typography.h3, color: colors.text },
  modalClose: { padding: spacing.xs },
  modalScroll: { flex: 1 },
  modalContent: { padding: spacing.xl, gap: spacing.xl, paddingBottom: 60 },

  // Credential preview
  credPreview: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  credPreviewLabel: { ...typography.caption, color: colors.textMuted },
  credPreviewValue: { ...typography.h4, color: colors.text },

  // Steps
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg, ...shadow.sm,
  },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: colors.white },
  stepText: { flex: 1, ...typography.bodySmall, color: colors.textMuted, lineHeight: 20 },
  stepBold: { fontWeight: '700', color: colors.text },

  // Step indicator dots
  stepIndicator: { flexDirection: 'row', gap: spacing.sm },
  stepDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border,
  },
  stepDotActive: { backgroundColor: colors.accent, width: 24 },
  stepDotDone: { backgroundColor: colors.success },

  // Form
  formGroup: { gap: spacing.sm },
  formLabel: { ...typography.label, color: colors.textMuted },
  derivedSsid: { ...typography.caption, color: colors.accent, marginTop: 2 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    ...typography.body, color: colors.text, ...shadow.sm,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyeBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, ...shadow.sm,
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, backgroundColor: colors.accent,
    borderRadius: radius.lg, paddingVertical: spacing.lg,
  },
  saveBtnText: { ...typography.h4, color: colors.white },
});
