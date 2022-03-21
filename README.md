TODO:

- Split texture into multiple sources (multiple RTs) so we can effectively have a multiatlas backed by render textures
- Identify WebGL vs Canvas issues and maybe report to the Phaser repo?
- Animations - inject frames into existing atlas?
- Maybe use/expose `navigator.storage.persist` ?

BUGS:

- Multiple things calling `addFrame` at the same time produces weird results
  - race condition with loading/processing - we constantly create/destroy/etc even though once is enough
- Loading a serialized atlas leads to sprites having 1-2+ px cut off
  - maybe frames not being saved with the additional padding?

CANCELLED:

- Off-thread texture save?
  - This can be handled by the application embedding the LA