import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useMutation } from "@apollo/client";
import { router } from "expo-router";
import { LOGIN_MUTATION } from "../src/graphql/mutations";
import { setAuthToken, setUserData } from "../src/lib/storage";
import { colors, spacing, radius, typography } from "../src/lib/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [login, { loading }] = useMutation(LOGIN_MUTATION);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMsg("Inserisci email e password");
      return;
    }
    setErrorMsg(null);
    try {
      const { data } = await login({ variables: { email: email.trim(), password } });
      if (data?.login) {
        await setAuthToken(data.login.token);
        await setUserData(data.login.user);
        router.replace('/cantieri');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Credenziali non valide");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>

        {/* ── Brand block ── */}
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <View style={styles.logoInner} />
          </View>
          <Text style={styles.appName}>Cervello Visivo</Text>
          <Text style={styles.tagline}>NRG Gold — Documentazione cantiere</Text>
        </View>

        {/* ── Form ── */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => { setEmail(t); setErrorMsg(null); }}
              placeholder="email@esempio.com"
              placeholderTextColor={colors.textSubtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => { setPassword(t); setErrorMsg(null); }}
              placeholder="La tua password"
              placeholderTextColor={colors.textSubtle}
              secureTextEntry
            />
          </View>

          {errorMsg && (
            <Text style={styles.errorText}>{errorMsg}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>Accedi</Text>
            )}
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
  },

  // Brand
  brand: {
    alignItems: "flex-start",
    marginBottom: 48,
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  logoInner: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.white,
    opacity: 0.85,
  },
  appName: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -1,
    marginBottom: spacing.xs,
  },
  tagline: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },

  // Form
  form: {
    gap: spacing.xl,
  },
  inputGroup: {
    gap: spacing.sm,
  },
  inputLabel: {
    ...typography.label,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    ...typography.body,
    color: colors.text,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    marginTop: -spacing.sm,
  },
});
