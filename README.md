TODO:

- Split texture into multiple sources (multiple RTs) so we can effectively have a multiatlas backed by render textures
- Identify WebGL vs Canvas issues and maybe report to the Phaser repo?
- Off-thread texture save?
- Animations - inject frames into existing atlas?
- Maybe use/expose `navigator.storage.persist` ?