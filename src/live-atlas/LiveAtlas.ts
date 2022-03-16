import { trimImageEdges } from "./lib/imageTrimming";
import { loadIntoPhaser as asyncLoader } from "./lib/asyncLoader";
// import { Atlas } from "./AtlasTypes";
import LocalBlobCache from "./lib/LocalBlobCache";
import ShelfPack, { Shelf } from "./lib/ShelfPack";

/**
 * Given a number of bytes, returns a human-readable, simplified representation of the value.
 * ex:
 * getHumanByteSize(100) -> "100 Bytes"
 * getHumanByteSize(1024) -> "1.0 KB"
 * getHumanByteSize(123456789) -> "117.7 MB"
 */
function convertBytesToHumanReadable(bytes: number) {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1000));
  if (i === 0) {
    return `${bytes} ${sizes[i]}`;
  }
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

type SerializedAtlas = {
  frames: {
    [id: string]: { x: number; y: number; width: number; height: number };
  };
  image: string;
  packerData: string;
};

export class LiveAtlas {
  private frames: { [imgUrl: string]: Phaser.Geom.Rectangle } = {};
  private rt: Phaser.GameObjects.RenderTexture;
  private backbuffer?: Phaser.GameObjects.RenderTexture;
  private eraserCursor: Phaser.GameObjects.Rectangle;

  private packer = new ShelfPack(1, 1, true);

  public get texture(): Phaser.Textures.Texture {
    return this.rt.texture;
  }

  public get renderTexture(): Phaser.GameObjects.RenderTexture {
    return this.rt;
  }

  constructor(public scene: Phaser.Scene, public id: string) {
    this.rt = scene.make.renderTexture({ width: 1, height: 1 });
    this.rt.saveTexture("live-atlas-" + id);

    this.eraserCursor = scene.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setVisible(false);
  }

  public destroy = (fromScene?: boolean) => {
    this.rt.destroy(fromScene);
    this.backbuffer?.destroy(fromScene);
    this.eraserCursor?.destroy(fromScene);
  };

  // ------

  public get textureKey(): string {
    return "live-atlas-" + this.id;
  }

  private backbufferKey = () => {
    return "live-atlas-backbuffer-" + this.id;
  };

  public hasFrame = (frame: string) => {
    return !!this.frames[frame];
  };

  private trimCanvas?: Phaser.Textures.CanvasTexture;
  private getImageDataFromSource = (src: HTMLImageElement | HTMLCanvasElement) => {
    if (!this.trimCanvas) {
      this.trimCanvas = this.rt.scene.textures.createCanvas("trim canvas", src.width, src.height);
    } else {
      this.trimCanvas.setSize(src.width, src.height);
    }

    this.trimCanvas.draw(0, 0, src);
    const trimData = this.trimCanvas.getContext().getImageData(0, 0, src.width, src.height);
    this.trimCanvas.setSize(1, 1);
    this.trimCanvas.clear();
    return trimData;
  };
  private trimFrame = (frameKey: string) => {
    const src = this.rt.scene.textures.get(frameKey).getSourceImage();

    if (src instanceof Phaser.GameObjects.RenderTexture) {
      return {
        x: 0,
        y: 0,
        originalWidth: src.width,
        originalHeight: src.height,
        trimmedWidth: src.width,
        trimmedHeight: src.height,
      };
    }

    const imgData = this.getImageDataFromSource(src);
    return trimImageEdges(imgData);
  };

  /**
   * only do this AFTER it's certain this frame isn't being used
   */
  public removeFrame(frame: string | string[], immediately = false) {
    if (!(frame instanceof Array)) {
      frame = [frame];
    }

    for (let i = 0; i < frame.length; i++) {
      const currentFrame = frame[i];
      if (!currentFrame) {
        continue;
      }
      const frameRect = this.frames[currentFrame];
      if (!frameRect) {
        return;
      }
      delete this.frames[currentFrame];
      if (!immediately) {
        return;
      }

      // if we're immediately removing this from the texture, we need to actually erase the image data
      // and the frame. (This happens 'passively' when `repack` is called.)
      this.eraserCursor.setPosition(frameRect.x, frameRect.y);
      this.eraserCursor.setOrigin(0, 0);
      this.eraserCursor.setSize(frameRect.width, frameRect.height);
      this.rt.erase(this.eraserCursor);

      // Free space from the packer to be used in the future
      const bin = this.packer.getBin(currentFrame);
      if (bin) {
        this.packer.unref(bin);
      }
    }

    // Ensure repacks now that we've added a new item
    this.setRepackFlag();
  }

  /**
   * [async description]
   *
   * @param   {string[]}  textureKey  [textureKey description]
   *
   * @return  {[]}                    [return description]
   */
  public async addFrame(textureKey: string | string[], ignoreExistingFrame = false) {
    if (!(textureKey instanceof Array)) {
      textureKey = [textureKey];
    }

    for (let i = 0; i < textureKey.length; i++) {
      const currentFrame = textureKey[i];
      if (!currentFrame || (!ignoreExistingFrame && this.frames[currentFrame])) {
        continue;
      }
      // set this frame to render nothing at first - when it's loaded it will automatically update
      this.maybeRegisterEmptyFrame(currentFrame);

      // load `textureKey` as an image/texture
      try {
        await asyncLoader(currentFrame, this.scene.load.image(currentFrame, currentFrame));
      } catch (err) {
        continue;
      }

      this.trimFrame(currentFrame);

      // get its dimensions (somehow..)
      const img = this.scene.textures.getFrame(currentFrame);
      const imgTexture = this.scene.textures.get(currentFrame);

      const trimFraming = this.trimFrame(currentFrame);
      if (trimFraming) {
        img.setTrim(
          img.cutWidth,
          img.cutHeight,
          trimFraming.x,
          trimFraming.y,
          trimFraming.trimmedWidth,
          trimFraming.trimmedHeight,
        );
        // img.updateUVs();
      }

      const dimensions = {
        width: img.width,
        height: img.height,
        trim: trimFraming,
      };

      // add this to the render texture
      this.packNewFrame(currentFrame, dimensions);

      // remove the texture now that it's in the RT
      this.scene.textures.remove(imgTexture);
    }
  }

  /**
   * Ensures there is at least this many pixels between frames.
   * (Gaps in the atlas may mean that there are more than `framePadding` pixels in some cases.)
   */
  private framePadding = 4;

  private cursor?: Phaser.GameObjects.Rectangle;
  private packNewFrame = (
    key: string,
    dimensions: {
      width: number;
      height: number;
      trim: null | {
        x: number;
        y: number;
        originalWidth: number;
        originalHeight: number;
        trimmedWidth: number;
        trimmedHeight: number;
      };
    },
  ) => {
    const packedFrame = dimensions?.trim
      ? this.packer.packOne(
          dimensions.trim.trimmedWidth + this.framePadding,
          dimensions.trim.trimmedHeight + this.framePadding,
          key,
        )
      : this.packer.packOne(
          dimensions.width + this.framePadding,
          dimensions.height + this.framePadding,
          key,
        );

    if (!packedFrame) {
      console.warn("Could not pack new frame with key: " + key);
      return;
    }

    const halfPadding = (this.framePadding / 2) | 0;
    this.frames[key] = new Phaser.Geom.Rectangle(
      packedFrame.x,
      packedFrame.y,
      packedFrame.width - halfPadding,
      packedFrame.height - halfPadding,
    );

    // if `this.rt`'s dimensions do not contain the total packed rects determined above,
    if (this.rt.width < this.packer.width || this.rt.height < this.packer.height) {
      // use `this.resizeTexture()` to increase the texture (by double? the exact amount??)
      this.resizeTexture(this.packer.width, this.packer.height);
    }

    // When drawing to the RT, we still need to take trim into account
    // (The texture at `key` has not been modified - we've only examined it for transparency.)
    const trimX = dimensions?.trim?.x || 0;
    const trimY = dimensions?.trim?.y || 0;
    this.rt.draw(key, packedFrame.x - trimX, packedFrame.y - trimY);

    // The frame itself here already takes the trim and everything into account,
    // so we can insert it "as-is".
    const existingFrame = this.rt.texture.get(key);
    if (existingFrame) {
      existingFrame.setSize(packedFrame.width, packedFrame.height, packedFrame.x, packedFrame.y);
    } else {
      this.rt.texture.add(
        key,
        0,
        packedFrame.x,
        packedFrame.y,
        packedFrame.width,
        packedFrame.height,
      );
    }

    this.scene.textures.remove(key);

    // Ensure repacks now that we've added a new item
    this.setRepackFlag();
  };

  private requiresRepack = false;

  private maybeRegisterEmptyFrame(frame: string) {
    const existingFrame = this.rt.texture.has(frame);
    if (existingFrame) {
      return;
    }

    this.frames[frame] = new Phaser.Geom.Rectangle(0, 0, 1, 1);
    this.rt.texture.add(frame, 0, 0, 0, 1, 1);
  }

  /**
   * heavy!
   *
   * uses binpacking on the registered frames and then redraws the underlying render texture for optimal sizing
   */
  public repack() {
    // This has already been repacked before
    if (!this.requiresRepack) {
      return this;
    }

    // Use existing frames in memory
    const items = Object.keys(this.frames)
      // Convert them to a simple format for the packer
      .map((key) => ({
        width: this.frames[key]?.width || 0,
        height: this.frames[key]?.height || 0,
        id: key,
      }))
      // Sort by taller -> shorter (and wider -> thinner) for a more compact layout
      .sort((a, b) => {
        if (a.height === b.height) {
          return a.width < b.width ? 1 : -1;
        }
        return a.height < b.height ? 1 : -1;
      });

    // Pack!
    this.packer = new ShelfPack(1, 1, true);
    const packed = this.packer.pack(items);

    // Preserve the state as we will transfer the current frame data
    this.preserveTextureState();

    // `this.rt.resize()` to match `packed`'s dimensions (this clears the RT)
    // note we're NOT calling `this.resizeTexture` and instead directly manipulating the texture
    this.rt.clear();
    this.rt.resize(this.packer.width, this.packer.height);

    // clear frames
    this.frames = {};

    // loop through each packed rect,
    for (const rect of packed) {
      const { id, x, y } = rect;
      // and draw the preserved frame at the _new_ rect position
      this.drawPreservedFrame(id, x, y);

      this.frames[id.toString()] = new Phaser.Geom.Rectangle(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );

      // Add frame to RT
      let frame = this.rt.texture.get(id);
      if (!frame) {
        frame = this.rt.texture.add(id.toString(), 0, rect.x, rect.y, rect.width, rect.height);
      }

      // frame.setTrim(rect.width, rect.height, 0, 0, rect.width, rect.height);
      frame.setSize(rect.width, rect.height, rect.x, rect.y);
    }

    // finally, free the preserved state entirely
    this.freePreservedState();

    // Update `repack` flag to track if any changes are ever made here
    this.clearRepackFlag();

    return this;
  }

  private setRepackFlag = () => {
    this.requiresRepack = true;
  };
  private clearRepackFlag = () => {
    this.requiresRepack = false;
  };

  /**
   * resizes the internal texture, ensuring image data remains the same afterwards
   */
  private resizeTexture = (width: number, height: number) => {
    this.preserveTextureState();
    this.rt.clear();
    this.rt.resize(width, height);
    this.restoreTextureState();
    this.freePreservedState();
  };

  /**
   * [getBackbuffer description]
   */
  private getBackbuffer = () => {
    if (!this.backbuffer) {
      this.backbuffer = this.scene.add.renderTexture(0, 0, 100, 100).setVisible(false);
      this.backbuffer.fill(0xff0000);

      this.backbuffer.saveTexture(this.backbufferKey());
    }
    return this.backbuffer;
  };

  /**
   * makes a copy of the current internal texture data, preserving registered frame information
   */
  private preserveTextureState = () => {
    // create backbuffer if needed
    const bb = this.getBackbuffer();

    // resize backbuffer to match this.rt
    bb.resize(this.rt.width, this.rt.height);

    // draw this.rt to backbuffer
    bb.draw(this.rt, 0, 0, 1);

    // copy all of `this.rt`'s frames over to the backbuffer
    const ogFrameNames = this.rt.texture.getFrameNames();
    for (const frameName of ogFrameNames) {
      const frame = this.frames[frameName];
      if (!frame) {
        continue;
      }

      // Free any previous frame with this same name
      if (bb.texture.has(frameName)) {
        bb.texture.remove(frameName);
      }
      bb.texture.add(frameName, 0, frame.x, frame.y, frame.width, frame.height);
    }
  };

  /**
   * [restoreTextureState description]
   */
  private restoreTextureState = () => {
    // if no backbuffer, exit
    if (!this.backbuffer) {
      return;
    }

    // draw backbuffer to this.rt
    this.rt.draw(this.backbuffer);

    // clear/resize/free backbuffe
    this.freePreservedState();
  };

  /**
   * [freePreservedState description]
   */
  private freePreservedState = () => {
    // if no backbuffer, exit
    if (!this.backbuffer) {
      return;
    }
    this.backbuffer.resize(0, 0);
    this.backbuffer.clear();

    // Remove any applied texture frames to free memory
    const existingFrames = this.backbuffer.texture.getFrameNames();
    for (const frame of existingFrames) {
      this.backbuffer.texture.remove(frame);
    }

    // destroy backbuffer? maybe? check perf to see if it's worth it to pool this instance
  };

  /**
   * [drawPreservedFrame description]
   *
   * @param   {string}  key  [key description]
   * @param   {number}  x    [x description]
   * @param   {number}  y    [y description]
   *
   * @return  {[type]}       [return description]
   */
  private drawPreservedFrame = (key: string | number, x: number, y: number) => {
    // if no backbuffer, exit/warn
    if (!this.backbuffer) {
      return;
    }
    // if no `key` on backbuffer's frames, exit/warn
    const frame = this.backbuffer.texture.get(key);
    if (!frame) {
      console.warn('no preserved frame "' + key + '"');
      return;
    }
    // use drawFrame to draw the backbuffer's key to `x,y` on `this.rt`
    this.rt.drawFrame(this.backbufferKey(), key, x, y);
  };

  /**
   * [serializeFrames description]
   */
  private serializeFrames = () => {
    return Object.keys(this.frames).reduce<{
      [imageUrl: string]: {
        width: number;
        height: number;
        x: number;
        y: number;
      };
    }>((acc, frameUrl) => {
      const frame = this.frames[frameUrl];
      if (!frame) {
        return acc;
      }
      acc[frameUrl] = {
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
      };
      return acc;
    }, {});
  };

  /**
   * [deserializeFrames description]
   *
   * @param   {[type]}  incomingFrames  [incomingFrames description]
   *
   * @return  {[type]}                  [return description]
   */
  private deserializeFrames = (incomingFrames: {
    [imageUrl: string]: {
      width: number;
      height: number;
      x: number;
      y: number;
    };
  }) => {
    return Object.keys(incomingFrames).reduce<typeof this.frames>((acc, frameUrl) => {
      const frame = incomingFrames[frameUrl];
      if (!frame) {
        return acc;
      }
      acc[frameUrl] = new Phaser.Geom.Rectangle(frame.x, frame.y, frame.width, frame.height);
      return acc;
    }, {});
  };

  /**
   * [exportData description]
   */
  public exportSerializedData = async (): Promise<SerializedAtlas> => {
    // this.repack();

    const imgDataSource = this.rt.texture.getSourceImage();
    let url;
    if (imgDataSource instanceof HTMLCanvasElement) {
      if (!this.trimCanvas) {
        this.trimCanvas = this.rt.scene.textures.createCanvas(
          "trim canvas",
          this.rt.width,
          this.rt.height,
        );
      } else {
        this.trimCanvas.setSize(this.rt.width, this.rt.height);
      }

      this.trimCanvas.draw(0, 0, imgDataSource);
      url = this.trimCanvas.canvas.toDataURL();
      url = imgDataSource.toDataURL();

      this.trimCanvas.setSize(1, 1);
      this.trimCanvas.clear();
    } else {
      throw new Error("WebGL serialization not yet supported!");
    }

    return {
      frames: this.serializeFrames(),
      image: url,
      packerData: JSON.stringify(this.packer),
    };
  };

  /**
   * [importExistingAtlas description]
   */
  public importExistingAtlas = async (
    frames: {
      [imageUrl: string]: {
        width: number;
        height: number;
        x: number;
        y: number;
      };
    },
    imageUri: string,
    packerData: string,
  ) => {
    const key = this.textureKey + "-import-" + Math.random();
    this.frames = this.deserializeFrames(frames);

    for (const frameUrl in this.frames) {
      const frame = this.frames[frameUrl];
      if (!frame) {
        continue;
      }
      this.rt.texture.add(frameUrl, 0, frame.x, frame.y, frame.width, frame.height);
    }

    const incomingPacker = JSON.parse(packerData);
    this.packer = new ShelfPack(1, 1, true);
    for (const key in incomingPacker) {
      if (key === "shelves") {
        for (let i = 0; i < incomingPacker[key].length; i++) {
          const incomingShelf = incomingPacker[key][i];
          const shelf = new Shelf(incomingShelf.y, incomingShelf.width, incomingShelf.height);
          shelf.free = incomingShelf.free;
          shelf.x = incomingShelf.x;
          this.packer.shelves.push(shelf);
        }
      }
    }

    this.scene.textures.addBase64(key, imageUri);

    return new Promise<void>((res, rej) => {
      this.scene.textures.on(
        Phaser.Textures.Events.LOAD,
        (key: string, texture: Phaser.Textures.Texture) => {
          // Phaser vaguely types `texture.frames` as `object`. We augment the types here accordingly.
          // eslint-disable-next-line
          const textureFrames = texture.frames as {
            [key: string]: Phaser.Textures.Frame;
          };

          const frame = textureFrames[texture.firstFrame];
          if (!frame) {
            rej("LiveAtlas : could not find base frame when importing texture!");
            return;
          }

          // Scale the render texture and populate it with graphics
          this.rt.clear();
          this.rt.resize(frame.width, frame.height);
          this.rt.draw(key, 0, 0, 1);

          // Remofve the base64 texture since it's now in the RT
          this.scene.textures.remove(key);
          this.setRepackFlag();

          res();
        },
      );
    });
  };

  /**
   * [showDebugTexture description]
   */
  public showDebugTexture = async () => {
    const data = await this.exportSerializedData();
    const src = data.image;
    const img = new Image();
    img.src = src;
    document.body.appendChild(img);
  };

  /**
   * Use this to ensure the texture has a crisp appearance when scaled/zoomed.
   * By default, this is `false`, meaning the atlas texture is rendered in a smoother fashion.
   */
  public setPixelArt = (isPixelArt: boolean) => {
    this.rt.texture.setFilter(
      isPixelArt ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR,
    );
    return this;
  };

  // -----------------------------------------------------------------------------------------------

  /**
   * Factory functions to create new Images, Sprites, etc.
   *
   * All functions return native Phaser classes and are simply just a means for easy integration
   * with this LiveAtlas.
   */
  public make = {
    image: (x: number, y: number, frame: string): Phaser.GameObjects.Image => {
      // Register `frame` as a texture on this frame immediately
      // (This prevents `frame missing` warnings in console.)
      this.maybeRegisterEmptyFrame(frame);

      // The actual image to be returned. Note at this point the frame is either loaded or pointing
      // at a 1x1 transparent pixel.
      const img = this.scene.add.image(x, y, this.textureKey, frame);

      // Actually load the frame - if necessary - and then ensure that `img` has proper sizing/orientation.
      this.addFrame(frame, true).then(function () {
        img.setSizeToFrame(img.frame);
        img.setOriginFromFrame();
      });

      return img;
    },
  } as const;

  /**
   * Serialization functions to export data and save it to the local machine.
   */
  public save = {
    /**
     * Exports the current atlas to a JSONified string containing:
     *  - All placed `frames` in the atlas
     *  - The data URI string of the atlas image
     *  - The relevant atlas state needed for re-use when imported later
     *
     * Note that as a result of containing the stringified image, this string can become quite heavy!
     * If you're trying to save this string to the user's computer, be sure to use `save.toBrowserStorage`
     * as this will take care of handling size constraints for you.
     */
    toJSON: async () => {
      return await this.exportSerializedData();
    },

    /**
     * Exports the current atlas to a JSON string (via `save.toJSON`) and stores it in `localStorage`.
     * Optionally, pass `true` as the second argument and `sessionStorage` will be used instead.
     */
    toLocalStorage: async (storageKey: string = this.textureKey, useSessionStorage = false) => {
      const atlas = await this.save.toJSON();
      const json = JSON.stringify(atlas);
      const estSizeBytes = json.length * 2; // 2 bytes per UTF-16 character
      if (estSizeBytes >= 5_000_000) {
        const humanReadableSize = convertBytesToHumanReadable(estSizeBytes);
        const seshType = useSessionStorage ? "session" : "local";
        // LocalStorage has a 5mb limit
        throw new Error(
          `Could not save atlas to ${seshType} storage - size exceeds 5mb! (${humanReadableSize})`,
        );
      }

      const setItem = useSessionStorage
        ? sessionStorage.setItem.bind(sessionStorage)
        : localStorage.setItem.bind(localStorage);
      setItem(storageKey, json);
    },

    /**
     * Exports the current atlas to a JSON string (via `save.toJSON`) and stores it in `IndexedDB`.
     * This is necessary when saving atlas data greater than 5mb
     */
    toIndexedDB: async (storageKey: string = this.textureKey) => {
      // Serialize the data to strings
      const data = await this.save.toJSON();
      // Save the data as a `Blob` to indexeddb. (This allows us to store files of 500+ mb)
      await LocalBlobCache.saveBlob(storageKey, data);
    },

    /**
     * Exports the current atlas and saves it to the local browser in either `localStorage` or `IndexedDB`,
     * depending on the filesize of the serialized atlas.
     */
    toBrowserStorage: async (storageKey: string = this.textureKey) => {
      // Remove any prior values saved to this browser.
      // The reason this happens is because an atlas can change size, and multiple `toBrowserStorage`
      // calls could lead to outdated data lingering behind in IDB.
      await this.storage.freeStoredData(storageKey);

      // Attempt localStorage first, then IDB.
      try {
        await this.save.toLocalStorage(storageKey);
      } catch (err1) {
        // LocalStorage failed - probably because of the 5mb filesize limit
        try {
          await this.save.toIndexedDB(storageKey);
        } catch (err2) {
          // Both failed!
          throw new Error("Could not save to local file system! " + err1 + " \n" + err2);
        }
      }
    },
  } as const;

  /**
   * Deserialization functions to load atlases that were stored on the local machine.
   * Note these functions **replace the current contents of this atlas.**
   *
   * If you want to add frames to an existing atlas, use `this.addFrame([...])` instead.
   */
  public load = {
    /**
     * Given a serialized atlas string, parses and imports the contents into the current atlas.
     * Note this operation **overwrites the existing atlas**. If you want to add frames to an existing
     * atlas, use `this.addFrame([...])` instead.
     */
    fromJSON: async (json: string) => {
      let parsedData: SerializedAtlas | undefined;
      try {
        parsedData = JSON.parse(json);
        if (!parsedData || !parsedData.frames || !parsedData.image) {
          return false;
        }
      } catch (err) {
        return false;
      }

      console.log('import existing..', parsedData);
      try {
        await this.importExistingAtlas(parsedData.frames, parsedData.image, parsedData.packerData);
        this.setRepackFlag();
      } catch (err) {
        return false;
      }

      return true;
    },
    /**
     * Searches `localStorage` for the given atlas key and imports it, replacing the current contents
     * of this atlas.
     *
     * Optionally, pass `true` as the second argument and `sessionStorage` will be used instead.
     */
    fromLocalStorage: async (storageKey: string = this.textureKey, useSessionStorage = false) => {
      const lookup = useSessionStorage
        ? sessionStorage.getItem.bind(sessionStorage)
        : localStorage.getItem.bind(localStorage);

      const existingJSON = lookup(storageKey);
      if (!existingJSON) {
        return false;
      }

      return this.load.fromJSON(existingJSON);
    },
    /**
     * Searches `IndexedDB` for the given atlas key and imports it, replacing the current contents
     * of this atlas.
     */
    fromIndexedDB: async (storageKey: string = this.textureKey) => {
      const data = await LocalBlobCache.loadBlob(storageKey);
      if (!data || data instanceof Blob) {
        // Data should not be a Blob, as we always store strings for this atlas data.
        return false;
      }
      return this.load.fromJSON(data);
    },

    /**
     * Checks the browser's storage for saved atlas data (in either localStorage or IndexedDB).
     * The current atlas will have its contents automatically updated accordingly.
     */
    fromBrowserStorage: async (storageKey: string = this.textureKey) => {
      let localResult;
      try {
        // We'll track if this load was fruitful - if so, we don't try to load from IDB.
        // If it returns `false` then we just will step over to IDB and
        localResult = await this.load.fromLocalStorage(storageKey);
      } catch (err) {
        // LocalStorage failed - probably because of the 5mb filesize limit
      }

      if (localResult) {
        return;
      }

      if (!localResult) {
        try {
          await this.load.fromIndexedDB(storageKey);
        } catch (err) {
          // Both failed!
        }
      }
    },
  } as const;

  /**
   * Utility functions relating to on-device storage for serialized atlases
   */
  public storage = {
    /**
     * Queries the browser to determine how much storage space is still available for IndexedDB.
     *
     * Note these values reflect the _browser's_ overall storage capability, and NOT what is
     * currently only in use by this LiveAtlas.
     *
     * If you want to know the size of _this_ atlas, use `storage.getStoredByteSize` instead.
     */
    getQuotaEstimate: async () => {
      const spaceUsed = await navigator.storage.estimate();
      const ratio = (spaceUsed.usage || 0) / (spaceUsed.quota || 0.1);

      return {
        usedSize: spaceUsed.usage,
        maxSize: spaceUsed.quota,
        percent: ratio,
      };
    },

    /**
     * Returns how much data is currently being stored by this atlas.
     * Note that this measures the _stored_ data and will return `0` if no data has not yet been saved.
     */
    getStoredSize: async (storageKey: string = this.textureKey) => {
      const data = await LocalBlobCache.loadBlob(storageKey);
      if (!data) {
        return 0;
      }
      if (data instanceof Blob) {
        return data.size;
      }
      return data.length * 2; // 2 bytes per UTF-16 character
    },

    /**
     * Returns the stored size of the given atlas key in human-readable terms.
     * ex: "100 Bytes", "1.0 KB", "117.7 MB" etc
     */
    getHumanByteSize: async (storageKey: string = this.textureKey) => {
      const bytes = await this.storage.getStoredSize(storageKey);
      return convertBytesToHumanReadable(bytes);
    },

    /**
     * Frees any stored data associated with the given storage key.
     * This wipes out the browser's local, session, and IDB storages.
     */
    freeStoredData: async (storageKey = this.textureKey) => {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
      await LocalBlobCache.freeBlob(storageKey);
    },
  } as const;
}
