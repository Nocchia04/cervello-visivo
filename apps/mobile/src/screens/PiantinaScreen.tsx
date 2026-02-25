import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useQuery } from "@apollo/client";
import { CANTIERE_QUERY } from "../graphql/queries";
import { PiantinaMap } from "../components/PiantinaMap";
import { UploadQueueBadge } from "../components/UploadQueueBadge";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../navigation/AppNavigator";

type PiantinaScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, "Piantina">;
  route: RouteProp<RootStackParamList, "Piantina">;
};

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

export function PiantinaScreen({ navigation, route }: PiantinaScreenProps) {
  const { cantiereId, cantiereNome } = route.params;
  const [selectedPianta, setSelectedPianta] = useState<number>(0);
  const [selectedPunto, setSelectedPunto] = useState<PuntoDiScatto | null>(null);

  const { data, loading, error } = useQuery(CANTIERE_QUERY, {
    variables: { id: cantiereId },
  });

  const piantine: PiantinaData[] = data?.cantiere?.piantine ?? [];
  const currentPianta = piantine[selectedPianta];

  const handlePuntoSelect = (punto: PuntoDiScatto) => {
    setSelectedPunto(punto);
  };

  const handleGoToScatto = () => {
    if (selectedPunto && currentPianta) {
      navigation.navigate("Scatto", {
        puntoId: selectedPunto.id,
        puntoNome: selectedPunto.nome,
        piantinaId: currentPianta.id,
        piantinaNome: currentPianta.nome,
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Errore: {error.message}</Text>
      </View>
    );
  }

  if (piantine.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Nessuna piantina per questo cantiere</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>{cantiereNome}</Text>
        <UploadQueueBadge />
      </View>

      {/* Level selector tabs */}
      {piantine.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsContainer}
          contentContainerStyle={styles.tabs}
        >
          {piantine.map((p, idx) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.tab, idx === selectedPianta && styles.tabActive]}
              onPress={() => {
                setSelectedPianta(idx);
                setSelectedPunto(null);
              }}
            >
              <Text
                style={[
                  styles.tabText,
                  idx === selectedPianta && styles.tabTextActive,
                ]}
              >
                {p.nome} (L{p.livello})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Map */}
      <View style={styles.mapContainer}>
        {currentPianta && (
          <PiantinaMap
            piantinaUrl={currentPianta.fileUrl}
            punti={currentPianta.puntiDiScatto}
            selectedPuntoId={selectedPunto?.id}
            onPuntoSelect={handlePuntoSelect}
          />
        )}
      </View>

      {/* Selected point info + action */}
      {selectedPunto && (
        <View style={styles.bottomBar}>
          <View style={styles.puntoInfo}>
            <Text style={styles.puntoName}>{selectedPunto.nome}</Text>
            <Text style={styles.puntoCoords}>
              x: {selectedPunto.x.toFixed(1)}% y: {selectedPunto.y.toFixed(1)}%
            </Text>
          </View>
          <TouchableOpacity
            style={styles.scattoButton}
            onPress={handleGoToScatto}
            activeOpacity={0.8}
          >
            <Text style={styles.scattoButtonText}>Vai allo Scatto</Text>
          </TouchableOpacity>
        </View>
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
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  tabsContainer: {
    backgroundColor: "#FFFFFF",
    maxHeight: 50,
  },
  tabs: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
  },
  tabActive: {
    backgroundColor: "#1E40AF",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  mapContainer: {
    flex: 1,
    margin: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  puntoInfo: {
    flex: 1,
  },
  puntoName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  puntoCoords: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  scattoButton: {
    backgroundColor: "#1E40AF",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  scattoButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#EF4444",
  },
  emptyText: {
    fontSize: 16,
    color: "#9CA3AF",
  },
});
