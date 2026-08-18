const SESSION_IDS_KEY = "xjtlu-api-session-ids-v1";
const MAX_SESSION_IDS = 20;

function generateSecureId(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);

    // Set the RFC 4122 UUID v4 version and variant bits.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-");
  }

  throw new Error("Secure random ID generation is unavailable");
}

function rememberClientId(id: string) {
  if (typeof window === "undefined") return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_IDS_KEY) || "[]");
    const current = Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    const next = [id, ...current.filter((item) => item !== id)].slice(0, MAX_SESSION_IDS);
    window.localStorage.setItem(SESSION_IDS_KEY, JSON.stringify(next));
  } catch {
    // History isolation is a convenience layer; chat must still work if storage is unavailable.
  }
}

export function createClientId(): string {
  const id = generateSecureId();
  rememberClientId(id);
  return id;
}

export function getStoredClientIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SESSION_IDS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === "string" && /^[0-9a-f-]{16,}$/i.test(item)).slice(0, MAX_SESSION_IDS);
  } catch {
    return [];
  }
}
