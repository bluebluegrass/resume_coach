const DB_NAME = "resume-fit-mvp";
const DB_VERSION = 1;
const STORE = "kv";
const KEY = "resumeText";

function supportsIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open IndexedDB"));
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
    req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB set failed"));
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"));
  });
}

export async function loadResumeText(): Promise<string> {
  if (supportsIndexedDB()) {
    try {
      return (await idbGet(KEY)) || "";
    } catch {
      // fallback below
    }
  }
  return localStorage.getItem(KEY) || "";
}

export async function saveResumeText(text: string): Promise<"indexeddb" | "localStorage"> {
  if (supportsIndexedDB()) {
    try {
      await idbSet(KEY, text);
      return "indexeddb";
    } catch {
      // fallback below
    }
  }

  localStorage.setItem(KEY, text);
  return "localStorage";
}

export async function clearResumeText(): Promise<void> {
  if (supportsIndexedDB()) {
    try {
      await idbDelete(KEY);
    } catch {
      // ignore and clear localStorage below
    }
  }
  localStorage.removeItem(KEY);
}
