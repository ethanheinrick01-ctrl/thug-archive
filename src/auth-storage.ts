// Supabase owns token validation and refresh. This only stores its session on
// this device; passwords never enter either store.
const databaseName = "thug-archive-device-auth-v1";
const storeName = "sessions";
let connection: Promise<IDBDatabase> | undefined;
const memory = new Map<string, string>();

function database(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error("Device session storage is unavailable."));
      };
      const timeout = setTimeout(fail, 4000);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName);
      };
      request.onerror = fail;
      request.onblocked = fail;
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        clearTimeout(timeout);
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

async function savedSession(key: string, value?: string | null) {
  const db = await database();
  return new Promise<string | null>((resolve, reject) => {
    const transaction = db.transaction(
      storeName,
      value === undefined ? "readonly" : "readwrite",
    );
    const store = transaction.objectStore(storeName);
    const request =
      value === undefined
        ? store.get(key)
        : value === null
          ? store.delete(key)
          : store.put(value, key);
    transaction.oncomplete = () =>
      resolve(
        value === undefined && typeof request.result === "string"
          ? request.result
          : null,
      );
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const deviceAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    let value: string | null = null;
    try {
      value = localStorage.getItem(key);
    } catch {}
    if (value !== null) {
      memory.set(key, value);
      // Also migrate sessions created before the device backup was added.
      try {
        await savedSession(key, value);
      } catch {}
      return value;
    }
    try {
      value = await savedSession(key);
    } catch {}
    if (value !== null) {
      memory.set(key, value);
      try {
        localStorage.setItem(key, value);
      } catch {}
    }
    return value ?? memory.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {}
    // Await the committed transaction before reporting a successful sign-in.
    try {
      await savedSession(key, value);
    } catch {}
  },
  async removeItem(key: string) {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {}
    try {
      await savedSession(key, null);
    } catch {}
  },
};

export async function requestPersistentSessionStorage() {
  try {
    await navigator.storage?.persist?.();
  } catch {}
}
