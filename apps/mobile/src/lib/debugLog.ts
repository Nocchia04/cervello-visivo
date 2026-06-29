/**
 * Debug logger visuale — raccoglie log in-memory che possono
 * essere mostrati in un overlay nell'app.
 * Ogni entry ha timestamp, livello e messaggio.
 */

export type LogLevel = "INFO" | "WARN" | "ERROR" | "BLE" | "WIFI" | "CAM" | "PREV";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  msg: string;
}

const MAX_ENTRIES = 200;
const _entries: LogEntry[] = [];
const _listeners = new Set<() => void>();

export function dlog(level: LogLevel, msg: string) {
  const entry: LogEntry = { ts: Date.now(), level, msg };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();
  // Also console.log for adb logcat
  console.log(`[${level}] ${msg}`);
  _listeners.forEach((fn) => fn());
}

export function getLogEntries(): readonly LogEntry[] {
  return _entries;
}

export function clearLog() {
  _entries.length = 0;
  _listeners.forEach((fn) => fn());
}

export function onLogChange(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function formatLogText(): string {
  return _entries
    .map((e) => {
      const d = new Date(e.ts);
      const t = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`;
      return `[${t}][${e.level}] ${e.msg}`;
    })
    .join("\n");
}
