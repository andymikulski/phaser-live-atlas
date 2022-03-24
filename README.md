# LiveAtlas
## On-the-fly spritesheet generator for Phaser 3


...


---

TODO:

- Split texture into multiple sources (multiple RTs) so we can effectively have a multiatlas backed by render textures
- Identify WebGL vs Canvas issues and maybe report to the Phaser repo?
- Maybe use/expose `navigator.storage.persist` ?
- Removing a base spritesheet URL should remove all of its subframes
- Animations?? Spritesheet frames are in the URL but where do we define `anims`? How do we key them? `${url}-${key}`?
- Fill out README a bit more

BUGS:

- Multiple things calling `addFrame` at the same time produces weird results
  - race condition with loading/processing - we constantly create/destroy/etc even though once is enough
- Trimming spritesheet animations can result in broken frames
  - e.g. fishing pole sheet gets cut up weird, _but_ avatars work fine

CANCELLED:

- Off-thread texture save?
  - This can be handled by the application embedding the LA