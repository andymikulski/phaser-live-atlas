# LiveAtlas
## In-browser texture atlas generator for Phaser 3

Features:
 - Add/remove atlas frames on the fly
 - "Pixel art mode" available for a crisp texture appearance
 - Image transparency trimming
    - Including spritesheet frames!
 - Spritesheet animation support
 - Serialization support
    - localStorage + sessionStorage support for smaller atlases (< 5mb)
    - IndexedDB support for atlases larger than

## Usage (high-level)

1. A new `LiveAtlas` is created, and "frames" are registered with the atlas accordingly
1. When a new frame is registered with the atlas, it is immediately created and made available for use - regardless of the state of the actual asset being loaded
  1. This allows devs to immediately reference a frame within the atlas without worrying about missing frame errors
1. A network request is made (via Phaser) for the texture asset.
1. Upon load, the frame's image data is quickly trimmed of its transparency
1. The new, trimmed frame is put into the "packer" and a spot for it is found in the LA texture
1. Finally, the frame is drawn into the LA texture, effectively making it available for use
  1. If the texture under the hood is not large enough, the size increases accordingly before drawing
1. By default, new assets are not guaranteed to be placed into the atlas in the most optimal configuration. When necessary, the atlas can be `repack`ed or `compress`ed to save space and find a more optimal packing.
1. Finally, we can serialize the atlas via the `save` methods available:
  1. `toLocalStorage`
  1. `toSessionStorage`
  1. `toIndexedDB`
  1. `toBrowserStorage` - Selects local storage or IDB depending on the atlas size.
  1. `toDiskFile` - Saves the image, frame, and packer data to an `.ATLAS` file
  1. `toImage` - Returns the spritesheet as an `HTMLImageElement`, useful for debugging.

---

TODO:
- Removing a base spritesheet URL should remove all of its subframes
- Split texture into multiple sources (multiple RTs) so we can effectively have a multiatlas backed by render textures
- Identify WebGL vs Canvas issues and maybe report to the Phaser repo?
- Maybe use/expose `navigator.storage.persist` ?
- Fill out README a bit more

BUGS:
- Spritesheet frames have incorrect original width/heights and so don't appear in the correct position when ran in sequence
- Multiple things calling `addFrame` at the same time produces weird results
  - race condition with loading/processing - we constantly create/destroy/etc even though once is enough

CANCELLED:

- Off-thread texture save?
  - This can be handled by the application embedding the LA