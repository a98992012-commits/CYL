(() => {
  const DB_NAME = "cyl-manager-local";
  const DB_VERSION = 1;
  const STORE = "app";
  const KEY = "state";
  const initialState = () => ({
    version: 1,
    cylinders: [],
    events: [],
    positions: [
      ...["1號入料","1號出料","2號入料","2號出料"].flatMap(area =>
        [4,3,2,1].map(slot => ({ id: area + "-" + slot, area, slot, cylinderId: null }))
      )
    ]
  });
  let dbPromise;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("此瀏覽器不支援 IndexedDB"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function load() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || initialState());
      req.onerror = () => reject(req.error);
    });
  }
  async function save(state) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(state, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("資料儲存失敗"));
    });
  }
  window.CYLDB = { load, save, initialState };
})();