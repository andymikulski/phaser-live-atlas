import { trimImageEdges, TrimInfo } from "./imageTrimming";
import { loadViaPhaserLoader, loadViaTextureManager } from "./phaserLoaders";
import LocalBlobCache from "./LocalBlobCache";
import ShelfPack, { Bin, Shelf } from "./ShelfPack";

const asyncYield = () => new Promise((res) => setTimeout(res, 0));

/**
 * Controller for writing to the user's IndexedDB. This allows us to store arbitrary blobs of data to
 * the machine's local storage without worrying about the ~5mb limit that comes with `localStorage`.
 */
const localCache = new LocalBlobCache("live-atlas");

/**
 * Given a number of bytes, returns a human-readable, simplified representation of the value.
 *
 * Examples:
 * ```
 * getHumanByteSize(100); // "100 Bytes"
 * getHumanByteSize(1024); // "1.0 KB"
 * getHumanByteSize(123456789); // "117.7 MB"
 * ```
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

/**
 * Format used for serialized JSON.
 * This is used primarily when saving/loading atlas data from the local browser.
 */
type SerializedAtlas = {
  frames: {
    [id: string]: { x: number; y: number; width: number; height: number; trim: null | TrimInfo };
  };
  image: string;
  packerData: string;
};

/**
 * Represents the dimensions needed for a given texture/frame in which all padding transparency is removed
 * but all meaningful pixel content remains. This is used when trimming incoming images before insertion
 * into an atlas.
 */
type TrimDimensions = {
  x: number;
  y: number;
  originalWidth: number;
  originalHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
};

// Arbitrary ID used for the LA's internal `canvas` used for image reading + manipulation
const scratchCanvasID = "live atlas scratch canvas";

/**
 * LiveAtlas - An on-the-fly spritesheet generator with support for serialization, repacking, and more!
 *
 *
 * ## Loading + Preloading Assets
 * ```ts
 * // Creation
 * this.liveAtlas = new LiveAtlas(this, "main");
 * this.liveAtlas.setPixelArt(true); // for crisp graphics (default: false)
 *
 * // Load a new frame (preloading)
 * this.liveAtlas.add.image(urlToFrameImage)
 * // Load many new frames at once
 * this.liveAtlas.add.imageList([url1, url2, url3..]);
 * ```
 *
 * ## Basic Usage
 * ```ts
 * // Create an image instance using an already loaded frame
 * this.liveAtlas.make.image(x, y, '/path/to/my-img.png');
 *
 * // Load + add image on the fly - without preloading. The returned `Image` will be sized at 1px
 * // by 1px until the image has been loaded, at which point it'll be resized and show the correct
 * // texture as expected.
 * const img = this.liveAtlas.make.image(x, y, '/some/other/url.png');
 *
 * // Later, if you want to replace an image with a different frame in the atlas (which may not have
 * // even been loaded yet):
 * this.liveAtlas.applyFrame('/a-third-url.png', img);
 * ```
 *
 * ## Spritesheets
 * ```ts
 * // There are two formats in which we can add a spritesheet into an atlas:
 *
 * // 1) By setting a frame height/width and allowing the atlas to slice up the frames for us
 * this.liveAtlas.add.spritesheet('my-spritesheet', '/path/to/sheet.png', {
 *   dimensions: {
 *     width: 32, // each frame is 32 px wide
 *     height: 64, // each frame is 64 px tall
 *   }
 * });
 *
 * // 2) Passing in a dictionary of `frameName -> { x, y, width, height }` defining each cell
 * this.liveAtlas.add.spritesheet('my-spritesheet', '/path/to/sheet.png', {
 *   frames: {
 *     'idle-south': {x: 0, y: 0, width: 32, height: 64},
 *     'idle-north': {x: 32, y: 0, width: 32, height: 64},
 *     'idle-west': {x: 64, y: 0, width: 32, height: 64},
 *     'idle-east': {x: 0, y: 32, width: 32, height: 64},
 *    }
 * });
 *
 * # TODO !! EXAMPLE OF USING A SPRITESHEET
 * ```
 *
 * ## Serialization
 * ```ts
 * // The atlas can also be serialized/imported (from localStorage, sessionStorage, or IndexedDB).
 * // Using `BrowserStorage` will select the best-suited storage location for data.
 * this.liveAtlas.save.toBrowserStorage();
 *
 * // You can also use `toJSON` if you want the serialized data yourself:
 * const serialized = this.liveAtlas.save.toJSON();
 * // serialized = {frames: [...], image: 'data:image/png;base64,...', packerData: '<packer state>'};
 *
 * // Using `load` will replace the current atlas with whatever has been serialized to the local machine.
 * this.liveAtlas.load.fromBrowserStorage();
 * ```
 */
export class LiveAtlas {
  /**
   * Amount (in pixels) of padding between each frame.
   * (This shouldn't be too high but enough to compensate for the lack of extrusion.)
   */
  private framePadding = 8;

  /**
   * Dictionary of image/frame URLs and their corresponding placement in the atlas.
   */
  private frames: {
    [frameKey: string]: {
      x: number;
      y: number;
      width: number;
      height: number;
      trim: null | TrimInfo;
    };
  } = {};

  /**
   * Dictionary of spritesheet URLs and the names of their subframes installed on this atlas.
   * This is used primarily when removing spritesheets - we need to remove all frames belonging
   * to this spritesheet, even though they are scattered throughout the atlas at this point.
   */
  private spriteFrames: { [spritesheetUrl: string]: string[] } = {};

  /**
   * The main RenderTexture for this atlas.
   * This reflects the current atlas in its entirety, and has an attached `Frame` for each image
   * or spritesheet inserted. This should never be destroyed, unless the atlas itself is destroyed.
   */
  private rt: Phaser.GameObjects.RenderTexture;

  /**
   * Spare RT used for temporarily holding and transferring data when i.e. resizing the main RT.
   * Don't address this directly; instead use `preserveTextureState`, `drawPreservedFrame`, and
   * `freePreservedState`.
   */
  private backbuffer?: Phaser.GameObjects.RenderTexture;

  /**
   * Cursor for erasing bits of the internal render texture.
   */
  private eraserCursor: Phaser.GameObjects.Rectangle;

  /**
   * The bin packer. Uses `shelf pack`, which is basically a `Next-fit decreasing-height` strip packing
   * algorithm. You can learn more on Wikipedia: https://archive.is/BlnP4
   */
  private packer = new ShelfPack(1, 1, true);

  /**
   * Flag to denote if this atlas has been modified and could stand to be repacked.
   * This is used to short-circuit `repack` if there is no work to be done.
   */
  private requiresRepack = false;

  // Getters for easy external access
  public get texture(): Phaser.Textures.Texture {
    return this.rt.texture;
  }
  public get renderTexture(): Phaser.GameObjects.RenderTexture {
    return this.rt;
  }
  public get textureKey(): string {
    return "live-atlas-" + this.id;
  }
  // Backbuffer is for internal use only
  private get backbufferKey(): string {
    return "live-atlas-backbuffer-" + this.id;
  }
  //---

  /**
   * Toggle the visibility of the compiled render texture so it appears in its parent scene.
   * This is primarily useful for debugging issues with the LiveAtlas. You can access the displayed
   * atlas via the `liveAtlas.renderTexture` property.
   */
  public setDebugVisible(visible: boolean) {
    this.rt.setVisible(visible);
    return this;
  }

  // ---- Standard lifecycle events

  constructor(public scene: Phaser.Scene, public id: string) {
    this.rt = scene.make.renderTexture({ width: 1, height: 1 }).setVisible(false);
    this.rt.saveTexture("live-atlas-" + id);

    this.eraserCursor = scene.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setVisible(false);
  }

  public destroy = (fromScene?: boolean) => {
    this.rt.destroy(fromScene);
    this.backbuffer?.destroy(fromScene);
    this.eraserCursor?.destroy(fromScene);
  };

  // ------
  /**
   * Has this frame been loaded into this atlas instance?
   */
  public hasFrame = (frame: string) => {
    return !!this.frames[frame];
  };

  // Cache image data from sources to ensure assets like sprites don't
  private cache = new WeakMap<HTMLImageElement | HTMLCanvasElement, ImageData>();

  private trimCanvas?: Phaser.Textures.CanvasTexture;

  /**
   * Returns the `ImageData` object containing the pixel data for the given image source.
   * This is used when trying to read from textures loaded into Phaser.
   */
  private getImageDataFromSource = (src: HTMLImageElement | HTMLCanvasElement): ImageData => {
    const existing = this.cache.get(src);
    if (existing) {
      return existing;
    }

    if (!this.trimCanvas) {
      this.trimCanvas = this.rt.scene.textures.createCanvas(scratchCanvasID, src.width, src.height);
    } else {
      this.trimCanvas.setSize(src.width, src.height);
    }

    this.trimCanvas.draw(0, 0, src);
    const trimData = this.trimCanvas.getContext().getImageData(0, 0, src.width, src.height);
    this.trimCanvas.setSize(1, 1);
    this.trimCanvas.clear();

    this.cache.set(src, trimData);
    return trimData;
  };

  /**
   * Given a texture (and an optional frame on that texture), returns the dimensions in which all
   * transparency has been trimmed and only actual pixel content remains.
   */
  private trimTransparency = (
    texture: string | Phaser.Textures.Texture,
    frameKey?: string,
  ): TrimDimensions => {
    const txt = typeof texture === "string" ? this.rt.scene.textures.get(texture) : texture;
    const src = txt.getSourceImage();
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
    let trim: null | TrimInfo = null;
    if (frameKey) {
      const frameData = txt.get(frameKey);
      trim = trimImageEdges(imgData, {
        x: frameData.cutX,
        y: frameData.cutY,
        width: frameData.cutWidth,
        height: frameData.cutHeight,
      });
    } else {
      trim = trimImageEdges(imgData);
    }

    // Return the trim if possible, else return a 0x0 framing
    return (
      trim || {
        x: 0,
        y: 0,
        originalWidth: 0,
        originalHeight: 0,
        trimmedWidth: 0,
        trimmedHeight: 0,
      }
    );
  };

  /**
   * only do this AFTER it's certain this frame isn't being used
   */
  public removeFrame(frame: string | string[], immediately = true) {
    if (!(frame instanceof Array)) {
      frame = [frame];
    }

    // We need to check if any of the incoming `frame`s are actually pointing to a spritesheet.
    // If so, we'll just add each of the spritesheet's frames to the list of frames to be removed.
    for (const url of frame) {
      const collection = this.spriteFrames[url];
      if (collection) {
        Array.prototype.push.apply(frame, collection);
        delete this.spriteFrames[url];
      }
    }

    // Step through each frame and remove it from memory.
    // If `immediately` has been flagged, it will also be erased from the RT.
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

      // `immediately` = erase from the RT at this time
      // (If this isn't flagged, `repack` will naturally remove these items later when invoked.)
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

    // Ensure repacks now that we've made space for new items
    this.setRepackFlag();
  }

  /**
   * Same as `addFrameByURL` but handles an input array of URLs/URIs.
   * Returns a promise which resolves only when all given URLs have loaded (or rejected their requests).
   *
   * For more information, see `addFrameByURL`.
   */
  private addMultipleFramesByURL = async (textureUrls: string[], force = false) => {
    // Convert list of URLs into promises, then wait for all of those promises to resolve
    const proms: Promise<void>[] = textureUrls.map((url) => this.addFrameByURL(url, url, force));
    return Promise.all(proms);
  };

  /**
   * Add a new frame to this atlas via URL address or data-URI. If you're trying to add new items to
   * this atlas, this is probably the function you want.
   *
   * By default, existing frames will not be overwritten. You can optionally pass `true` for the `force`
   * parameter to ignore this restriction and overwrite any previously registered frames.
   *
   * _Also see: `addMultipleFramesByURL` for handling an array of URLs/URIs._
   *
   *
   * This will:
   * - Make a network request to get the target texture
   * - Load the texture into Phaser
   * - Trim transparency from the image
   * - Pack the frame into the atlas
   * - Draw the new frame into the atlas accordingly
   */
  private addFrameByURL = async (textureKey: string, textureUrl?: string, force = false) => {
    textureUrl = textureUrl ?? textureKey;
    if (!textureUrl || (!force && (!textureKey || this.frames[textureKey]))) {
      return;
    }
    // set this frame to render nothing at first - when it's loaded it will automatically update
    this.maybeRegisterEmptyFrame(textureKey);

    // Check for data-uris
    const isDataURI = textureUrl.startsWith("data:image");

    // load `textureKey` as an image/texture
    try {
      if (isDataURI) {
        await loadViaTextureManager(this.scene, textureKey, textureUrl);
      } else {
        await loadViaPhaserLoader(textureKey, this.scene.load.image(textureKey, textureUrl));
      }
    } catch (err) {
      console.warn("Error loading image into atlas:", err);
      return; // stop processing frame, move to next
    }

    // get its dimensions
    const frame = this.rt.scene.textures.getFrame(textureKey);
    const imgTexture = this.rt.scene.textures.get(textureKey);

    if (!frame) {
      console.warn("LiveAtlas : no frame found after importing to Phaser!", textureKey);
      // this happens when multiple calls to `addFrame` for the same texture are called around the
      // same time the first call will resolve and delete the texture, the following calls will reach
      // this point and error out
      return;
    }

    const trimFraming = this.trimTransparency(textureKey);
    if (trimFraming?.trimmedWidth === 0) {
      // Trimmed down to nothing! Don't do anything else.
      return;
    }
    if (trimFraming) {
      frame.setTrim(
        trimFraming.originalWidth,
        trimFraming.originalHeight,
        trimFraming.x,
        trimFraming.y,
        trimFraming.trimmedWidth,
        trimFraming.trimmedHeight,
      );
    }

    const dimensions = {
      width: trimFraming?.trimmedWidth ?? frame.realWidth,
      height: trimFraming?.trimmedHeight ?? frame.realHeight,
      trim: trimFraming,
    };

    // fit this frame into the packer
    const bin = this.packNewFrame(textureKey, dimensions);
    if (bin) {
      // update the RT to handle the new frame stuff
      this.maybeResizeTexture();

      // When drawing to the RT, we still need to take trim into account
      // (The specified texture has not been modified - we've only examined it for transparency.)
      this.drawNewFrameToAtlas(dimensions, bin, textureKey);
    } else {
      console.warn("There was an error packing texture into atlas! " + textureKey);
    }

    // remove the texture now that it's in the RT
    this.scene.textures.remove(imgTexture);
  };

  /**
   * Adds an existing spritesheet to this atlas via URL address or data-URI. Use this if you want to
   * import a third-party tilesheet.
   *
   * If you're trying to import a serialized LiveAtlas, use the available `atlas.load` functions instead.
   *
   * This will:
   * - Make a network request to get the target texture
   * - Load the texture into Phaser
   * - Trim transparency from _each frame of the image_
   * - Pack all the new frames into the atlas
   * - Draw the new frames into the atlas accordingly
   */
  private addSpritesheetByURL = async (
    key: string,
    url: string,
    config: {
      frames?: { [frameName: string]: { x: number; y: number; width: number; height: number } };
      dimensions?: {
        width: number;
        height: number;
      };
    },
  ) => {
    if (this.frames[key]) {
      // Spritesheet already loaded - no work needs to be done
      return;
    }
    // Register this spritesheet key as an empty frame - this helps us track spritesheet presence.
    this.maybeRegisterEmptyFrame(key);

    // Check for data-uris
    const isDataURI = url.startsWith("data:image");
    // load `key` as an image/texture
    try {
      if (isDataURI) {
        await loadViaTextureManager(this.scene, key, url);
      } else {
        await loadViaPhaserLoader(key, this.scene.load.image(key, url));
      }
    } catch (err) {
      console.log("error loading image", err);
      return; // stop processing frame, move to next
    }

    // get its dimensions
    const frame = this.rt.scene.textures.getFrame(key);
    const imgTexture = this.rt.scene.textures.get(key);

    if (!frame) {
      console.warn("LiveAtlas: no frame found after importing to Phaser!", key);
      // this happens when multiple calls to `addFrame` for the same texture are called around the same time
      // the first call will resolve and delete the texture, the following calls will reach this point
      // and error out. TODO
      return;
    }

    let framesToProcess: { x: number; y: number; width: number; height: number; name: string }[] =
      [];

    if (config.frames) {
      // Named frames
      for (const name in config.frames) {
        const frame = config.frames[name];
        if (!frame) {
          continue;
        }
        framesToProcess.push({
          ...frame,
          name,
        });
      }
    } else if (config.dimensions) {
      // Frame dimensions - we need to slice the pieces ourselves
      const { width, height } = config.dimensions;
      const horizSlices = Math.ceil(frame.realWidth / width);
      const vertSlices = Math.ceil(frame.realHeight / height);

      // add a frame to process for each slice
      let idx = 0;
      for (let y = 0; y < vertSlices; y++) {
        for (let x = 0; x < horizSlices; x++) {
          framesToProcess.push({
            name: idx.toString(),
            x: x * width,
            y: y * height,
            width,
            height,
          });
          idx += 1;
        }
      }
    } else {
      // no spritesheet frames or dimensions provided
      return;
    }

    // Sort incoming frames for more optimal packing
    framesToProcess = framesToProcess.sort((a, b) => {
      if (a.height === b.height) {
        return a.width > b.width ? -1 : 1;
      }
      return a.height > b.height ? -1 : 1;
    });

    // Basic tracking var for conditionaly yielding when processing frames (see below)
    let strobe = true;

    // for each slice/image part,
    for (const incomingFrame of framesToProcess) {
      const frameKey = key + "-" + incomingFrame.name;

      // create a frame on the texture
      imgTexture.add(
        frameKey,
        0,
        incomingFrame.x,
        incomingFrame.y,
        incomingFrame.width,
        incomingFrame.height,
      );

      // Track that this frame belongs to this spritesheet. (This is used later if we end up entirely
      // removing this spritesheet from the atlas.)
      this.spriteFrames[key] = this.spriteFrames[key] || [];
      this.spriteFrames[key]?.push(frameKey);

      // Examine the image data and determine where the content actually lies in the frame
      // This is used to trim excess transparency from the image to optimally pack it in the atlas.
      const trimFraming = this.trimTransparency(imgTexture, frameKey);
      // TODO: Maybe ignore fully trimmed images?

      // Yield every other frame - this ensures that one large spritesheet doesn't prevent other things
      // from loading in tandem. (Each time this runs, the thread is "freed" and something else can
      // run for the rest of the frame.)
      strobe = !strobe;
      if (strobe) {
        await asyncYield();
      }

      // Apply trim to this frame so when we draw this frame we don't have to account for
      // extra whitespace/padding around the image
      const textureFrame = imgTexture.get(frameKey);
      if (trimFraming) {
        textureFrame.setTrim(
          incomingFrame.width,
          incomingFrame.height,
          trimFraming.x,
          trimFraming.y,
          trimFraming.trimmedWidth,
          trimFraming.trimmedHeight,
        );
      }

      // Dimensions for the frame that is about to be packed into the atlas
      // Note we need both width/height _and_ the trim - the trim is still used when _drawing_ the
      // image to the RT.
      const dimensions = {
        width: trimFraming?.trimmedWidth ?? textureFrame.realWidth,
        height: trimFraming?.trimmedHeight ?? textureFrame.realHeight,
        trim: trimFraming,
      };

      // fit this frame into the packer, now that it's been trimmed and prepared
      const bin = this.packNewFrame(frameKey, dimensions);

      if (!bin) {
        // This happens when the packer has hit its maximum dimensions
        // (which means we have hit the user's max texture size and need to create another RT)
        console.warn("There was an issue adding spritesheet frame to atlas! " + frameKey);
        continue;
      }

      // update the RT to handle the new frame stuff
      this.maybeResizeTexture();

      // When drawing to the RT, we still need to take trim into account
      // (The specified texture has not been modified - we've only examined it for transparency.)
      this.drawNewFrameToAtlas(dimensions, bin, frameKey, textureFrame);
    }

    // remove the texture now that it's in the RT
    this.scene.textures.remove(imgTexture);
  };

  /**
   * Given a frame key and dimensions for that frame, packs it into the existing atlas.
   * The atlas may need to resize - which it will handle automatically - and afterward will flag
   * itself as being in need of repacking.
   */
  private packNewFrame = (
    frameKey: string,
    dimensions: {
      width: number;
      height: number;
      trim: null | TrimInfo;
    },
  ) => {
    // Note that these dimensions have `framePadding` added - this is to ensure that when the
    // rect is passed into the packer, padding is automatically found/added accordingly.
    // This is undone afterward to ensure that the frame reflects the content area.
    const packedFrame = dimensions?.trim
      ? this.packer.packOne(
          dimensions.trim.trimmedWidth + this.framePadding,
          dimensions.trim.trimmedHeight + this.framePadding,
          frameKey,
        )
      : this.packer.packOne(
          dimensions.width + this.framePadding,
          dimensions.height + this.framePadding,
          frameKey,
        );

    if (!packedFrame) {
      // This happens when the packer has hit its maximum dimensions
      // (which means we have hit the user's max texture size and need to create another RT)
      console.warn("Could not pack new frame with key: " + frameKey);
      return;
    }

    // Remove frame padding from the final rect so our frame isn't larger than its content
    const halfPadding = (this.framePadding / 2) | 0;
    this.frames[frameKey] = {
      x: packedFrame.x,
      y: packedFrame.y,
      width: packedFrame.width - halfPadding,
      height: packedFrame.height - halfPadding,
      trim: dimensions.trim ?? null,
    };

    return packedFrame;
  };

  /**
   * Compares the current texture sizes with the packer's dimensions, and resizes the texture
   * if necessary. This is called when importing a new image, before calling `drawNewFrameToAtlas`.
   */
  private maybeResizeTexture() {
    // if `this.rt`'s dimensions do not contain the total packed rects determined above,
    if (this.rt.width < this.packer.width || this.rt.height < this.packer.height) {
      // use `this.resizeTexture()` to increase the texture (by double? the exact amount??)
      this.resizeTexture(this.packer.width, this.packer.height);
    }
  }

  /**
   * Takes data for a new frame and inserts it into the render texture.
   */
  private drawNewFrameToAtlas(
    dimensions: {
      width: number;
      height: number;
      trim: null | TrimInfo;
    },
    packedFrame: Bin,
    key: string,
    frame?: Phaser.Textures.Frame,
  ) {
    const trimX = dimensions?.trim?.x ?? 0;
    const trimY = dimensions?.trim?.y ?? 0;
    const originalWidth = dimensions?.trim?.originalWidth ?? packedFrame.width;
    const originalHeight = dimensions?.trim?.originalHeight ?? packedFrame.height;

    const trimmedWidth = dimensions?.trim?.trimmedWidth ?? packedFrame.width;
    const trimmedHeight = dimensions?.trim?.trimmedHeight ?? packedFrame.height;
    this.rt.draw(frame || key, packedFrame.x - trimX, packedFrame.y - trimY);

    // The frame itself here already takes the trim and everything into account,
    // so we can insert it "as-is".

    // We may have a frame in hand already, or there may be one that already exists on this atlas.
    // We need to update this frame to reflect the new sizing/trim. If we don't do this, `make.image`
    // etc will not show images due to a race condition and the need to resize the frame after applying.
    const existingFrame = frame || this.rt.texture.get(key);
    if (existingFrame) {
      existingFrame
        .setSize(
          packedFrame.width - this.framePadding,
          packedFrame.height - this.framePadding,
          packedFrame.x,
          packedFrame.y,
        )
        .setTrim(originalWidth, originalHeight, trimX, trimY, trimmedWidth, trimmedHeight);
    }

    // For some reason (?? TODO) animations require new frames to be added, and checking the existence
    // of a frame doesn't seem to be the right condition to check - either there is an error when adding
    // a spritesheet, or existing objects don't update/resize correctly. Weird.
    const newFrame = this.rt.texture.add(
      key,
      0,
      packedFrame.x,
      packedFrame.y,
      packedFrame.width - this.framePadding,
      packedFrame.height - this.framePadding,
    );

    // This new frame _may_ not have been added; it will be `null` if `rt.texture` already has `key`
    if (newFrame) {
      // Same operation as above: update size, position, and trim
      newFrame
        .setSize(
          packedFrame.width - this.framePadding,
          packedFrame.height - this.framePadding,
          packedFrame.x,
          packedFrame.y,
        )
        .setTrim(originalWidth, originalHeight, trimX, trimY, trimmedWidth, trimmedHeight);
    }

    // Ensure repacks now that we've added a new item
    this.setRepackFlag();
  }

  /**
   * Given a frame name, _maybe_ adds it to the atlas. If the frame already exists, nothing happens.
   * If the frame does NOT exist, then a new 1px by 1px frame is added to the texture.
   */
  private maybeRegisterEmptyFrame(frame: string) {
    const existingFrame = this.rt.texture.has(frame);
    if (existingFrame) {
      return;
    }

    this.frames[frame] = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      trim: null,
    };

    this.rt.texture.add(frame, 0, 0, 0, 1, 1);
  }

  /**
   * Uses binpacking on the registered atlas frames and then redraws the render texture to use
   * the more optimal layout. Frames associated with the atlas are automatically updated accordingly
   * and any spare space is trimmed to reduce memory consumption.
   *
   * By default, `repack()` will check this atlas's repack flag to ensure that it actually needs to be
   * packed again. This helps reduce unnecessary work, but if you can optionally pass `true` and force
   * the repack to happen regardless of the flag status.
   */
  public repack = (force = false) => {
    // Ignore repacks, unless forced
    if (force === false && !this.requiresRepack) {
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
    const oldFrames = this.frames;
    this.frames = {};

    // loop through each packed rect,
    for (const rect of packed) {
      const { id, x, y } = rect;
      // and draw the preserved frame at the _new_ rect position
      this.drawPreservedFrame(id, x, y);
      const sId = id.toString();
      const incomingFrame = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        trim: oldFrames[sId]?.trim ?? null, // <-------------------------------------------------------
      };
      this.frames[sId] = incomingFrame;

      // Add frame to RT
      let frame = this.rt.texture.get(id);
      if (!frame) {
        frame = this.rt.texture.add(id.toString(), 0, rect.x, rect.y, rect.width, rect.height);
      }

      // We need to re-apply the frame trimming that was previously applied.
      // (Without this step, the repack _works_ but then images are displayed with incorrect offsets)
      frame
        .setSize(rect.width - this.framePadding, rect.height - this.framePadding, rect.x, rect.y)
        .setTrim(
          incomingFrame.trim?.originalWidth ?? rect.width,
          incomingFrame.trim?.originalHeight ?? rect.height,
          incomingFrame.trim?.x ?? 0,
          incomingFrame.trim?.y ?? 0,
          incomingFrame.trim?.trimmedWidth ?? rect.width,
          incomingFrame.trim?.trimmedHeight ?? rect.height,
        );
    }

    // finally, free the preserved state entirely
    this.freePreservedState();

    // Update `repack` flag to track if any changes are ever made here
    this.clearRepackFlag();

    return this;
  };

  /**
   * Mark that this atlas is due for a repack in the future.
   */
  private setRepackFlag = () => {
    this.requiresRepack = true;
  };

  /**
   * Mark that this atlas has already been packed and should not do anything if `repack()`
   * is called on this atlas.
   */
  private clearRepackFlag = () => {
    this.requiresRepack = false;
  };

  /**
   * Resizes the internal texture, ensuring image data remains the same afterwards.
   * This is mostly used when the atlas needs to grow to accommodate new frames.
   */
  private resizeTexture = (width: number, height: number) => {
    this.preserveTextureState();
    this.rt.clear();
    this.rt.resize(width, height);
    this.restoreTextureState();
    this.freePreservedState();
  };

  /**
   * Creates a `backbuffer` render texture, if necessary, and returns it.
   * This is used primarily for transferring texture state when we need to i.e. resize the
   * internal render texture.
   */
  private getBackbuffer = () => {
    if (!this.backbuffer) {
      this.backbuffer = this.scene.add.renderTexture(0, 0, 100, 100).setVisible(false);
      this.backbuffer.fill(0xff0000);

      this.backbuffer.saveTexture(this.backbufferKey);
    }
    return this.backbuffer;
  };

  /**
   * Makes a copy of the current internal texture data, preserving registered frame information,
   * and ensures the `backbuffer` is able to restore the current atlas image/state in future operations.
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
   * Transfers the `backbuffer` contents to the render texture of this atlas.
   * As a side effect, will call `freePreservedState` when complete in order to help keep memory usage low.
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
   * Clears any preserved state from the `backbuffer`, used when resizing the internal render texture.
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
  };

  /**
   * Given a frame `key` and a position to draw that frame, draws whatever is on the `backbuffer`
   * for onto the render texture for this atlas.
   *
   * Basically, the order of events is as such:
   * - `preserveTextureState();`
   * - `doSomeWork_and_clearRTandSuch();`
   * - `drawPreservedFrame('my-old-frame', x, y);` <---
   * - `freePreservedState();
   *
   * This function will take a previously preserved frame and draw it to the current atlas.
   * This is used when restoring a preserved atlas state - probably when resizing the RT.
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
    this.rt.drawFrame(this.backbufferKey, key, x, y);
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

  /**
   * Applies a frame from this atlas to the given Phaser object. Loads the frame into the atlas,
   * if necessary.
   *
   * Use this if you want to change the texture of an object that already exists.
   * If creating a new object, use `atlas.make.image(...)` instead.
   */
  public applyFrame = async (
    frame: string,
    toObject: Phaser.GameObjects.Components.Size &
      Phaser.GameObjects.Components.Origin &
      Phaser.GameObjects.Components.Texture,
  ) => {
    // Frame already exists; apply the texture/frame and exit
    if (this.hasFrame(frame)) {
      toObject.setTexture(this.textureKey, frame);
    }

    // Frame is not loaded/ready - load it into memory, apply it, and then resize the object to fit
    await this.addFrameByURL(frame);
    toObject.setTexture(this.textureKey, frame);
    this.sizeObjectToFrame(toObject);
  };

  private getAnimKey = (spritesheet: string, animName: string) => {
    return "atlas-" + this.id + "-" + spritesheet + "-" + animName;
  };

  /**
   * Resizes a given object to fit the current frame it is assigned to.
   * This also takes origin into account and ensures that the same anchor point persists after resizing.
   *
   * This is primarily used after `addFrame` resolves to ensure that atlas-based objects have the
   * correct dimensions applied based on whatever just loaded.
   */
  private sizeObjectToFrame(
    img: Phaser.GameObjects.Components.Size &
      Phaser.GameObjects.Components.Origin &
      Phaser.GameObjects.Components.Texture,
  ) {
    // Grab the current origins in case we need to put them back
    const imgOriginX = img.originX;
    const imgOriginY = img.originY;

    // Update the frame size to match the currently loaded texture
    img.setSizeToFrame(img.frame);

    // If the origin is still at -1, this means a dev has not called `setOrigin` on this image yet.
    // This means that we need to deterine the origin from the new frame size.
    if (imgOriginX === -1 && imgOriginY === -1) {
      img.setOriginFromFrame();
    } else {
      // If the origin is anything other than -1, we want to just re-apply the origin previously
      // set by the dev. This effectively means the frame will scale to the correct size, but the
      // given `img` will still obey the last `setOrigin` call.
      img.setOrigin(imgOriginX, imgOriginY);
    }
  }

  /**
   * Serializes all of the relevenat bits of information to restore an Atlas, and returns a POJO containing
   * the data. This data is later converted into a JSON string and stored in browser storage (or to disk).
   */
  private exportSerializedData = async (): Promise<SerializedAtlas> => {
    const imgDataSource = this.rt.texture.getSourceImage();
    let url;

    /**
     * Canvas rendering ---
     * Uses a temporary canvas to effectively take a snapshot of the RenderTexture for this atlas.
     */
    if (imgDataSource instanceof HTMLCanvasElement) {
      if (!this.trimCanvas) {
        this.trimCanvas = this.rt.scene.textures.createCanvas(
          scratchCanvasID,
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
      /**
       * WebGl rendering ---
       * Currently not yet implemented. Will need to sample the RT framebuffer and probably do
       * a similar canvas dance as above.
       */
      throw new Error("WebGL serialization not yet supported!");
    }

    return {
      frames: this.frames,
      image: url,
      packerData: JSON.stringify(this.packer),
    };
  };

  /**
   * Replaces the contents of this atlas with incoming data.
   * This is primarily used by the `load` methods.
   */
  private importExistingAtlas = async (
    frames: {
      [imageUrl: string]: {
        width: number;
        height: number;
        x: number;
        y: number;
        trim: null | TrimInfo;
      };
    },
    imageUri: string,
    packerData: string,
  ) => {
    const key = this.textureKey + "-import-" + Math.random();

    // Update frames
    this.frames = frames; // this.deserializeFrames(frames);

    // Add frames to the texture
    for (const frameUrl in this.frames) {
      const frame = this.frames[frameUrl];
      if (!frame) {
        continue;
      }
      this.rt.texture.add(frameUrl, 0, frame.x, frame.y, frame.width, frame.height);
    }

    // Update the packer to reflect the state it was in when serialized
    const incomingPacker = JSON.parse(packerData);
    this.packer = new ShelfPack(1, 1, true);

    // Basically just replace all of the packer properties with what was saved
    for (const key in incomingPacker) {
      // `shelves` in particular need some massaging into the proper classes and types.
      if (key === "shelves") {
        for (let i = 0; i < incomingPacker[key].length; i++) {
          const incomingShelf = incomingPacker[key][i];
          const shelf = new Shelf(incomingShelf.y, incomingShelf.width, incomingShelf.height);
          shelf.free = incomingShelf.free;
          shelf.x = incomingShelf.x;
          this.packer.shelves.push(shelf);
        }
      } else {
        // Every field other than `shelves` will just be replaced.
        if (this.packer.hasOwnProperty(key)) {
          // @ts-expect-error
          this.packer[key] = incomingPacker[key];
        }
      }
    }

    // Actually the load the base64-encoded image into Phaser via the TextureManager.
    let texture;
    try {
      texture = await loadViaTextureManager(this.scene, key, imageUri);
    } catch (err) {
      console.log("Error importing serialized atlas image..", err);
      return;
    }

    // Phaser vaguely types `texture.frames` as `object`. We augment the types here accordingly.
    // eslint-disable-next-line
    const textureFrames = texture.frames as {
      [key: string]: Phaser.Textures.Frame;
    };

    // Reference the _BASE frame so we can quickly determine the dimensions of this texture
    const frame = textureFrames[texture.firstFrame];
    if (!frame) {
      // This shouldn't happen
      console.warn("LiveAtlas : could not find base frame when importing texture!");
      return;
    }

    // Scale the render texture and populate it with graphics
    this.rt.clear();
    this.rt.resize(frame.width, frame.height);
    this.rt.draw(key, 0, 0, 1);

    // Remove the base64 texture since it's now in the RT
    this.scene.textures.remove(key);

    // Imports should not trigger repacks unless further edits are made
    this.clearRepackFlag();
  };

  // -----------------------------------------------------------------------------------

  /**
   * Utility functions to load new frames into this atlas.
   * All functions return promises which only resolve when all items have been loaded.
   *
   * If you're trying to _create_ something which uses an atlas frame, refer to the `atlas.make` functions.
   */
  public add = {
    image: this.addFrameByURL,
    imageList: this.addMultipleFramesByURL,
    spritesheet: async (
      key: string,
      url: string,
      config: {
        frames?: { [frameName: string]: { x: number; y: number; width: number; height: number } };
        dimensions?: {
          width: number;
          height: number;
        };
        anims?: {
          [name: string]: {
            frames?: number[];
            start?: number;
            end?: number;
            duration?: number;
            frameRate?: number;
            delay?: number;
            repeat?: number;
            repeatDelay?: number;
            yoyo?: boolean;
          };
        };
      },
    ) => {
      // Load + pack the spritesheets
      await this.addSpritesheetByURL(key, url, config);

      // Register incoming animations, if any
      if (config.anims) {
        for (const anim in config.anims) {
          const detail = config.anims[anim];
          if (detail) {
            this.anims.add(key, anim, detail);
          }
        }
      }
    },
  } as const;

  /**
   * Utility functions for handling animations stored within this atlas.
   */
  public anims = {
    /**
     * Registers a new animation within this atlas, making it available for Sprites to reference.
     * Use `liveAtlas.anims.play(...)` to actually get a Sprite object to run this animation.
     */
    add: (
      spritesheetName: string,
      animName: string,
      config: {
        frames?: number[];
        start?: number;
        end?: number;
        duration?: number;
        frameRate?: number;
        delay?: number;
        repeat?: number;
        repeatDelay?: number;
        yoyo?: boolean;
      },
    ) => {
      this.scene.anims.create({
        // Namespace this animation to this atlas so there are no accidental collisions with animations
        // registered outside of this atlas
        key: this.getAnimKey(spritesheetName, animName),
        frames: this.scene.anims.generateFrameNames(this.textureKey, {
          prefix: spritesheetName + "-",
          start: config.start,
          end: config.end,
          frames: config.frames,
        }),
        // duration: config.duration,
        frameRate: config.frameRate,
        delay: config.delay === undefined ? 0 : config.delay,
        repeatDelay: config.repeatDelay === undefined ? 0 : config.repeatDelay,
        repeat: config.repeat === undefined ? 0 : config.repeat,
        yoyo: config.yoyo === undefined ? false : config.yoyo,
      });
    },

    /**
     * Finds the specified animation for the given imported spritesheet, and plays it on the given
     * sprite targets. If no animation exists, a warning will print to console.
     *
     * Be sure to call `liveAtlas.anims.add(...)` before calling this.
     */
    play: async (
      spritesheetName: string,
      animName: string,
      target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Sprite[],
    ) => {
      const animKey = this.getAnimKey(spritesheetName, animName);
      if (!this.scene.anims.get(animKey)) {
        console.warn(
          'No animation found for "' +
            spritesheetName +
            " - " +
            animName +
            '" - did you call `anims.add` first?',
        );
        return;
      }
      const anim = this.scene.anims.get(animKey);
      this.scene.anims.play(animKey, target);
      // Wait for all animations to complete (or be destroyed)
      const allTargets = target instanceof Array ? target : [target];
      const allAnims = allTargets.map((t) => {
        return new Promise<void>(function (res) {
          // This may be destroyed before the animation is done
          t.once(Phaser.GameObjects.Events.DESTROY, res);

          // Animations that loop forever will resolve when the first run is complete.
          // Other animations will wait for the `COMPLETE` event.
          if (anim.repeat === Phaser.FOREVER) {
            t.once(Phaser.Animations.Events.ANIMATION_REPEAT, res);
          } else {
            t.once(Phaser.Animations.Events.ANIMATION_COMPLETE, res);
          }
        });
      });
      return Promise.all(allAnims);
    },

    /**
     * Sets the `target` to the first frame of the given animation, if it's available.
     * This is usefuufo
     */
    goto: async (
      spritesheetName: string,
      animName: string,
      target: Phaser.GameObjects.Sprite | Phaser.GameObjects.Sprite[],
    ) => {
      const animKey = this.getAnimKey(spritesheetName, animName);
      if (!this.scene.anims.get(animKey)) {
        console.warn(
          'No animation found for "' +
            spritesheetName +
            " - " +
            animName +
            '" - did you call `anims.add` first?',
        );
        return;
      }
      this.scene.anims.play(animKey, target);
      if (target instanceof Array) {
        target.forEach((x) => x.anims.pause());
      } else {
        target.anims.pause();
      }
    },
  } as const;

  /**
   * Factory functions to create new Images, Sprites, etc.
   *
   * All functions return native Phaser classes and are simply just a means for easy integration
   * with this LiveAtlas.
   */
  public make = {
    image: (
      x: number,
      y: number,
      frame: string,
      spritesheet?: string,
    ): Phaser.GameObjects.Image => {
      // Images made from spritesheets operate slightly differently, in that they don't attempt to
      // load any missing frames and instead will just error out if the parent spritesheet is missing.
      if (spritesheet) {
        if (!this.hasFrame(spritesheet)) {
          throw new Error(
            "Missing spritesheet " +
              spritesheet +
              " when trying to make image. Did you call `add.spritesheet` first?",
          );
        }
        const key = `${spritesheet}-${frame}`;
        return this.scene.add.image(x, y, this.textureKey, key);
      }

      // Normal/non-spritesheet images will attempt to load if missing, also ensuring that a frame
      // exists on the atlas to prevent any missing texture warnings in console.

      const hasFrameAlready = this.hasFrame(frame);
      // Register `frame` as a texture on this frame immediately
      // (This prevents `frame missing` warnings in console.)
      this.maybeRegisterEmptyFrame(frame);

      // The actual image to be returned. Note at this point the frame is either loaded or pointing
      // at a 1x1 transparent pixel.
      const img = this.scene.add.image(x, y, this.textureKey, frame);

      // Wee bit of a hack to track if the origin of this object has had its depth changed since instantiation
      // This is used to conditionally call `setOriginFromFrame` in a moment after the frame has updated.
      img.setOrigin(-1, -1);

      // Actually load the frame - if necessary - and then ensure that `img` has proper sizing/orientation.
      this.addFrameByURL(frame, frame, !hasFrameAlready).then(() => {
        // console.log("frame is finally loaded", frame);
        this.sizeObjectToFrame(img);
      });

      return img;
    },

    sprite: (
      x: number,
      y: number,
      spritesheet: string,
      startingAnim = "default",
    ): Phaser.GameObjects.Sprite => {
      return this.make.animation(x, y, spritesheet, startingAnim, false);
    },

    animation: (
      x: number,
      y: number,
      spritesheet: string,
      animName = "default",
      destroyOnComplete = true,
    ): Phaser.GameObjects.Sprite => {
      const img = this.scene.add.sprite(x, y, this.textureKey);
      const animKey = this.getAnimKey(spritesheet, animName);
      this.scene.anims.play(animKey, img);

      if (destroyOnComplete) {
        img.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          img.removeFromDisplayList().removeFromUpdateList().destroy();
        });
      }
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
      this.repack();
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
      await localCache.saveBlob(storageKey, data);
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

    /**
     * Converts this atlas into an `.atlas` file and then prompts the user to download the file
     * via browser controls.
     *
     * Note: This requires DOM APIs and will not work in node/headless environments!
     */
    toDiskFile: async (storageKey: string = this.textureKey, extension = "atlas") => {
      const json = await this.save.toJSON();

      const link = document.createElement("a");
      const contents = JSON.stringify(json);
      const file = new Blob([contents], { type: "text/plain" });
      link.href = URL.createObjectURL(file);
      link.download = storageKey + "." + extension;
      // Triggers a download at the browser level for a text file
      link.click();
    },

    /**
     * Converts this atlas into an `Image` which can then be added to the DOM,
     * drawn on another `canvas`, etc.
     */
    toImage: async (): Promise<HTMLImageElement> => {
      const json = await this.save.toJSON();
      const url = json.image;
      const img = new Image();
      img.src = url;
      return img;
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

      try {
        await this.importExistingAtlas(parsedData.frames, parsedData.image, parsedData.packerData);
        // Don't need to set the repack flag here because all saved atlases _should_ be packed already.
        // If not, there is `repack(true)` to force a repack anyway.
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
      const data = await localCache.loadBlob(storageKey);
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

    /**
     * Imports a blob from a previously serialized atlas.
     */
    fromBlob: async (data: Blob) => {
      const json = await localCache.convertBinaryToText(data);
      if (!json) {
        // Data should not be a Blob, as we always store strings for this atlas data.
        return false;
      }
      return this.load.fromJSON(json);
    },

    /**
     * Imports the given file/blob/string from a previously serialized atlas.
     * Use this when handling drag-n-drop files or loading via `fs`.
     */
    fromDiskFile: async (data: File | Blob | string) => {
      if (typeof data === "string") {
        return await this.load.fromJSON(data);
      } else if (data instanceof File || data instanceof Blob) {
        return this.load.fromBlob(data);
      }
      return false;
    },

    /**
     * Use `fetch` to load a serialized atlas from a network source.
     * Options can be provided to be passed into `fetch` if necessary (i.e. for cors settings).
     */
    fromNetworkRequest: async (url: RequestInfo, opts?: RequestInit) => {
      try {
        await fetch(url, opts)
          .then((x) => x.blob())
          .then((x) => this.load.fromBlob(x));
      } catch (err) {
        return false;
      }
      return true;
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
      const data = await localCache.loadBlob(storageKey);
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
     * Returns the given amount of bytes in more human-readable terms, changing the units if necessary.
     * ex: "100 Bytes", "1.0 KB", "117.7 MB" etc
     */
    convertBytesToHuman: (bytes: number) => {
      return convertBytesToHumanReadable(bytes);
    },

    /**
     * Frees any stored data associated with the given storage key.
     * This wipes out the browser's local, session, and IDB storages.
     */
    freeStoredData: async (storageKey = this.textureKey) => {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
      await localCache.freeBlob(storageKey);
    },

    /**
     * Uses the browser-provided mechanism to request permission from the user if we can persist
     * data beyond typical browser limitations. From MDN:
     *
     * If persistence is granted,
     * > Storage will not be cleared except by explicit user action
     *
     * If persistence is NOT granted,
     * > Storage may be cleared when under storage pressure
     */
    requestPersistence: async (): Promise<boolean> => {
      return await navigator.storage.persist();
    },
  } as const;
}
