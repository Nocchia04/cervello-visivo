import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { uploadQueue } from "../services/upload/UploadQueue";
import { uploadWorker } from "../services/upload/UploadWorker";
import { colors, spacing, radius, typography } from "../lib/theme";

export function UploadQueueBadge() {
  const [count, setCount] = useState(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(0);

  useEffect(() => {
    // Get initial count
    uploadQueue.getPendingCount().then(setCount);

    // Subscribe to worker updates
    const unsubscribe = uploadWorker.subscribe(setCount);
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Animate on count change
    if (count !== prevCount.current && count > 0) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevCount.current = count;
  }, [count, scaleAnim]);

  if (count === 0) return null;

  return (
    <Animated.View style={[styles.badge, { transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.uploadIcon}>⬆</Text>
      <View style={styles.countCircle}>
        <Text style={styles.countText}>{count}</Text>
      </View>
      <Text style={styles.badgeLabel}>
        {count === 1 ? "foto in coda" : "foto in coda"}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    gap: 6,
  },
  uploadIcon: {
    fontSize: 12,
    color: colors.warning,
  },
  countCircle: {
    backgroundColor: colors.warning,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    ...typography.label,
    fontSize: 12,
    color: colors.white,
    lineHeight: 14,
  },
  badgeLabel: {
    ...typography.bodySmall,
    color: '#92400E',
    fontWeight: "500",
  },
});
