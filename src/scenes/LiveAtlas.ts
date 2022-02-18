// import { tryPackRects } from "./worker/utils/packRects";
// import { asyncLoader } from "render/asyncLoader";

// import { asyncLoader } from "render/asyncLoader";
// import { Atlas } from "./worker/AtlasTypes";
// import { tryPackRects } from "./worker/utils/packRects";

const objectSizes = 32;

export const asyncLoader = (
  loadKey: string,
  loaderPlugin: Phaser.Loader.LoaderPlugin
) => {
  return new Promise<void>((resolve, reject) => {
    loaderPlugin
      .on(
        "filecomplete",
        (key: string, _type: "audio" | "json", _info: any) => {
          if (key === loadKey) {
            // console.log('file complete', key);
            resolve();
          }
        }
      )
      .on("loaderror", (file: Phaser.Loader.FileTypes.ImageFile) => {
        // console.log('file rejected', file.key);
        if (file.key === loadKey) {
          reject();
        }
      });
    loaderPlugin.start();
  });
};

/**
 * Used when trimming images to denote: the original dimensions, the trimmed dimensions, and
 * the placement offset of the trim relative to the original dimensions
 */
export type ImageFrame = {
  x: number;
  y: number;
  originalWidth: number;
  originalHeight: number;
  trimmedWidth: number;
  trimmedHeight: number;
};
export type Atlas = {
  rects: PackedRect[];
  contentWidth: number;
  contentHeight: number;
  width: number;
  height: number;
  fill: number;
  spritePadding: number;
  atlasId: string;
  timestamp: number;
  spaces: AtlasSpace[];
};
export type AtlasSpace = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type IncomingRect = {
  width: number;
  height: number;
  id: string;
};
export type PackedRect = IncomingRect & {
  x: number;
  y: number;
};
export type TexturePackerJSON = {
  textures: PhaserAtlas[];
};
export type PhaserAtlasFrame = {
  filename: string;
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  pivot: { x: 0; y: 0 };
};
export type PhaserAtlas = {
  image: string; // ex: "texture-packer-multi-atlas-0.png"
  format: "RGBA8888";
  size: {
    w: number;
    h: number;
  };
  scale: 1;
  frames: PhaserAtlasFrame[];
};

/**
 * Modified version of the `potpack` library from Mapbox.
 *
 * https://github.com/mapbox/potpack
 */
export function tryPackRects(
  rects: IncomingRect[],
  padding = 0,
  existing?: Atlas
): Atlas {
  // calculate total rect area and maximum rect width
  let area = 0;
  let maxWidth = 0;

  let rectHeight = 0;
  let rectWidth = 0;
  for (const rect of rects) {
    rectWidth = rect.width || objectSizes;
    rectHeight = rect.height || objectSizes;

    rectWidth += padding * 2;
    rectHeight += padding * 2;

    area += rectWidth * rectHeight;
    maxWidth = maxWidth < rectWidth ? rectWidth : maxWidth;
  }

  if (existing) {
    for (const rect of existing.rects) {
      rectWidth = rect.width || objectSizes;
      rectHeight = rect.height || objectSizes;

      rectWidth += padding * 2;
      rectHeight += padding * 2;

      area += rectWidth * rectHeight;
      maxWidth = maxWidth < rectWidth ? rectWidth : maxWidth;
    }
  }

  // sort the rects for insertion by height, descending
  rects.sort((a, b) => b.height - a.height);

  // aim for a squarish resulting container,
  // slightly adjusted for sub-100% space utilization
  const startWidth = Math.max(Math.ceil(Math.sqrt(area / 0.95)), maxWidth);

  // start with a single empty space, unbounded at the bottom
  const spaces: AtlasSpace[] = existing?.spaces || [
    { x: 0, y: 0, width: startWidth, height: Infinity },
  ];

  let width = 0;
  let height = 0;

  let incomingRect;
  const placedRects: PackedRect[] = existing?.rects ?? [];
  for (let idx = 0; idx < rects.length; idx++) {
    incomingRect = rects[idx];
    if (!incomingRect) {
      continue;
    }
    rectWidth = incomingRect.width || objectSizes;
    rectHeight = incomingRect.height || objectSizes;

    rectWidth += padding * 2;
    rectHeight += padding * 2;

    // look through spaces backwards so that we check smaller spaces first
    for (let i = spaces.length - 1; i >= 0; i--) {
      const space = spaces[i];

      // look for empty spaces that can accommodate the current rect
      if (!space || rectWidth > space.width || rectHeight > space.height) {
        continue;
      }

      // found the space; add the rect to its top-left corner
      // |-------|-------|
      // | rect  |       |
      // |_______|       |
      // |         space |
      // |_______________|
      const newRect: PackedRect = {
        ...incomingRect,
        id: incomingRect.id,
        x: space.x,
        y: space.y,
        width: rectWidth,
        height: rectHeight,
      };

      height = Math.max(height, newRect.y + newRect.height);
      width = Math.max(width, newRect.x + newRect.width);

      placedRects.push(newRect);

      if (newRect.width === space.width && newRect.height === space.height) {
        // space matches the rect exactly; remove it
        const last = spaces.pop();
        if (i < spaces.length) {
          if (last !== undefined) {
            spaces[i] = last;
          } else {
            delete spaces[i];
          }
        }
      } else if (newRect.height === space.height) {
        // space matches the rect height; update it accordingly
        // |-------|---------------|
        // | rect  | updated space |
        // |_______|_______________|
        space.x += newRect.width;
        space.width -= newRect.width;
      } else if (newRect.width === space.width) {
        // space matches the rect width; update it accordingly
        // |---------------|
        // |     rect      |
        // |_______________|
        // | updated space |
        // |_______________|
        space.y += newRect.height;
        space.height -= newRect.height;
      } else {
        // otherwise the rect splits the space into two spaces
        // |-------|-----------|
        // | rect  | new space |
        // |_______|___________|
        // | updated space     |
        // |___________________|
        spaces.push({
          x: space.x + newRect.width,
          y: space.y,
          width: space.width - newRect.width,
          height: newRect.height,
        });
        space.y += newRect.height;
        space.height -= newRect.height;
      }
      break;
    }
  }

  return {
    // Reset the rects to not include padding
    // (this helps with turning into phaser frames later, so maybe this shouldn't happen here)
    rects: placedRects.map((x) => ({
      ...x,
      x: x.x + padding,
      y: x.y + padding,
      height: x.height - padding * 2,
      width: x.width - padding * 2,
      id: x.id,
    })),
    contentWidth: width,
    contentHeight: height,
    width: width,
    height: height,
    fill: area / (width * height) || 0,
    spritePadding: padding,
    atlasId: Math.random().toString(32).slice(2),
    timestamp: Date.now(),
    spaces,
  };
}

export class LiveAtlas {
  private frames: { [imgUrl: string]: Phaser.Geom.Rectangle } = {};
  /**
   * Used for appending to an existing rect layout. Likely to contain outdated data.
   */
  private lastAtlas?: Atlas;
  private rt: Phaser.GameObjects.RenderTexture;
  private backbuffer: Phaser.GameObjects.RenderTexture;
  private eraserCursor: Phaser.GameObjects.Rectangle;

  public get texture(): Phaser.GameObjects.RenderTexture {
    return this.rt;
  }
  public set texture(v: Phaser.GameObjects.RenderTexture) {
    this.rt = v;
  }

  public textureKey = () => {
    return "live-atlas-" + this.id;
  };

  constructor(public scene: Phaser.Scene, public id: string) {
    this.rt = scene.make.renderTexture({ width: 4096, height: 4096 });
    // .setVisible(false);

    this.rt.saveTexture("live-atlas-" + id);
    // this.backbuffer = scene.make
    //   .renderTexture({ width: 4096, height: 4096 })
    //   .setVisible(false);
    // this.backbuffer.saveTexture("live-atlas-backbuffer-" + id);

    this.eraserCursor = scene.add
      .rectangle(0, 0, 1, 1, 0xffffff, 1)
      .setVisible(false);
  }

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
      this.eraserCursor.setSize(frameRect.width, frameRect.height);
      this.rt.erase(this.eraserCursor);
    }
  }

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
      await asyncLoader(
        currentFrame,
        this.scene.load.image(currentFrame, currentFrame)
      );

      // get its dimensions (somehow..)
      const img = this.scene.textures.getFrame(currentFrame);
      const dimensions = { width: img.width, height: img.height };
      // console.log('dimensions', dimensions.width, dimensions.height)

      // add this to the render texture
      this.appendFrame(currentFrame, dimensions);

      // remove the texture now that it's in the RT
      this.scene.textures.remove(this.scene.textures.get(currentFrame));
    }
  }

  private appendFrame = (
    key: string,
    dimensions: { width: number; height: number }
  ) => {
    // use bin packing but feed `this.frames` as the initial state to work around
    const packedAtlas = tryPackRects(
      [
        {
          height: dimensions.height,
          width: dimensions.width,
          id: key,
        },
      ],
      1,
      this.lastAtlas
    );
    this.lastAtlas = packedAtlas;
    // set `this.frames[currentFrame]` to match whatever its packed rect was determiend to be in ^
    const packedFrame = packedAtlas.rects.find((x) => x.id === key);
    if (!packedFrame) {
      throw new Error();
    }
    this.frames[key] = new Phaser.Geom.Rectangle(
      packedFrame.x,
      packedFrame.y,
      packedFrame.width,
      packedFrame.height
    );

    // if `this.rt`'s dimensions do not contain the total packed rects determined above,
    if (
      this.rt.width < packedAtlas.width ||
      this.rt.height < packedAtlas.height
    ) {
      // use `this.resizeTexture()` to increase the texture (by double? the exact amount??)
      this.resizeTexture(packedAtlas.width, packedAtlas.height);
    }

    // draw the image data to `this.rt` at its packed rect location
    this.rt.draw(key, packedFrame.x, packedFrame.y);
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
    const items = Object.keys(this.frames).map((key) => ({
      width: this.frames[key]?.width || 0,
      height: this.frames[key]?.height || 0,
      id: key,
    }));
    const packed = tryPackRects(items, 1);

    this.preserveTextureState();

    // `this.rt.resize()` to match `packed`'s dimensions (this clears the RT)
    // note we're NOT calling `this.resizeTexture` and instead directly manipulating the texture
    this.rt.resize(packed.width, packed.height);

    // loop through each packed rect,
    for (const rect of packed.rects) {
      const { id, x, y } = rect;
      // and draw the preserved frame at the _new_ rect position
      this.drawPreservedFrame(id, x, y);
    }

    // finally, free the preserved state entirely
    this.freePreservedState();
  }

  /**
   * resizes the internal texture, ensuring image data remains the same afterwards
   */
  private resizeTexture = (width: number, height: number) => {
    this.preserveTextureState();
    this.rt.resize(width, height);
    this.restoreTextureState();
    this.freePreservedState();
  };

  private getBackbuffer = () => {
    if (!this.backbuffer) {
      this.backbuffer = this.scene.make
        .renderTexture({ width: 4096, height: 4096 })
        .setVisible(false);

      this.backbuffer.saveTexture("live-atlas-backbuffer-" + this.id);
    }
    return this.backbuffer;
  };

  /**
   * makes a copy of the current internal texture data, preserving registered frame information
   */
  private preserveTextureState = () => {
    if (!this.lastAtlas){ return; }
    // create backbuffer if needed
    const bb = this.getBackbuffer();
    // resize backbuffer to match this.rt
    bb.resize(this.rt.width, this.rt.height);
    // draw this.rt to backbuffer
    bb.draw(this.rt);

    // console.log('bb is ready', this.rt.width, this.rt.height, ' : ' , bb.width, bb.height)
    // copy all of `this.rt`'s frames over to the backbuffer
    const ogFrameNames = this.rt.texture.getFrameNames();
    for (const frameName of ogFrameNames) {
      const frame = this.frames[frameName];
      // const frame = this.rt.texture.get(frameName);
      if (!frame) {
        continue;
      }
      console.log('saving frame', frameName, frame.x,
      frame.y,
      frame.width,
      frame.height);
      bb.texture.add(
        frameName,
        0,
        frame.x,
        frame.y,
        frame.width,
        frame.height
      );

    }
  };
  private restoreTextureState = () => {
    // if no backbuffer, exit
    if (!this.backbuffer) {
      return;
    }
    // draw backbuffer to this.rt
    this.rt.draw(this.backbuffer);

    // Install old framings
    const frameNames = this.backbuffer.texture.getFrameNames();
    for (const name of frameNames) {
      const frame = this.backbuffer.texture.get(name);
      if (!frame) {
        console.log('no frame');
        continue;
      }
      // this.rt.texture.remove(name);
      this.rt.texture.add(name, 0, frame.x, frame.y, frame.width, frame.height);
    }

    // clear/resize/free backbuffe
    this.freePreservedState();
  };
  private freePreservedState = () => {
    // if no backbuffer, exit
    if (!this.backbuffer) {
      return;
    }
    this.backbuffer.resize(0, 0);
    // destroy backbuffer? maybe? check perf to see if it's worth it to pool this instance
  };

  private drawPreservedFrame = (key: string, x: number, y: number) => {
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
    this.rt.draw(frame, x, y);

    // const frame = this.rt.texture.get(key);
    // this.rt.texture.add(key, 0, x, y, frame.width, frame.height);
  };
}
