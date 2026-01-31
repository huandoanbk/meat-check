export type ScanRecord = {
  id: string;
  ts: number;
  productId: string;
  productName: string;
  kg: number;
  source: "ocr" | "manual";
  rawText?: string;
};

export type InventorySession = {
  id: string;
  name: string; // YYYY-MM-DD HH:mm
  createdAt: number;
  records: ScanRecord[]; // newest-first
};

const STORAGE_KEY = "meat_inventory_sessions_v1";
const MAX_SESSIONS = 10;

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export const formatSessionName = (ts = Date.now()): string => {
  const date = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

const safeParse = (raw: string | null): InventorySession[] => {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const loadSessions = (): InventorySession[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return safeParse(raw);
};

export const saveSessions = (sessions: InventorySession[]): void => {
  if (typeof window === "undefined") return;
  const trimmed = sessions.slice(0, MAX_SESSIONS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
};

export const getSessionById = (
  id: string
): InventorySession | undefined => loadSessions().find((s) => s.id === id);

export const createSession = (): string => {
  const sessions = loadSessions();
  const session: InventorySession = {
    id: uid(),
    name: formatSessionName(),
    createdAt: Date.now(),
    records: [],
  };
  const next = [session, ...sessions].slice(0, MAX_SESSIONS);
  saveSessions(next);
  return session.id;
};

export const deleteSession = (sessionId: string): void => {
  const next = loadSessions().filter((s) => s.id !== sessionId);
  saveSessions(next);
};

export const addRecord = (
  sessionId: string,
  record: ScanRecord
): InventorySession[] => {
  const next = loadSessions().map((s) =>
    s.id === sessionId ? { ...s, records: [record, ...s.records] } : s
  );
  saveSessions(next);
  return next;
};

export const deleteRecord = (
  sessionId: string,
  recordId: string
): InventorySession[] => {
  const next = loadSessions().map((s) =>
    s.id === sessionId
      ? { ...s, records: s.records.filter((r) => r.id !== recordId) }
      : s
  );
  saveSessions(next);
  return next;
};
