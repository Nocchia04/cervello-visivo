import React, { useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
  Text,
} from "react-native";
import { colors, radius, typography, shadow } from "../lib/theme";
import { resolveMediaUrl } from "../lib/mediaUrl";

interface PuntoDiScatto {
  id: string;
  nome: string;
  x: number;
  y: number;
}

interface PiantinaMapProps {
  piantinaUrl: string;
  imageWidth: number;
  imageHeight: number;
  punti: PuntoDiScatto[];
  selectedPuntoId?: string;
  onPuntoSelect: (punto: PuntoDiScatto) => void;
}

/**
 * Calcola i bounds reali dell'immagine all'interno del container
 * quando si usa resizeMode="contain" (letterbox/pillarbox).
 * Le coordinate x/y dei punti sono percentuali dell'immagine originale,
 * quindi devono essere mappate sui bounds effettivi, non sul container intero.
 */
function getContainedBounds(
  containerW: number,
  containerH: number,
  imageW: number,
  imageH: number
) {
  if (!imageW || !imageH) {
    return { renderedW: containerW, renderedH: containerH, offsetX: 0, offsetY: 0 };
  }
  const containerRatio = containerW / containerH;
  const imageRatio = imageW / imageH;
  let renderedW: number, renderedH: number, offsetX: number, offsetY: number;
  if (imageRatio > containerRatio) {
    // Immagine più larga: fit sulla larghezza, spazio sopra/sotto
    renderedW = containerW;
    renderedH = containerW / imageRatio;
    offsetX = 0;
    offsetY = (containerH - renderedH) / 2;
  } else {
    // Immagine più alta: fit sull'altezza, spazio a sinistra/destra
    renderedH = containerH;
    renderedW = containerH * imageRatio;
    offsetX = (containerW - renderedW) / 2;
    offsetY = 0;
  }
  return { renderedW, renderedH, offsetX, offsetY };
}

export function PiantinaMap({
  piantinaUrl,
  imageWidth,
  imageHeight,
  punti,
  selectedPuntoId,
  onPuntoSelect,
}: PiantinaMapProps) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const { renderedW, renderedH, offsetX, offsetY } = getContainedBounds(
    containerSize.width,
    containerSize.height,
    imageWidth,
    imageHeight
  );

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Image
        source={{ uri: resolveMediaUrl(piantinaUrl) }}
        style={styles.image}
        resizeMode="contain"
      />
      {containerSize.width > 0 &&
        punti.map((punto) => {
          const isSelected = punto.id === selectedPuntoId;
          const left = offsetX + (punto.x / 100) * renderedW;
          const top = offsetY + (punto.y / 100) * renderedH;

          return (
            <TouchableOpacity
              key={punto.id}
              style={[
                styles.punto,
                { left: left - 22, top: top - 22 },
                isSelected && styles.puntoSelected,
              ]}
              onPress={() => onPuntoSelect(punto)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.puntoInner,
                  isSelected && styles.puntoInnerSelected,
                ]}
              />
              <View style={[styles.puntoLabelContainer, isSelected && styles.puntoLabelContainerSelected]}>
                <Text
                  style={[styles.puntoLabel, isSelected && styles.puntoLabelSelected]}
                  numberOfLines={1}
                >
                  {punto.nome}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  punto: {
    position: "absolute",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  puntoSelected: {
    zIndex: 20,
  },
  puntoInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.white,
    ...shadow.md,
  },
  puntoInnerSelected: {
    backgroundColor: colors.success,
    borderColor: colors.white,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
  },
  puntoLabelContainer: {
    backgroundColor: colors.white,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: 3,
    ...shadow.sm,
    maxWidth: 90,
  },
  puntoLabelContainerSelected: {
    backgroundColor: colors.accent,
  },
  puntoLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.accent,
    fontWeight: "600",
  },
  puntoLabelSelected: {
    color: colors.white,
    fontWeight: "700",
  },
});
