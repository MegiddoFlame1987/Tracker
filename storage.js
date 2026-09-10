// Zamiennik window.storage (dostępnego tylko w Claude) — ta sama sygnatura,
// ale dane trzymane w localStorage przeglądarki. Działa offline, jeden telefon/przeglądarka.

const PREFIX = "dziennik:";

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

async function get(key) {
  const raw = localStorage.getItem(PREFIX + key);
  if (raw === null) return null;
  return { key, value: raw, shared: false };
}

async function set(key, value) {
  localStorage.setItem(PREFIX + key, value);
  return { key, value, shared: false };
}

async function del(key) {
  const existed = localStorage.getItem(PREFIX + key) !== null;
  localStorage.removeItem(PREFIX + key);
  return { key, deleted: existed, shared: false };
}

async function list(prefix = "") {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
  }
  return { keys, prefix, shared: false };
}

// Instaluje window.storage tak, żeby reszta kodu (App.jsx) nie wymagała zmian.
export function installStorageShim() {
  if (typeof window !== "undefined" && !window.storage) {
    window.storage = { get, set, delete: del, list };
  }
}
