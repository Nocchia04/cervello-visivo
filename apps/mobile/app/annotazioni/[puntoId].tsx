import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation, useSubscription } from "@apollo/client";
import { useLocalSearchParams } from "expo-router";
import { Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FOTO360_QUERY, ANNOTAZIONI_QUERY } from "../../src/graphql/queries";
import { CREA_ANNOTAZIONE_MUTATION } from "../../src/graphql/mutations";
import { NUOVA_ANNOTAZIONE_SUBSCRIPTION } from "../../src/graphql/subscriptions";
import { AnnotazioneItem } from "../../src/components/AnnotazioneItem";
import { safeDate } from "../../src/lib/dateUtils";
import { colors, spacing, radius, typography } from "../../src/lib/theme";

interface Annotazione {
  id: string;
  testo: string;
  x: number;
  y: number;
  autore: { id: string; nome: string; cognome: string };
  createdAt: string;
}

interface Foto360Item {
  id: string;
  url: string;
  timestamp: string;
}

export default function AnnotazioniScreen() {
  const { puntoId, puntoNome } = useLocalSearchParams<{
    puntoId: string;
    puntoNome: string;
  }>();
  const [newTesto, setNewTesto] = useState("");
  const [selectedFotoId, setSelectedFotoId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Fetch photos for this punto
  const { data: fotoData, loading: fotoLoading } = useQuery(FOTO360_QUERY, {
    variables: { puntoId },
    onCompleted: (data) => {
      // Auto-select the latest photo
      if (data?.foto360?.length > 0 && !selectedFotoId) {
        setSelectedFotoId(data.foto360[0].id);
      }
    },
  });

  const fotos: Foto360Item[] = fotoData?.foto360 ?? [];

  // Fetch annotations for selected photo
  const {
    data: annotazioniData,
    loading: annotazioniLoading,
    refetch: refetchAnnotazioni,
  } = useQuery(ANNOTAZIONI_QUERY, {
    variables: { foto360Id: selectedFotoId ?? "" },
    skip: !selectedFotoId,
  });

  const annotazioni: Annotazione[] = annotazioniData?.annotazioni ?? [];

  // Subscribe to new annotations in real-time
  useSubscription(NUOVA_ANNOTAZIONE_SUBSCRIPTION, {
    variables: { foto360Id: selectedFotoId ?? "" },
    skip: !selectedFotoId,
    onData: ({ client, data: subData }) => {
      if (subData?.data?.nuovaAnnotazione) {
        // Update cache with new annotation
        const existing = client.readQuery({
          query: ANNOTAZIONI_QUERY,
          variables: { foto360Id: selectedFotoId },
        }) as { annotazioni: Annotazione[] } | null;

        if (existing) {
          client.writeQuery({
            query: ANNOTAZIONI_QUERY,
            variables: { foto360Id: selectedFotoId },
            data: {
              annotazioni: [...existing.annotazioni, subData.data.nuovaAnnotazione],
            },
          });
        }
      }
    },
  });

  const [creaAnnotazione, { loading: creating }] = useMutation(
    CREA_ANNOTAZIONE_MUTATION
  );

  const handleSubmit = async () => {
    if (!newTesto.trim() || !selectedFotoId) return;

    try {
      await creaAnnotazione({
        variables: {
          foto360Id: selectedFotoId,
          testo: newTesto.trim(),
          x: 0,
          y: 0,
        },
      });
      setNewTesto("");
      refetchAnnotazioni();
    } catch (err) {
      Alert.alert(
        "Errore",
        err instanceof Error ? err.message : "Impossibile creare annotazione"
      );
    }
  };

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
        <Feather name="camera" size={40} color={colors.textSubtle} />
        <Text style={styles.emptyText}>
          Nessuna foto disponibile per {puntoNome}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen options={{ title: puntoNome }} />

      {/* Photo selector — underline tabs */}
      {fotos.length > 1 && (
        <View style={styles.photoSelector}>
          <FlatList
            horizontal
            data={fotos}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoSelectorContent}
            renderItem={({ item }) => {
              const isActive = item.id === selectedFotoId;
              return (
                <TouchableOpacity
                  style={styles.photoTab}
                  onPress={() => setSelectedFotoId(item.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.photoTabText,
                      isActive && styles.photoTabTextActive,
                    ]}
                  >
                    {safeDate(item.timestamp).toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                  {isActive && <View style={styles.photoTabUnderline} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Inline header */}
      <View style={styles.inlineHeader}>
        <Text style={styles.inlineHeaderTitle}>{puntoNome}</Text>
        <Text style={styles.inlineHeaderCount}>
          {annotazioni.length}{" "}
          {annotazioni.length === 1 ? "annotazione" : "annotazioni"}
        </Text>
      </View>

      {/* Annotations list */}
      {annotazioniLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={annotazioni}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="message-circle" size={40} color={colors.textSubtle} />
              <Text style={[styles.emptyText, styles.emptyTextSpaced]}>
                Nessuna annotazione. Aggiungi la prima!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <AnnotazioneItem
              testo={item.testo}
              autoreNome={item.autore.nome}
              autoreCognome={item.autore.cognome}
              createdAt={item.createdAt}
            />
          )}
        />
      )}

      {/* New annotation input */}
      {selectedFotoId && (
        <View style={[styles.inputContainer, { paddingBottom: spacing.md + insets.bottom }]}>
          <TextInput
            style={styles.input}
            value={newTesto}
            onChangeText={setNewTesto}
            placeholder="Scrivi un'annotazione..."
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newTesto.trim() || creating) && styles.sendButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!newTesto.trim() || creating}
          >
            {creating ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Feather name="send" size={16} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Photo selector
  photoSelector: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  photoSelectorContent: {
    paddingHorizontal: spacing.xl,
  },
  photoTab: {
    paddingVertical: spacing.md,
    marginRight: spacing.xl,
    position: "relative",
    alignItems: "center",
  },
  photoTabText: {
    ...typography.label,
    color: colors.textMuted,
  },
  photoTabTextActive: {
    color: colors.accent,
  },
  photoTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  // Inline header
  inlineHeader: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  inlineHeaderTitle: {
    ...typography.h3,
    color: colors.text,
  },
  inlineHeaderCount: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  // List
  list: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  // Centered (loading / empty fallback)
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  // Empty state
  emptyContainer: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyText: {
    ...typography.body,
    color: colors.textSubtle,
    textAlign: "center",
  },
  emptyTextSpaced: {
    marginTop: spacing.md,
  },
  // Input bar
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    ...typography.body,
    color: colors.text,
    maxHeight: 100,
    backgroundColor: colors.bg,
  },
  sendButton: {
    height: 44,
    width: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: colors.borderStrong,
  },
});
