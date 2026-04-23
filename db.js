// Shared IndexedDB helpers for the KPF AR prototype.
//
// Schema (version 3):
//   Store 'projectMeta', keyPath 'id'
//     { id, name, createdAt, targetCount }
//   Store 'projectData', keyPath 'id'
//     { id, targets: [{imageName, imageBlob, videoName, videoBlob}, ...],
//       mindBuffer: ArrayBuffer }
//
// Split is deliberate: IndexedDB structured-clones entire records on
// read, so keeping the heavy blobs in a separate store lets list
// views use projectMeta.getAll() without touching any video bytes.
// getProject() rejoins both stores when the full record is needed.
//
// Upgrades from v2 (single 'projects' store) copy existing records
// into the new split layout via a cursor during onupgradeneeded.

const DB_NAME    = 'kpf-ar';
const DB_VERSION = 3;
const META_STORE = 'projectMeta';
const DATA_STORE = 'projectData';
const OLD_STORE  = 'projects';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction; // versionchange transaction

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DATA_STORE)) {
        db.createObjectStore(DATA_STORE, { keyPath: 'id' });
      }

      // Migrate v2 'projects' records into the split stores.
      if (event.oldVersion < 3 && db.objectStoreNames.contains(OLD_STORE)) {
        const oldStore  = tx.objectStore(OLD_STORE);
        const metaStore = tx.objectStore(META_STORE);
        const dataStore = tx.objectStore(DATA_STORE);
        oldStore.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          const p = cursor.value;
          metaStore.put({
            id:          p.id,
            name:        p.name,
            createdAt:   p.createdAt,
            targetCount: (p.targets || []).length,
          });
          dataStore.put({
            id:         p.id,
            targets:    p.targets || [],
            mindBuffer: p.mindBuffer,
          });
          cursor.continue();
        };
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
      const tx  = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).getAll();
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
      const tx      = db.transaction([META_STORE, DATA_STORE], 'readonly');
      const metaReq = tx.objectStore(META_STORE).get(id);
      const dataReq = tx.objectStore(DATA_STORE).get(id);
      tx.oncomplete = () => {
        const meta = metaReq.result;
        if (!meta) return resolve(null);
        const data = dataReq.result || {};
        resolve({
          ...meta,
          targets:    data.targets || [],
          mindBuffer: data.mindBuffer,
        });
      };
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function saveProject(project) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
      tx.objectStore(META_STORE).put({
        id:          project.id,
        name:        project.name,
        createdAt:   project.createdAt,
        targetCount: (project.targets || []).length,
      });
      tx.objectStore(DATA_STORE).put({
        id:         project.id,
        targets:    project.targets,
        mindBuffer: project.mindBuffer,
      });
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
      const tx = db.transaction([META_STORE, DATA_STORE], 'readwrite');
      tx.objectStore(META_STORE).delete(id);
      tx.objectStore(DATA_STORE).delete(id);
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
