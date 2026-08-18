export type ToolHistoryEntry = {
  id: string;
  sessionId: string;
  workspace: string;
  workspaceSlug: string;
  tool: "file-fill";
  inputName: string;
  outputName: string;
  fieldCount: number;
  instruction: string;
  createdAt: number;
};

const STORAGE_KEY = "xjtlu-tool-history-v1";
const MAX_ENTRIES = 80;

function isEntry(value: unknown): value is ToolHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ToolHistoryEntry>;
  return Boolean(
    entry.id &&
    entry.sessionId &&
    entry.workspace &&
    entry.workspaceSlug &&
    entry.tool === "file-fill" &&
    entry.inputName &&
    entry.outputName &&
    typeof entry.fieldCount === "number" &&
    typeof entry.createdAt === "number",
  );
}

export function getToolHistory(): ToolHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function recordToolHistory(entry: Omit<ToolHistoryEntry, "id" | "createdAt"> & { id?: string; createdAt?: number }) {
  if (typeof window === "undefined") return;
  const next: ToolHistoryEntry = {
    ...entry,
    id: entry.id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: entry.createdAt || Date.now(),
  };
  try {
    const current = getToolHistory().filter((item) => item.id !== next.id);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...current].slice(0, MAX_ENTRIES)));
  } catch {}
}
