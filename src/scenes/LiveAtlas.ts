import { trimImageEdges } from "../imageTrimming";
import { asyncLoader } from "./asyncLoader";
import { Atlas } from "./ImageFrame";
import ShelfPack from "./ShelfPack";

export class LiveAtlas {
  private frames: { [imgUrl: string]: Phaser.Geom.Rectangle } = {};
  private rt: Phaser.GameObjects.RenderTexture;
  private backbuffer: Phaser.GameObjects.RenderTexture;
  private eraserCursor: Phaser.GameObjects.Rectangle;

  private packer = new ShelfPack(1, 1, { autoResize: true });

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

  public textureKey = () => {
    return "live-atlas-" + this.id;
  };

  private backbufferKey = () => {
    return "live-atlas-backbuffer-" + this.id;
  };

  public hasFrame = (frame: string) => {
    return !!this.frames[frame];
  };

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

  private trimCanvas?: Phaser.Textures.CanvasTexture;

  private trimFrame = (frameKey: string) => {
    // const frame = this.rt.texture.get(frameKey);
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
        console.log("no current frame index");
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

  private cursor?: Phaser.GameObjects.Rectangle;
  private packNewFrame = (
    key: string,
    dimensions: {
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
    const packedFrame = this.packer.packOne(
      dimensions.width + 2,
      dimensions.height + 2,
      key
    );

    this.frames[key] = new Phaser.Geom.Rectangle(
      packedFrame.x,
      packedFrame.y,
      packedFrame.width,
      packedFrame.height
    );

    // if `this.rt`'s dimensions do not contain the total packed rects determined above,
    if (
      this.rt.width < this.packer.width ||
      this.rt.height < this.packer.height
    ) {
      // use `this.resizeTexture()` to increase the texture (by double? the exact amount??)
      this.resizeTexture(this.packer.width, this.packer.height);
    }

    // if (!this.cursor) {
    //   this.cursor = this.rt.scene.add.rectangle(0, 0, 1, 1).setOrigin(0, 0);
    // }
    // this.cursor.setFillStyle(0xffffff * Math.random());
    // this.cursor.setPosition(packedFrame.x, packedFrame.y);
    // this.cursor.setSize(packedFrame.width, packedFrame.height);
    // draw the image data to `this.rt` at its packed rect location
    // this.rt.draw(this.cursor, packedFrame.x, packedFrame.y);
    this.rt.draw(
      key,
      packedFrame.x - dimensions.trim.x,
      packedFrame.y - dimensions.trim.y + 1
    );
    // this.rt.draw(this.cursor);
    this.rt.texture.add(
      key,
      0,
      packedFrame.x,
      packedFrame.y,
      packedFrame.width,
      packedFrame.height
    );

    this.scene.textures.remove(key);
  };

  /**
   * heavy!
   *
   * uses binpacking on the registered frames and then redraws the underlying render texture for optimal sizing
   */
  public repack() {
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
    this.packer.clear();
    const packed = this.packer.pack(items);

    // Preserve the state as we will transfer the current frame data
    this.preserveTextureState();

    // `this.rt.resize()` to match `packed`'s dimensions (this clears the RT)
    // note we're NOT calling `this.resizeTexture` and instead directly manipulating the texture
    this.rt.clear();
    this.rt.resize(this.packer.width, this.packer.height);

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
      } //else {
      //   console.log("existing frame..", frame.x, frame.y);

      //   console.log("updated frame...", frame.x, frame.y);
      //   debugger;
      // }

      frame.setTrim(
        rect.width,
        rect.height,
        rect.x,
        rect.y,
        rect.width,
        rect.height
      );
      debugger;
    }

    // finally, free the preserved state entirely
    this.freePreservedState();
  }

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
   *
   * @return  {[type]}  [return description]
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
    bb.draw(this.rt);

    // copy all of `this.rt`'s frames over to the backbuffer
    const ogFrameNames = this.rt.texture.getFrameNames();
    for (const frameName of ogFrameNames) {
      const frame = this.frames[frameName];
      if (!frame) {
        continue;
      }
      bb.texture.add(frameName, 0, frame.x, frame.y, frame.width, frame.height);
    }
  };

  /**
   * [restoreTextureState description]
   *
   * @return  {[type]}  [return description]
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
   *
   * @return  {[type]}  [return description]
   */
  private freePreservedState = () => {
    // if no backbuffer, exit
    if (!this.backbuffer) {
      return;
    }
    this.backbuffer.resize(0, 0);
    this.backbuffer.clear();
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
   *
   * @return  {[type]}  [return description]
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
   *
   * @return  {[type]}  [return description]
   */
  public exportSerializedData = async () => {
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
    };
  };

  /**
   * [importExistingAtlas description]
   *
   * @return  {[type]}  [return description]
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
    imageUri: string
  ) => {
    const key = this.textureKey() + "-import";
    this.frames = this.deserializeFrames(frames);

    this.scene.textures.addBase64(key, imageUri);

    return new Promise<void>((res) => {
      this.scene.textures.on(
        Phaser.Textures.Events.LOAD,
        (key: string, texture: Phaser.Textures.Texture) => {
          const frame = (
            texture.frames as { [key: string]: Phaser.Textures.Frame }
          )[texture.firstFrame];

          // Scale the render texture and populate it with graphics
          this.rt.clear();
          this.rt.resize(frame.width, frame.height);
          this.rt.draw(key, 0, 0, 1);

          // Remove the base64 texture since it's now in the RT
          this.scene.textures.remove(key);

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

          res();
        }
      );
    });
  };

  /**
   * Serialize atlas and saves it to the
   *
   * @return  {[type]}  [return description]
   */
  public saveToLocalStorage = async (storageKey = "live-atlas-storage") => {
    this.repack();

    const data = await this.exportSerializedData();
    console.log("saving data...", data);
    const json = JSON.stringify(data);
    sessionStorage.setItem(storageKey, json);
  };

  /**
   * [loadFromLocalStorage description]
   *
   * @return  {[type]}  [return description]
   */
  public loadFromLocalStorage = async () => {
    const data = JSON.parse(
      sessionStorage.getItem("live-atlas-storage") || "null"
    );
    if (!data) {
      return;
    }
    await this.importExistingAtlas(data.frames, data.image);
  };

  /**
   * [showDebugTexture description]
   *
   * @return  {[type]}  [return description]
   */
  public showDebugTexture = async () => {
    const data = await this.exportSerializedData();
    const src = data.image;
    const img = new Image();
    img.src = src;
    document.body.appendChild(img);
  };
}
