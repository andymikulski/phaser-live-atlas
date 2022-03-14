import { trimImageEdges } from "./lib/imageTrimming";
import { loadIntoPhaser as asyncLoader } from "./lib/asyncLoader";
// import { Atlas } from "./AtlasTypes";
import LocalBlobCache from "./lib/LocalBlobCache";
import ShelfPack, { Shelf } from "./lib/ShelfPack";

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
  private backbuffer: Phaser.GameObjects.RenderTexture;
  private eraserCursor: Phaser.GameObjects.Rectangle;

  private packer = new ShelfPack(1, 1, true);

  public get texture(): Phaser.GameObjects.RenderTexture {
    return this.rt;
  }
  public set texture(v: Phaser.GameObjects.RenderTexture) {
    this.rt = v;
  }

  constructor(public scene: Phaser.Scene, public id: string) {
    this.rt = scene.make.renderTexture({ width: 1, height: 1 });
    this.rt.saveTexture("live-atlas-" + id);

    this.eraserCursor = scene.add
      .rectangle(0, 0, 1, 1, 0xffffff, 1)
      .setVisible(false);

    (window as any).debugRT = this.showDebugTexture;
  }

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
  private getImageDataFromSource = (
    src: HTMLImageElement | HTMLCanvasElement
  ) => {
    if (!this.trimCanvas) {
      this.trimCanvas = this.rt.scene.textures.createCanvas(
        "trim canvas",
        src.width,
        src.height
      );
    } else {
      this.trimCanvas.setSize(src.width, src.height);
    }

    this.trimCanvas.draw(0, 0, src);
    return this.trimCanvas
      .getContext()
      .getImageData(0, 0, src.width, src.height);
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
        console.log("no current frame index", currentFrame, frame, i);
        continue;
      }
      const frameRect = this.frames[currentFrame];
      if (!frameRect) {
        console.log("no frame found", currentFrame, this.frames);
        return;
      }
      delete this.frames[currentFrame];
      if (!immediately) {
        console.log("remove frame but not now");
        return;
      }

      console.log("removing...", frameRect, this.packer.bins);
      // if we're immediately removing this from the texture, we need to actually erase the image data
      // and the frame. (This happens 'passively' when `repack` is called.)
      this.eraserCursor.setPosition(frameRect.x, frameRect.y);
      this.eraserCursor.setOrigin(0, 0);
      this.eraserCursor.setSize(frameRect.width, frameRect.height);
      this.rt.erase(this.eraserCursor);
      // this.rt.draw(this.eraserCursor);

      // Free space from the packer to be used in the future
      this.packer.unref(this.packer.getBin(currentFrame));
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
  public async addFrame(textureKey: string | string[]) {
    if (!(textureKey instanceof Array)) {
      textureKey = [textureKey];
    }

    for (let i = 0; i < textureKey.length; i++) {
      const currentFrame = textureKey[i];
      if (!currentFrame || this.frames[currentFrame]) {
        continue;
      }

      // load `textureKey` as an image/texture
      try {
        await asyncLoader(
          currentFrame,
          this.scene.load.image(currentFrame, currentFrame)
        );
      } catch (err) {
        console.log("Error loading frame..", currentFrame, err);
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
          trimFraming.trimmedHeight
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
    dimensions: null | {
      width: number;
      height: number;
      trim: {
        x: number;
        y: number;
        originalWidth: number;
        originalHeight: number;
        trimmedWidth: number;
        trimmedHeight: number;
      };
    }
  ) => {
    const packedFrame = dimensions?.trim
      ? this.packer.packOne(
          dimensions.trim.trimmedWidth + this.framePadding,
          dimensions.trim.trimmedHeight + this.framePadding,
          key
        )
      : this.packer.packOne(
          dimensions.width + this.framePadding,
          dimensions.height + this.framePadding,
          key
        );

    const halfPadding = (this.framePadding / 2) | 0;

    this.frames[key] = new Phaser.Geom.Rectangle(
      packedFrame.x,
      packedFrame.y,
      packedFrame.width - halfPadding,
      packedFrame.height - halfPadding
    );

    // if `this.rt`'s dimensions do not contain the total packed rects determined above,
    if (
      this.rt.width < this.packer.width ||
      this.rt.height < this.packer.height
    ) {
      // use `this.resizeTexture()` to increase the texture (by double? the exact amount??)
      this.resizeTexture(this.packer.width, this.packer.height);
    }

    // When drawing we still need to take trim into account
    // (The texture at `key` has not been modified - we've only examined it for transparency.)
    this.rt.draw(
      key,
      packedFrame.x - dimensions.trim.x,
      packedFrame.y - dimensions.trim.y
    );

    // The frame itself here already takes the trim and everything into account,
    // so we can insert it "as-is".
    this.rt.texture.add(
      key,
      0,
      packedFrame.x,
      packedFrame.y,
      packedFrame.width,
      packedFrame.height
    );

    this.scene.textures.remove(key);

    // Ensure repacks now that we've added a new item
    this.setRepackFlag();
  };

  private requiresRepack = false;

  /**
   * heavy!
   *
   * uses binpacking on the registered frames and then redraws the underlying render texture for optimal sizing
   */
  public repack() {
    // This has already been repacked before
    if (!this.requiresRepack) {
      console.log("doesnt need repack, ignoring");
      return;
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
        rect.height
      );

      // Add frame to RT
      let frame = this.rt.texture.get(id);
      // console.log("putting frame...", rect.x, rect.y, rect.width, rect.height);
      if (!frame) {
        frame = this.rt.texture.add(
          id.toString(),
          0,
          rect.x,
          rect.y,
          rect.width,
          rect.height
        );
        console.log("frame added...", id.toString());
      }

      // frame.setTrim(rect.width, rect.height, 0, 0, rect.width, rect.height);
      frame.setSize(rect.width, rect.height, rect.x, rect.y);
    }

    // finally, free the preserved state entirely
    this.freePreservedState();

    // Update `repack` flag to track if any changes are ever made here
    this.clearRepackFlag();
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
    console.log("setting rt to size..", width, height);
    this.restoreTextureState();
    this.freePreservedState();
  };

  /**
   * [getBackbuffer description]
   */
  private getBackbuffer = () => {
    if (!this.backbuffer) {
      this.backbuffer = this.scene.add.renderTexture(0, 0, 100, 100);
      // .setOrigin(0, 0)
      // .setPosition(100, 100)
      // .setDepth(Infinity);
      // .setVisible(false);

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
    for (let i = 0; i < existingFrames.length; i++) {
      this.backbuffer.texture.remove(existingFrames[i]);
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
    return Object.keys(incomingFrames).reduce<typeof this.frames>(
      (acc, frameUrl) => {
        const frame = incomingFrames[frameUrl];
        if (!frame) {
          return acc;
        }
        acc[frameUrl] = new Phaser.Geom.Rectangle(
          frame.x,
          frame.y,
          frame.width,
          frame.height
        );
        return acc;
      },
      {}
    );
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
          this.rt.height
        );
      } else {
        this.trimCanvas.setSize(this.rt.width, this.rt.height);
      }

      this.trimCanvas.draw(0, 0, imgDataSource);
      url = this.trimCanvas.canvas.toDataURL();
      url = imgDataSource.toDataURL();
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
    packerData: string
  ) => {
    const key = this.textureKey + "-import-" + Math.random();
    this.frames = this.deserializeFrames(frames);

    console.log("adding frames to rt texture..");

    for (const frameUrl in this.frames) {
      const frame = this.frames[frameUrl];
      if (!frame) {
        continue;
      }
      this.rt.texture.add(
        frameUrl,
        0,
        frame.x,
        frame.y,
        frame.width,
        frame.height
      );
    }

    const incomingPacker = JSON.parse(packerData);
    this.packer = new ShelfPack(1, 1, true);
    for (const key in incomingPacker) {
      if (key === "shelves") {
        for (let i = 0; i < incomingPacker[key].length; i++) {
          const incomingShelf = incomingPacker[key][i];
          const shelf = new Shelf(
            incomingShelf.y,
            incomingShelf.width,
            incomingShelf.height
          );
          shelf.free = incomingShelf.free;
          shelf.x = incomingShelf.x;
          this.packer.shelves.push(shelf);
        }
      } else {
        (this.packer as any)[key] = incomingPacker[key];
      }
    }

    console.log("importing base64 image..");
    this.scene.textures.addBase64(key, imageUri);

    return new Promise<void>((res) => {
      this.scene.textures.on(
        Phaser.Textures.Events.LOAD,
        (key: string, texture: Phaser.Textures.Texture) => {
          console.log("inside texture load...");

          const frame = (
            texture.frames as { [key: string]: Phaser.Textures.Frame }
          )[texture.firstFrame];

          // Scale the render texture and populate it with graphics
          this.rt.clear();
          this.rt.resize(frame.width, frame.height);
          this.rt.draw(key, 0, 0, 1);

          // Remofve the base64 texture since it's now in the RT
          this.scene.textures.remove(key);
          this.setRepackFlag();

          res();
        }
      );
    });
  };

  /**
   * Serialize atlas and saves it to the local machine.
   * Uses IndexedDB under the hood, meaning space concerns shouldn't really be an issue.
   */
  public saveToLocalStorage = async () => {
    // Try to repack in case some space can be saved
    this.repack();

    // Serialize the data to strings
    const data = await this.exportSerializedData();

    // Save the data as a `Blob` to indexeddb. (This allow sus to store files of 500+ mb)
    await LocalBlobCache.saveBlob(this.textureKey, data);
  };

  /**
   * [loadFromLocalStorage description]
   */
  public loadFromLocalStorage = async () => {
    const data = await LocalBlobCache.loadBlob(this.textureKey);
    if (!data) {
      return;
    }

    if (data instanceof Blob) {
      // this should not happen
      return;
    }

    try {
      const parsedData: SerializedAtlas = JSON.parse(data);
      if (!parsedData || !parsedData.frames || !parsedData.image) {
        return;
      }
      await this.importExistingAtlas(
        parsedData.frames,
        parsedData.image,
        parsedData.packerData
      );
    } catch (err) {
      return;
    }

    this.setRepackFlag();
  };

  /**
   * Queries the browser to determine how much storage space is still available for IndexedDB.
   *
   * Note these values reflect the _browser's_ overall storage capability, and NOT what is
   * currently only in use by this LiveAtlas.
   *
   * If you want to know the size of _this_ atlas, use `getStoredByteSize` instead.
   */
  public async getStorageQuotaEstimates() {
    const spaceUsed = await navigator.storage.estimate();
    const ratio = (spaceUsed.usage || 0) / (spaceUsed.quota || 0.1);

    return {
      usedSize: spaceUsed.usage,
      maxSize: spaceUsed.quota,
      percent: ratio,
    };
  }

  /**
   * Returns how much data is currently being stored by this atlas.
   * Note that this measures the _stored_ data and will return `0` if no data has not yet been saved.
   */
  public async getStoredByteSize() {
    const data = await LocalBlobCache.loadBlob(this.textureKey);
    if (!data) {
      return 0;
    }
    if (data instanceof Blob) {
      return data.size;
    }
    return data.length;
  }

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
      isPixelArt
        ? Phaser.Textures.FilterMode.NEAREST
        : Phaser.Textures.FilterMode.LINEAR
    );
    return this;
  };
}
