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
import { FOTO360_QUERY, ANNOTAZIONI_QUERY } from "../graphql/queries";
import { CREA_ANNOTAZIONE_MUTATION } from "../graphql/mutations";
import { NUOVA_ANNOTAZIONE_SUBSCRIPTION } from "../graphql/subscriptions";
import { AnnotazioneItem } from "../components/AnnotazioneItem";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/AppNavigator";

type AnnotazioniScreenProps = {
  route: RouteProp<RootStackParamList, "Annotazioni">;
};

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

export function AnnotazioniScreen({ route }: AnnotazioniScreenProps) {
  const { puntoId, puntoNome } = route.params;
  const [newTesto, setNewTesto] = useState("");
  const [selectedFotoId, setSelectedFotoId] = useState<string | null>(null);

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
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  if (fotos.length === 0) {
    return (
      <View style={styles.centered}>
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
      {/* Photo selector */}
      {fotos.length > 1 && (
        <View style={styles.photoSelector}>
          <FlatList
            horizontal
            data={fotos}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoSelectorContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.photoTab,
                  item.id === selectedFotoId && styles.photoTabActive,
                ]}
                onPress={() => setSelectedFotoId(item.id)}
              >
                <Text
                  style={[
                    styles.photoTabText,
                    item.id === selectedFotoId && styles.photoTabTextActive,
                  ]}
                >
                  {new Date(item.timestamp).toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Annotazioni - {puntoNome}</Text>
        <Text style={styles.headerCount}>
          {annotazioni.length}{" "}
          {annotazioni.length === 1 ? "annotazione" : "annotazioni"}
        </Text>
      </View>

      {/* Annotations list */}
      {annotazioniLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#1E40AF" />
        </View>
      ) : (
        <FlatList
          data={annotazioni}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
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
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={newTesto}
            onChangeText={setNewTesto}
            placeholder="Scrivi un'annotazione..."
            placeholderTextColor="#9CA3AF"
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
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Invia</Text>
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
    backgroundColor: "#F3F4F6",
  },
  photoSelector: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  photoSelectorContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  photoTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
  },
  photoTabActive: {
    backgroundColor: "#1E40AF",
  },
  photoTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  photoTabTextActive: {
    color: "#FFFFFF",
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
  },
  headerCount: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
  list: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1F2937",
    maxHeight: 100,
    backgroundColor: "#F9FAFB",
  },
  sendButton: {
    backgroundColor: "#1E40AF",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sendButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
