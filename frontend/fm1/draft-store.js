import { FM1_DRAFT_DB } from "./constants.js";

let databasePromise = null;

function openDatabase() {
  if (!globalThis.indexedDB)
    return Promise.reject(
      new Error("IndexedDB is unavailable in this browser context."),
    );
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(FM1_DRAFT_DB.name, FM1_DRAFT_DB.version);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(FM1_DRAFT_DB.store)
        ? request.transaction.objectStore(FM1_DRAFT_DB.store)
        : database.createObjectStore(FM1_DRAFT_DB.store, { keyPath: "id" });
      if (!store.indexNames.contains("createdAt")) {
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!store.indexNames.contains("scopeKey")) {
        store.createIndex("scopeKey", "scopeKey", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error || new Error("Unable to open the FM1 draft database."),
      );
    request.onblocked = () =>
      reject(
        new Error("The FM1 draft database upgrade is blocked by another tab."),
      );
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function transactionRequest(database, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FM1_DRAFT_DB.store, mode);
    const request = action(transaction.objectStore(FM1_DRAFT_DB.store));
    let result;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () =>
      reject(request.error || new Error("The FM1 draft operation failed."));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () =>
      reject(
        transaction.error ||
          request.error ||
          new Error("The FM1 draft transaction failed."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ||
          new Error("The FM1 draft transaction was aborted."),
      );
  });
}

export async function listFm1Drafts(scopeKey = "unscoped::unscoped") {
  const database = await openDatabase();
  const drafts = await transactionRequest(database, "readonly", (store) =>
    store.index("scopeKey").getAll(scopeKey),
  );
  return drafts.sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
}

export async function saveFm1Draft(draft) {
  const database = await openDatabase();
  await transactionRequest(database, "readwrite", (store) => store.put(draft));
  return draft;
}

export async function deleteFm1Draft(id, scopeKey = "unscoped::unscoped") {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FM1_DRAFT_DB.store, "readwrite");
    const store = transaction.objectStore(FM1_DRAFT_DB.store);
    const request = store.get(id);
    let removed = false;

    request.onsuccess = () => {
      if (request.result?.scopeKey === scopeKey) {
        store.delete(id);
        removed = true;
      }
    };
    request.onerror = () =>
      reject(request.error || new Error("Unable to read the FM1 local draft."));
    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () =>
      reject(
        transaction.error ||
          new Error("The FM1 draft deletion transaction failed."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ||
          new Error("The FM1 draft deletion transaction was aborted."),
      );
  });
}
