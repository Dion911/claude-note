/**
 * db.js – IndexedDB Abstraction Layer
 * Dione OS – Field Notes Edition
 *
 * Provides a clean promise-based API for storing:
 *   - entries (daily, project, thinking)
 *   - projects (folder definitions)
 */

const DB_NAME = 'dione-os';
const DB_VERSION = 1;

// Object store names
const STORE_ENTRIES = 'entries';
const STORE_PROJECTS = 'projects';

let _db = null;

/**
 * Opens (or upgrades) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // ── ENTRIES store ──────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const entryStore = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        entryStore.createIndex('mode', 'mode', { unique: false });
        entryStore.createIndex('projectId', 'projectId', { unique: false });
        entryStore.createIndex('createdAt', 'createdAt', { unique: false });
        entryStore.createIndex('pinned', 'pinned', { unique: false });
        entryStore.createIndex('starred', 'starred', { unique: false });
      }

      // ── PROJECTS store ─────────────────────────────────
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;

      // Handle version change / unexpected close
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };

      resolve(_db);
    };

    request.onerror = (event) => {
      console.error('[DB] Failed to open database:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Generic helper: execute a transaction on one store.
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @param {(store: IDBObjectStore) => IDBRequest} operation
 * @returns {Promise<any>}
 */
function withStore(storeName, mode, operation) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// ENTRY API
// ═══════════════════════════════════════════════════════════

/**
 * Creates or updates an entry.
 * @param {Object} entry - Full entry object (see data model in README)
 * @returns {Promise<string>} entry id
 */
function saveEntry(entry) {
  return withStore(STORE_ENTRIES, 'readwrite', (store) => store.put(entry));
}

/**
 * Retrieves a single entry by id.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
function getEntry(id) {
  return withStore(STORE_ENTRIES, 'readonly', (store) => store.get(id));
}

/**
 * Retrieves all entries, sorted by createdAt descending.
 * @returns {Promise<Array<Object>>}
 */
function getAllEntries() {
  return withStore(STORE_ENTRIES, 'readonly', (store) => store.getAll()).then((entries) =>
    entries.sort((a, b) => b.createdAt - a.createdAt)
  );
}

/**
 * Retrieves entries filtered by mode.
 * @param {'daily'|'project'|'thinking'} mode
 * @returns {Promise<Array<Object>>}
 */
function getEntriesByMode(mode) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readonly');
      const store = tx.objectStore(STORE_ENTRIES);
      const index = store.index('mode');
      const request = index.getAll(IDBKeyRange.only(mode));
      request.onsuccess = () =>
        resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Retrieves entries for a specific project.
 * @param {string} projectId
 * @returns {Promise<Array<Object>>}
 */
function getEntriesByProject(projectId) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ENTRIES, 'readonly');
      const store = tx.objectStore(STORE_ENTRIES);
      const index = store.index('projectId');
      const request = index.getAll(IDBKeyRange.only(projectId));
      request.onsuccess = () =>
        resolve(request.result.sort((a, b) => b.createdAt - a.createdAt));
      request.onerror = () => reject(request.error);
    });
  });
}

/**
 * Deletes an entry by id.
 * @param {string} id
 * @returns {Promise<undefined>}
 */
function deleteEntry(id) {
  return withStore(STORE_ENTRIES, 'readwrite', (store) => store.delete(id));
}

// ═══════════════════════════════════════════════════════════
// PROJECT API
// ═══════════════════════════════════════════════════════════

/**
 * Creates or updates a project.
 * @param {Object} project
 * @returns {Promise<string>} project id
 */
function saveProject(project) {
  return withStore(STORE_PROJECTS, 'readwrite', (store) => store.put(project));
}

/**
 * Retrieves a single project by id.
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
function getProject(id) {
  return withStore(STORE_PROJECTS, 'readonly', (store) => store.get(id));
}

/**
 * Retrieves all projects, sorted by createdAt descending.
 * @returns {Promise<Array<Object>>}
 */
function getAllProjects() {
  return withStore(STORE_PROJECTS, 'readonly', (store) => store.getAll()).then((projects) =>
    projects.sort((a, b) => b.createdAt - a.createdAt)
  );
}

/**
 * Deletes a project and all its entries.
 * @param {string} projectId
 * @returns {Promise<void>}
 */
async function deleteProject(projectId) {
  const entries = await getEntriesByProject(projectId);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ENTRIES, STORE_PROJECTS], 'readwrite');
    const entryStore = tx.objectStore(STORE_ENTRIES);
    const projectStore = tx.objectStore(STORE_PROJECTS);

    entries.forEach((entry) => entryStore.delete(entry.id));
    projectStore.delete(projectId);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ═══════════════════════════════════════════════════════════
// BACKUP API
// ═══════════════════════════════════════════════════════════

/**
 * Exports all data as a JSON object.
 * @returns {Promise<Object>} { entries, projects, exportedAt }
 */
async function exportData() {
  const [entries, projects] = await Promise.all([getAllEntries(), getAllProjects()]);
  return {
    version: 1,
    exportedAt: Date.now(),
    entries,
    projects,
  };
}

/**
 * Imports data from a backup JSON object.
 * Merges by id (upsert).
 * @param {Object} data - Exported JSON object
 * @returns {Promise<void>}
 */
async function importData(data) {
  if (!data || !Array.isArray(data.entries) || !Array.isArray(data.projects)) {
    throw new Error('Invalid backup format');
  }

  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ENTRIES, STORE_PROJECTS], 'readwrite');
    const entryStore = tx.objectStore(STORE_ENTRIES);
    const projectStore = tx.objectStore(STORE_PROJECTS);

    data.projects.forEach((p) => projectStore.put(p));
    data.entries.forEach((e) => entryStore.put(e));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ═══════════════════════════════════════════════════════════
// SEED DEFAULT PROJECTS
// ═══════════════════════════════════════════════════════════

/**
 * Seeds the database with default project folders on first run.
 * @returns {Promise<void>}
 */
async function seedDefaultProjects() {
  const existing = await getAllProjects();
  if (existing.length > 0) return; // Already seeded

  const defaults = [
    { name: 'Lota Kopi', icon: '☕', description: 'Coffee shop notes & observations' },
    { name: 'Cucufate', icon: '🌿', description: 'Brand & product development' },
    { name: 'CLI Work', icon: '⌨️', description: 'Developer notes & snippets' },
    { name: 'Espresso Experiments', icon: '🧪', description: 'Dialing in the perfect shot' },
    { name: 'Travel', icon: '✈️', description: 'Field notes from the road' },
  ];

  const now = Date.now();
  const promises = defaults.map((d, i) =>
    saveProject({
      id: `project-${now}-${i}`,
      name: d.name,
      icon: d.icon,
      description: d.description,
      createdAt: now - i * 1000,
      updatedAt: now - i * 1000,
    })
  );

  await Promise.all(promises);
}

// ═══════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════

/**
 * Full-text search across all entries.
 * Filters by query string and optional mode/pinned/starred filters.
 * @param {string} query
 * @param {Object} filters - { mode, pinned, starred }
 * @returns {Promise<Array<Object>>}
 */
async function searchEntries(query, filters = {}) {
  const all = await getAllEntries();
  const q = query.toLowerCase().trim();

  return all.filter((entry) => {
    // Text match
    const textMatch =
      !q ||
      (entry.body && entry.body.toLowerCase().includes(q)) ||
      (entry.title && entry.title.toLowerCase().includes(q)) ||
      (entry.tags && entry.tags.some((t) => t.toLowerCase().includes(q)));

    if (!textMatch) return false;

    // Mode filter
    if (filters.mode && entry.mode !== filters.mode) return false;

    // Pinned filter
    if (filters.pinned && !entry.pinned) return false;

    // Starred filter
    if (filters.starred && !entry.starred) return false;

    return true;
  });
}

// Expose globally for app.js
window.DioneDB = {
  openDB,
  saveEntry,
  getEntry,
  getAllEntries,
  getEntriesByMode,
  getEntriesByProject,
  deleteEntry,
  saveProject,
  getProject,
  getAllProjects,
  deleteProject,
  exportData,
  importData,
  seedDefaultProjects,
  searchEntries,
};
