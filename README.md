# LiveAtlas
## In-browser texture atlas generator for Phaser 3

Features:
 - Add/remove atlas frames on the fly
 - Image transparency trimming for smaller memory footprints.
 - Factories for creating new Phaser objects that are tied into the atlas
   - All factories return native Phaser `GameObject`s (i.e. `Image` or `Sprite`)
   - `atlas.make.image()` creates a `Image` with the correct atlas reference
   - `atlas.make.sprite()` creates a `Sprite`
 - Spritesheet support
    - Import other spritesheets into your atlas
    - Each sprite frame is trimmed and packed just like any other image, saving space
  - Animation support
    - An `atlas.anims.play(...)` function is available to facilitate working with animations
      - `play` is async, so you can easily `await` animations to complete on a given sprite
    - Animation data is stored on the scene itself to save memory
      - This also means any animation can be played on any `Sprite`
    - Sprites and one-off animations are easily created via `make.sprite` and `make.animation`
 - Serialization support
    - localStorage + sessionStorage support for smaller atlases (< 5mb)
    - IndexedDB support for atlases larger than
 - Storage utils to determine current usage, max size limit, and prompt user for persistence.
 - "Pixel art mode" available for a crisp texture appearance

## Usage (high-level)

1. A new `LiveAtlas` is created, and "frames" are registered with the atlas accordingly
1. When a new frame is registered with the atlas, it is immediately created and made available for use - regardless of the state of the actual asset being loaded
    1. This allows devs to immediately reference a frame within the atlas without worrying about missing frame errors
1. A network request is made (via Phaser) for the texture asset.
1. Upon load, the frame's image data is quickly trimmed of its transparency
1. The new, trimmed frame is put into the "packer" and a spot for it is found in the LA texture
1. Finally, the frame is drawn into the LA texture, effectively making it available for use
    1. If the texture under the hood is not large enough, the size increases accordingly before drawing
1. New assets are not guaranteed to be placed into the atlas in the most optimal configuration. When necessary, the atlas can be `repack`ed to save space and find a more optimal packing.
1. Finally, we can serialize the atlas via the `save` methods available (and later imported via `load`):
    1. `toLocalStorage`
    1. `toSessionStorage`
    1. `toIndexedDB`
    1. `toBrowserStorage` - Selects local storage or IDB depending on the atlas size.
    1. `toDiskFile` - Saves the image, frame, and packer data to an `.ATLAS` file
    1. `toImage` - Returns the spritesheet as an `HTMLImageElement`, useful for debugging.


## Usage (examples)




### Initial Setup

```ts
const liveAtlas = new LiveAtlas(scene);
```

#### Pixel Art
```ts
// Crisp appearance when texture is scaled
liveAtlas.setPixelArt(true);
// Default - Smooth/antialiased appearance when texture is scaled
liveAtlas.setPixelArt(false);

// This setting can be changed at runtime!
```

#### Preloading
```ts
// Use the `add` functions to add new images to your atlas.
liveAtlas.add.image('your-texture-key', '/path/to/image.png');

// `imageList` allows you to import many images at once.
// These will be keyed on their URL.
liveAtlas.add.imageList(['/path/to/image1.png', '/path/to/image2.jpg']);

// Spritesheets can also be loaded via `add`. See below for more information
// on how those are configured when importing.
liveatlas.add.spritesheet(/*...*/);
```

### Static Images
```ts
// Use the `make` functions to create new assets tied into the LiveAtlas
const img = liveAtlas.make.image(x, y, 'your-texture-key');
// `img` is a `Phaser.GameObjects.Image` but uses `liveAtlas` as its texture.
```
#### Changing an Image
```ts
// Use `applyFrame` on existing Images when changing their frame
const img = liveAtlas.make.image(x, y, 'your-texture-key');
liveAtlas.applyFrame('my-other-texture-key', img);
// `img` now displays `my-other-texture-key`.
```


#### Spritesheets
There are a couple extra parts required when importing spritesheets: defining the frames (or cells), and optionally defining any animations inside that spritesheet.

##### Importing spritesheets using `frames`
```ts
// Load the spritesheet into the atlas before use
liveAtlas.add.spritesheet('inventory-items', '/items.png', {
  // We can pass `frames` to denote exactly what each frame is
  frames: {
    "sword": {x: 0, y: 0, width: 32, height: 64},
    "potion": {x: 32, y: 0, width: 32, height: 64},
    "key": {x: 32, y: 64, width: 32, height: 64},
    // ... etc ...
  }
});

// Frames are namespaced under their spritesheet's key
const img = liveAtlas.make.image(x, y, 'sword', 'inventory-items');
const img2 = liveAtlas.make.image(x, y, 'potion', 'inventory-items');
const img3 = liveAtlas.make.image(x, y, 'key', 'inventory-items');
```

##### Importing spritesheets using `dimensions`
```ts
// Load the spritesheet into the atlas before use
liveAtlas.add.spritesheet('inventory-items', '/items.png', {
  // This tells the LiveAtlas that each frame of this spritesheet is 96px wide by 64px tall
  // Each frame is labeled `0..n-1` where `n` is the number of frames found in the spritesheet.
  // Frames are numbered moving from left to right, top to bottom.
  dimensions: {
    width: 96,
    height: 64,
  },
});

// Frames are namespaced under their spritesheet's key
const img = liveAtlas.make.image(x, y, 0, 'inventory-items');
const img2 = liveAtlas.make.image(x, y, 1, 'inventory-items');
const img3 = liveAtlas.make.image(x, y, 2, 'inventory-items');
```


#### Spritesheet Animations
Spritesheets can take an optional `anims` configuration object, which takes the following shape:

```ts
{
  [animationName: string]: {
    // `start`/`end` is used to denote the sequence of frames to use for this animation.
    start?: number;
    end?: number;
    // `frames` denotes individual frames for the animation, useful if your frames are named
    // or are not in sequential order.
    frames?: number[];

    // Duration of the animation in milliseconds. If not specified, `frameRate` must be present.
    duration?: number;
    // Framerate of the animation. If not specified, `duration` must be present.
    frameRate?: number;

    // Repeat/delays
    repeat?: number;
    repeatDelay?: number;
    delay?: number;

    // `yoyo` will have the animation play forward and then in reverse
    yoyo?: boolean;
  }
}

```

#### Complete example

```ts
// Load the spritesheet into the atlas before use
liveAtlas.add.spritesheet('fishing', '/fishing-spritesheet.png', {
  dimensions: {
    width: 96,
    height: 64,
  },
  anims: {
    cast: { frameRate: 6, start: 0, end: 13 },
    idle: { frameRate: 3, start: 11, end: 13, yoyo: true, repeat: Phaser.FOREVER },
    nibble: { frameRate: 6, start: 14, end: 17, repeat: Phaser.FOREVER },
    reel: { frameRate: 8, start: 22, end: 33 },
  }
});

// Use `make.sprite` to create a sprite which uses the atlas for rendering + animation frames.
// (Here, 'idle' is the default animation played once the sprite is added to the scene.)
fishingRod = liveAtlas.make.sprite(x, y, 'fishing', 'idle');

// To play animations on an existing sprite, use `liveAtlas.anims.play`:
liveAtlas.anims.play('fishing', 'cast', fishingRod);

// Animations can be chained via `await`:
await liveAtlas.anims.play('fishing', 'cast', fishingRod)
await liveAtlas.anims.play('fishing', 'reel', fishingRod)
await liveAtlas.anims.play('fishing', 'idle', fishingRod)

// If you want to display the first frame of an animation, you can use `goto`:
liveAtlas.anims.goto('fishing', 'idle', fishingRod); // Paused on first frame of 'idle'
```

### One-shot Animations
```ts
// Similar to `Animated Sprites`, you must define the spritesheet animation beforehand:
await liveAtlas.add.spritesheet('confetti', '/confetti-spritesheet.png', {
  dimensions: {
    width: 160,
    height: 160,
  },
  // Note the only animation here is 'default'
  anims: {
    'default': {
      frameRate: 60,
      start: 0,
      end: 71,
    },
  }
});

// Playing one-shot animations is simple through `make.animation`.
// Note this function returns a `Sprite`, but by default will automatically destroy
// the sprite once the animation is complete.
liveAtlas.make.animation(x, y, 'confetti');
// We can also one-shot any other animation stored in the atlas:
liveAtlas.make.animation(x, y, 'fishing', 'cast');
```

### Particle Systems

Creating a particle emitter is fairly simple, as we only need to reference the atlas texture key upon creation:
```ts
const manager = scene.add.particles(liveAtlas.textureKey);
const emitter = manager.createEmitter({
  // Just reference keys/URLs already registered with the atlas for the `frame` property
  frame: ['frame-key-1', 'other-frame-key', 'etc'],
  /* ..other emitter options go here.. */
});
```

---

TODO:
- Split texture into multiple sources (multiple RTs) so we can effectively have a multiatlas backed by render textures

IN PROGRESS:
- Identify WebGL vs Canvas issues and maybe report to the Phaser repo
  - https://github.com/photonstorm/phaser/issues/6057

BUGS:
- Multiple things calling `addFrame` at the same time produces weird results
  - race condition with loading/processing - we constantly create/destroy/etc even though once is enough

NON-GOALS:

- Off-thread texture save?
  - This can be handled by the application embedding the LA