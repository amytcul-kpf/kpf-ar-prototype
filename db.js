// Shared IndexedDB helpers for the KPF AR prototype.
// Database schema (version 2):
//   Store: 'projects', keyPath 'id'
//   Record shape:
//     {
//       id:         string              'proj-<base36>-<rand>'
//       name:       string              user-entered label
//       createdAt:  number              Date.now()
//       targets:    Array<{
//         imageName: string,
//         imageBlob: Blob,
//         videoName: string,
//         videoBlob: Blob
//       }>
//       mindBuffer: ArrayBuffer         compiled MindAR .mind payload
//     }

const DB_NAME    = 'kpf-ar';
const DB_VERSION = 2;
const STORE      = 'projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function listProjects() {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(
        (req.result || []).sort((a, b) => b.createdAt - a.createdAt)
      );
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function getProject(id) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveProject(project) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(project);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteProject(id) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function newProjectId() {
  return 'proj-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
