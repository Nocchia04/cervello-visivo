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
  getThetaBleCredentials, setThetaBleCredentials, clearThetaBleCredentials,
} from '../../src/lib/storage';
import { connectToCamera, disconnectFromCamera, cameraFetch, isLocationServicesEnabled } from '../../src/services/ricoh/ThetaWifi';
import { scanAndConnect, disconnectBle } from '../../src/modules/theta/ble/ThetaBleService';
import { colors, spacing, radius, typography, shadow } from '../../src/lib/theme';

interface UserData {
  nome?: string;
  cognome?: string;
  email?: string;
  role?: string;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type SetupStep =
  | 'idle'
  | 'wifi_connecting'
  | 'registering_ble'
  | 'ble_connecting'
  | 'done'
  | 'error';

export default function ImpostazioniScreen() {
  const [user, setUser] = useState<UserData | null>(null);

  // WiFi credentials
  const [serial, setSerial] = useState('');
  const [camPassword, setCamPassword] = useState('');
  const [credModalVisible, setCredModalVisible] = useState(false);
  const [editSerial, setEditSerial] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // BLE setup state
  const [bleDeviceName, setBleDeviceName] = useState<string | null>(null);
  const [bleSetupDone, setBleSetupDone] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>('idle');
  const [setupStatusMsg, setSetupStatusMsg] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupModalVisible, setSetupModalVisible] = useState(false);

  const isAndroid10 = Platform.OS === 'android' && (Platform.Version as number) >= 29;
  const isAndroid13 = Platform.OS === 'android' && (Platform.Version as number) >= 33;

  useEffect(() => {
    getUserData<UserData>().then(setUser);
    getCameraSerialAndPassword().then(({ serial: s, password: p }) => {
      setSerial(s ?? '');
      setCamPassword(p ?? '');
    });
    getThetaBleCredentials().then(({ deviceName, setupComplete }) => {
      setBleDeviceName(deviceName);
      setBleSetupDone(setupComplete);
    });
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

  // ── Camera Setup (WiFi → BLE register → BLE verify) ──────────────────────

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
   * Setup completo:
   * 1. WifiNetworkSpecifier → connette al WiFi camera (internet rimane via dati)
   * 2. HTTP POST camera._setBluetoothDevice (via network.openConnection)
   * 3. HTTP POST camera.setOptions { _bluetoothPower: "ON" }
   * 4. BLE scan + connect + auth (verifica che BLE funzioni)
   * 5. Salva bleUuid + deviceName
   * 6. Disconnetti BLE e WiFi
   */
  const runSetup = useCallback(async () => {
    const ssid = `THETA${serial}.OSC`;
    const password = camPassword;
    const CAMERA_URL = 'http://192.168.1.1';

    try {
      // ── Pre-check: Posizione di sistema attiva ──
      setSetupStep('wifi_connecting');
      setSetupStatusMsg('Verifica servizi di posizione...');
      const locationOn = await isLocationServicesEnabled();
      if (!locationOn) {
        throw new Error(
          'LOCATION_DISABLED'
        );
      }

      // ── Step 1: WiFi ──
      setSetupStatusMsg(`Connessione WiFi a ${ssid}...\n\nATTENZIONE: apparirà un dialogo Android — tocca "Connetti" per procedere.`);
      await connectToCamera(ssid, password);
      setSetupStatusMsg('WiFi connesso. Registro dispositivo BLE...');

      // ── Step 2: Registra BLE UUID via HTTP (usa rete camera, non fetch normale) ──
      setSetupStep('registering_ble');
      const bleUuid = generateUUID();

      const setDeviceRes = await cameraFetch(
        `${CAMERA_URL}/osc/commands/execute`,
        'POST',
        JSON.stringify({ name: 'camera._setBluetoothDevice', parameters: { uuid: bleUuid } })
      );
      if (setDeviceRes.status !== 200) throw new Error(`HTTP ${setDeviceRes.status} durante registrazione BLE`);
      const setDeviceData = JSON.parse(setDeviceRes.body);
      if (setDeviceData.state === 'error') {
        throw new Error(`Errore camera: ${setDeviceData.error?.message ?? 'registrazione BLE fallita'}`);
      }
      const deviceName: string = setDeviceData.results?.deviceName;
      if (!deviceName) throw new Error('deviceName non ricevuto dalla camera');
      setSetupStatusMsg(`Device BLE: ${deviceName}. Abilito Bluetooth...`);

      // ── Step 3a: Abilita BT sulla camera ──
      const btRes = await cameraFetch(
        `${CAMERA_URL}/osc/commands/execute`,
        'POST',
        JSON.stringify({ name: 'camera.setOptions', parameters: { options: { _bluetoothPower: 'ON' } } })
      );
      if (btRes.status !== 200) throw new Error(`HTTP ${btRes.status} abilitazione BT`);
      const btData = JSON.parse(btRes.body);
      if (btData.state === 'error') {
        throw new Error(`Errore camera: ${btData.error?.message ?? 'abilitazione BT fallita'}`);
      }

      // ── Step 3b: Imposta _bluetoothRole (necessario per THETA V/Z1/X) ──
      // La SC2 ignora questa opzione (non la supporta) ma non fallisce.
      // Senza questo la THETA V resta in modalità Central e non accetta writes BLE.
      setSetupStatusMsg('Configurazione modalità Bluetooth...');
      try {
        const roleRes = await cameraFetch(
          `${CAMERA_URL}/osc/commands/execute`,
          'POST',
          JSON.stringify({ name: 'camera.setOptions', parameters: { options: { _bluetoothRole: 'Central_Peripheral' } } })
        );
        // Se il camera non supporta l'opzione, logga ma non fallire
        if (roleRes.status !== 200) {
          console.log('_bluetoothRole non supportato (SC2?):', roleRes.status);
        } else {
          const roleData = JSON.parse(roleRes.body);
          if (roleData.state === 'error') {
            console.log('_bluetoothRole error (ignorato):', roleData.error?.message);
          }
        }
      } catch (e) {
        console.log('_bluetoothRole eccezione (ignorata):', e);
      }

      // ── Step 4: Disconnetti WiFi ──
      await disconnectFromCamera();
      setSetupStatusMsg('WiFi disconnesso. Cerco la camera via Bluetooth...');

      // ── Step 5: Verifica BLE (scan + connect + auth) ──
      setSetupStep('ble_connecting');
      // Attendi che il BT della camera si attivi dopo il comando setOptions.
      // La SC2 impiega ~5s. Mostriamo un countdown per dare feedback visivo.
      for (let remaining = 8; remaining > 0; remaining--) {
        setSetupStatusMsg(`Attivazione Bluetooth camera... ${remaining}s`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setSetupStatusMsg('Ricerca camera via Bluetooth...');
      const peripheralId = await scanAndConnect(deviceName, bleUuid);
      setSetupStatusMsg('BLE verificato!');

      // ── Step 6: Salva ──
      await setThetaBleCredentials(bleUuid, deviceName, peripheralId);
      setBleDeviceName(deviceName);
      setBleSetupDone(true);
      setSetupStep('done');
    } catch (err) {
      // Cleanup
      try { await disconnectBle(); } catch {}
      try { await disconnectFromCamera(); } catch {}
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

  const handleResetBle = useCallback(() => {
    Alert.alert(
      'Reset configurazione camera',
      'Rimuovi la configurazione BLE? Dovrai ripetere il setup.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await clearThetaBleCredentials();
            setBleDeviceName(null);
            setBleSetupDone(false);
          },
        },
      ]
    );
  }, []);

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

          {/* Setup/stato BLE */}
          <TouchableOpacity
            style={[styles.row, styles.rowLast]}
            onPress={bleSetupDone ? handleResetBle : openSetupModal}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, { backgroundColor: bleSetupDone ? '#ECFDF5' : '#FEF3C7' }]}>
              <Feather name={bleSetupDone ? 'check-circle' : 'settings'} size={16} color={bleSetupDone ? colors.success : '#D97706'} />
            </View>
            <View style={styles.rowMain}>
              <Text style={styles.rowLabel}>{bleSetupDone ? 'Camera Configurata' : 'Configura Camera'}</Text>
              <Text style={styles.rowSub}>
                {bleSetupDone
                  ? `BLE attivo · Device: ${bleDeviceName}`
                  : serial
                    ? 'Tocca per completare il setup BLE'
                    : 'Inserisci prima il numero di serie'}
              </Text>
            </View>
            {bleSetupDone ? (
              <View style={styles.rowRight}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.rowValue, { color: colors.textSubtle }]}>Reset</Text>
              </View>
            ) : (
              <Feather name="chevron-right" size={14} color={colors.borderStrong} />
            )}
          </TouchableOpacity>
        </View>

        {/* Info */}
        {bleSetupDone ? (
          <View style={styles.infoCard}>
            <Feather name="zap" size={14} color={colors.success} />
            <Text style={[styles.infoText, { color: colors.success }]}>
              Scatto via Bluetooth — nessun WiFi necessario per scattare.
              Internet rimane sempre attivo durante l'utilizzo.
            </Text>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Feather name="info" size={14} color={colors.accent} />
            <Text style={styles.infoText}>
              {isAndroid10
                ? 'Completa il setup per scattare via Bluetooth mantenendo internet attivo.'
                : 'Connettiti manualmente alla rete WiFi della Ricoh Theta per scattare.'}
            </Text>
          </View>
        )}

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
                    Cosa succede durante il setup:
                  </Text>
                  {[
                    { n: '1', text: `L'app si connette al WiFi della camera (${serial ? `THETA${serial}.OSC` : '...'}) mantenendo internet attivo via dati mobili` },
                    { n: '2', text: 'Registra questo telefono come dispositivo Bluetooth della camera' },
                    { n: '3', text: 'Attiva il Bluetooth sulla camera' },
                    { n: '4', text: 'Verifica la connessione BLE (Bluetooth)' },
                    { n: '5', text: 'Da ora puoi scattare via Bluetooth — nessun WiFi necessario!' },
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
                  <Text style={styles.saveBtnText}>Avvia Setup</Text>
                </TouchableOpacity>
              </>
            )}

            {/* In progress */}
            {isSettingUp && (
              <View style={[styles.stepCard, { alignItems: 'center', gap: spacing.xl }]}>
                <ActivityIndicator size="large" color={colors.accent} />
                <View style={{ alignItems: 'center', gap: spacing.sm }}>
                  <Text style={[typography.h4, { color: colors.text, textAlign: 'center' }]}>
                    {setupStep === 'wifi_connecting' && 'Connessione WiFi...'}
                    {setupStep === 'registering_ble' && 'Registrazione BLE...'}
                    {setupStep === 'ble_connecting' && 'Verifica Bluetooth...'}
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
                  {(['wifi_connecting', 'registering_ble', 'ble_connecting'] as SetupStep[]).map((s, i) => (
                    <View
                      key={s}
                      style={[
                        styles.stepDot,
                        setupStep === s && styles.stepDotActive,
                        (['wifi_connecting', 'registering_ble', 'ble_connecting'] as SetupStep[]).indexOf(setupStep) > i && styles.stepDotDone,
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
                  Camera configurata!
                </Text>
                <Text style={[styles.rowSub, { textAlign: 'center' }]}>
                  Bluetooth attivo · Device: <Text style={{ fontWeight: '700', color: colors.text }}>{bleDeviceName}</Text>
                  {'\n\n'}Puoi ora scattare senza connettere manualmente il WiFi.
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
