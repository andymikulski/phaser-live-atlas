const DB_NAME = "phaser-live-atlas-storage";
const DB_VERSION = 1; // Use a long long for this value (don't use a float)
const DB_STORE_NAME = "cached-atlas-data";

type StoredBlob = { type: "blob" | "json"; data: Blob };

export default class LocalBlobCache {
  private db?: IDBDatabase;

  constructor(cacheName = DB_NAME) {
    this.connectToCache(cacheName);
  }

  private connectToCache = (dbName: string) => {
    const req = indexedDB.open(dbName, DB_VERSION);
    req.onsuccess = (_evt) => {
      this.db = req.result;
    };
    req.onerror = function (evt) {
      console.error("error opening cache:", evt);
    };

    req.onupgradeneeded = function (_change: IDBVersionChangeEvent) {
      const db = req.result;
      if (!db) {
        console.error("opening ugprading cache:", db);
        return null;
      }

      console.log("openDb.onupgradeneeded");
      const store = db.createObjectStore(DB_STORE_NAME, {});
      store.createIndex("id", "id", { unique: true });
      store.createIndex("data", "data", { unique: false });

      return null;
    };
  };

  private getStore = (mode: IDBTransactionMode): IDBObjectStore | undefined => {
    if (!this.db) {
      return undefined;
    }
    const tx = this.db.transaction(DB_STORE_NAME, mode);
    const store = tx.objectStore(DB_STORE_NAME);
    return store;
  };

  public freeBlob = async (id: string): Promise<void> => {
    const store = this.getStore("readwrite");
    if (!store) {
      return;
    }
    return new Promise((res, rej) => {
      const req = store.delete(id);
      req.onsuccess = function () {
        res();
      };
      req.onerror = function () {
        rej();
      };
    });
  };

  public saveBlob = async (id: string, data: string | object | Blob): Promise<void> => {
    if (!this.db) {
      return;
    }

    const blobData =
      data instanceof Blob ? data : new Blob([JSON.stringify(data)], { type: "text/plain" });
    const obj: StoredBlob = {
      type: data instanceof Blob ? "blob" : "json",
      data: blobData,
    };

    const store = this.getStore("readwrite");
    if (!store) {
      return;
    }

    return new Promise((res, rej) => {
      const req = store.put(obj, id);
      req.onsuccess = function () {
        res();
      };
      req.onerror = function () {
        rej();
      };
    });
  };

  public async convertBinaryToText(blob: Blob | File) {
    return new Response(blob).text();
  }

  public loadBlob = async (id: string): Promise<void | Blob | string> => {
    if (!this.db) {
      return;
    }
    const store = this.getStore("readonly");
    if (!store) {
      return;
    }

    return new Promise((res, rej) => {
      const req: IDBRequest<StoredBlob> = store.get(id);

      req.onerror = (_evt) => {
        rej(req.error);
      };
      req.onsuccess = (_evt) => {
        if (!req.result) {
          res();
          return;
        } else {
          const { data, type } = req.result;
          if (type === "json") {
            // Get text from blob
            this.convertBinaryToText(data)
              .then((str) => {
                res(str);
              })
              .catch(rej);
          } else {
            res(data);
          }
        }
      };
    });
  };
}
