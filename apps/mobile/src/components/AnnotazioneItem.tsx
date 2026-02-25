import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { safeDate } from "../lib/dateUtils";
import { colors, spacing, radius, typography, shadow } from "../lib/theme";

interface AnnotazioneItemProps {
  testo: string;
  autoreNome: string;
  autoreCognome: string;
  createdAt: string;
}

export function AnnotazioneItem({
  testo,
  autoreNome,
  autoreCognome,
  createdAt,
}: AnnotazioneItemProps) {
  const formatDate = (dateStr: string) => {
    const date = safeDate(dateStr);
    return date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const initials = `${autoreNome.charAt(0)}${autoreCognome.charAt(0)}`.toUpperCase();

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
      </View>
      <View style={styles.bubble}>
        <View style={styles.header}>
          <Text style={styles.authorName}>
            {autoreNome} {autoreCognome}
          </Text>
          <Text style={styles.date}>{formatDate(createdAt)}</Text>
        </View>
        <Text style={styles.testo}>{testo}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginBottom: spacing.md,
    alignItems: "flex-start",
  },
  avatarContainer: {
    marginRight: spacing.md,
    paddingTop: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.white,
    ...typography.label,
    fontSize: 13,
  },
  bubble: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  authorName: {
    ...typography.h4,
    fontSize: 14,
    color: colors.text,
  },
  date: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  testo: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
