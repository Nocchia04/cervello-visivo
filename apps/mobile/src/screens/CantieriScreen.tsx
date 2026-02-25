import React from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@apollo/client";
import { CANTIERI_QUERY } from "../graphql/queries";
import { UploadQueueBadge } from "../components/UploadQueueBadge";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";

type CantieriScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Cantieri">;
};

interface CantiereItem {
  id: string;
  nome: string;
  indirizzo: string;
  stato: string;
  piantine: { id: string; nome: string; livello: number }[];
}

export function CantieriScreen({ navigation }: CantieriScreenProps) {
  const { data, loading, error, refetch } = useQuery(CANTIERI_QUERY);

  const cantieri: CantiereItem[] = data?.cantieri ?? [];

  const renderCantiere = ({ item }: { item: CantiereItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("Piantina", { cantiereId: item.id, cantiereNome: item.nome })}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cantiereName}>{item.nome}</Text>
        <View style={styles.statoBadge}>
          <Text style={styles.statoText}>{item.stato}</Text>
        </View>
      </View>
      <Text style={styles.indirizzo}>{item.indirizzo}</Text>
      <Text style={styles.pianteCount}>
        {item.piantine.length}{" "}
        {item.piantine.length === 1 ? "piantina" : "piantine"}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1E40AF" />
        <Text style={styles.loadingText}>Caricamento cantieri...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Errore: {error.message}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>I tuoi Cantieri</Text>
        <UploadQueueBadge />
      </View>

      {cantieri.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Nessun cantiere attivo</Text>
        </View>
      ) : (
        <FlatList
          data={cantieri}
          renderItem={renderCantiere}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetch}
              tintColor="#1E40AF"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  list: {
    padding: 16,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cantiereName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F2937",
    flex: 1,
  },
  statoBadge: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statoText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#065F46",
  },
  indirizzo: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
  pianteCount: {
    fontSize: 13,
    color: "#3B82F6",
    fontWeight: "500",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 16,
    color: "#EF4444",
    textAlign: "center",
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: "#1E40AF",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
});
