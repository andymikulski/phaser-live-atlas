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
  rectsOriginal: PackedRect[];
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
  frame: { x: number; y: number; w: number; h: number; };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number; };
  sourceSize: { w: number; h: number; };
  pivot: { x: 0; y: 0; };
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
