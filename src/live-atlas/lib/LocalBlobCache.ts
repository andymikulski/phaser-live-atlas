const DB_NAME = "phaser-indexeddb-test";
const DB_VERSION = 1; // Use a long long for this value (don't use a float)
const DB_STORE_NAME = "cached-images";

type StoredBlob = { type: "blob" | "json"; data: Blob };

class LocalBlobCache {
  private db?: IDBDatabase;

  constructor() {
    this.connectToCache();
  }

  private connectToCache = () => {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = (evt) => {
      this.db = req.result;
    };
    req.onerror = function (evt) {
      console.error("error opening cache:", evt);
    };

    req.onupgradeneeded = function (evt) {
      var db = (evt.target as IDBOpenDBRequest).result;
      if (!db) {
        console.error("opening ugprading cache:", db);
        return;
      }

      console.log("openDb.onupgradeneeded");
      var store = db.createObjectStore(DB_STORE_NAME, {});
      store.createIndex("id", "id", { unique: true });
      store.createIndex("data", "data", { unique: false });
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

  public saveBlob = async (
    id: string,
    data: string | object | Blob
  ): Promise<void> => {
    if (!this.db) {
      return;
    }
    console.log("saveBlob ", id);

    const blobData =
      data instanceof Blob
        ? data
        : new Blob([JSON.stringify(data)], { type: "text/plain" });
    const obj: StoredBlob = {
      type: data instanceof Blob ? "blob" : "json",
      data: blobData,
    };

    const store = this.getStore("readwrite");
    if (!store) {
      console.error("error getting readwrite store");
      return;
    }

    return new Promise((res, rej) => {
      var req;
      try {
        req = store.put(obj, id);
      } catch (e) {
        throw e;
      }
      req.onsuccess = function () {
        console.log("Insertion in DB successful");
        res();
      };
      req.onerror = function () {
        console.error("saveBlob error", this.error);
        rej();
      };
    });
  };

  public loadBlob = async (id: string): Promise<void | Blob | string> => {
    if (!this.db) {
      console.log("NO DB!");
      return;
    }
    const store = this.getStore("readonly");
    if (!store) {
      console.log("NO STORE!");
      return;
    }

    console.log("here in loadBlob");
    return new Promise((res, rej) => {
      console.log("store get", id);
      const req = store.get(id) as IDBRequest<StoredBlob>;

      req.onerror = (evt) => {
        console.log("error getting store thing", req.error);
        rej(req.error);
      };
      req.onsuccess = (evt) => {
        console.log("on store done get", evt.target);
        if (!req.result) {
          res();
          return;
        } else {
          const { data, type } = req.result;
          if (type === "json") {
            // Get text from blob
            new Response(data)
              .text()
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

export default new LocalBlobCache();
