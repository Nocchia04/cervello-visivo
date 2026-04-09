import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Share,
  Dimensions,
} from "react-native";
import { getLogEntries, onLogChange, clearLog, formatLogText, type LogEntry } from "../lib/debugLog";

const LEVEL_COLORS: Record<string, string> = {
  INFO: "#9ca3af",
  WARN: "#f59e0b",
  ERROR: "#ef4444",
  BLE: "#6366f1",
  WIFI: "#22c55e",
  CAM: "#3b82f6",
};

export function DebugLogOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<readonly LogEntry[]>(getLogEntries());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    return onLogChange(() => setEntries([...getLogEntries()]));
  }, []);

  useEffect(() => {
    if (visible) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [visible, entries.length]);

  if (!visible) return null;

  const handleShare = async () => {
    try {
      await Share.share({ message: formatLogText(), title: "Debug Log" });
    } catch {}
  };

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
  };

  return (
    <View style={styles.overlay}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Debug Log ({entries.length})</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleShare} style={styles.btn}>
            <Text style={styles.btnText}>Condividi</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearLog} style={styles.btn}>
            <Text style={styles.btnText}>Pulisci</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>X</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Log entries */}
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {entries.length === 0 ? (
          <Text style={styles.empty}>Nessun log ancora. Interagisci con la camera per vedere i log.</Text>
        ) : (
          entries.map((e, i) => (
            <Text key={i} style={styles.line}>
              <Text style={styles.time}>{fmtTime(e.ts)} </Text>
              <Text style={[styles.level, { color: LEVEL_COLORS[e.level] ?? "#fff" }]}>
                [{e.level}]{" "}
              </Text>
              <Text style={styles.msg}>{e.msg}</Text>
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: Dimensions.get("window").height * 0.55,
    backgroundColor: "rgba(10,10,20,0.95)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 999,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  title: { color: "#fff", fontSize: 14, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 6,
  },
  btnText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 12 },
  empty: { color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center", marginTop: 40 },
  line: { marginBottom: 2 },
  time: { color: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "monospace" },
  level: { fontSize: 10, fontWeight: "700", fontFamily: "monospace" },
  msg: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "monospace" },
});
