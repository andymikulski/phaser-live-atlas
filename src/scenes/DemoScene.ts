import Phaser from "phaser";
import { LiveAtlas } from "../live-atlas/lib/LiveAtlas";
import objectData from "./objectData";
import avatarData from "./avatarData";
import * as dat from "dat.gui";

const gui = new dat.GUI();

class UIScene extends Phaser.Scene {
  private objCount = 0;
  private avatarCount = 0;
  private objectCountText?: Phaser.GameObjects.Text;
  private avatarCountText?: Phaser.GameObjects.Text;

  create = () => {
    this.add.rectangle(4, 4, 250, 32, 0xffffff);
    this.objectCountText = this.add.text(4, 4, "0 objects", {
      color: "#000000",
    });
    this.avatarCountText = this.add.text(4, 24, "0 avatars", {
      color: "#000000",
    });
  };

  public adjObjCounter = (val: number) => {
    this.objCount += val;
    this.objectCountText.setText(this.objCount + " objects");
  };

  public adjAvatarCounter = (val: number) => {
    this.avatarCount += val;
    this.avatarCountText.setText(this.avatarCount + " avatars");
  };

  public setObjCounter = (val: number) => {
    this.objCount = val;
    this.objectCountText.setText(this.objCount + " objects");
  };

  public setAvatarCounter = (val: number) => {
    this.avatarCount = val;
    this.avatarCountText.setText(this.avatarCount + " avatars");
  };
}

export default class DemoScene extends Phaser.Scene {
  private atlas: LiveAtlas;
  private uiScene?: UIScene;

  create = () => {
    this.createAtlas();

    this.uiScene = this.scene.add("ui", UIScene, true) as UIScene;
    this.scene.bringToTop(this.uiScene);

    const numObjs = objectData.length;
    const numAvatars = avatarData.length;
    let counter = -10;
    let avCounter = -10;
    let isPixel = true;
    let numRods = 0;
    let visible = true;

    let waterfallManager:Phaser.GameObjects.Particles.ParticleEmitterManager|undefined;
    let waterfallEmitter:Phaser.GameObjects.Particles.ParticleEmitter|undefined;

    let hasBrush = false;

    const blitter = this.add.blitter(0,0,this.atlas.textureKey);


    const api = {
      toggleVisibility: () => {
        visible = !visible;
        this.atlas.setDebugVisible(visible);
      },
      loadObjects: () => {
        counter += 10;
        counter %= numObjs;
        return this.loadObjects(counter, counter + 10);
      },
      loadAvatars: () => {
        avCounter += 10;
        avCounter %= numAvatars;
        return this.loadAvatars(avCounter, avCounter + 10);
      },

      addFishingRod: async () => {
        const liveAtlas = this.atlas;
        // Load the spritesheet into the atlas before use
        await liveAtlas.add.spritesheet('fishing', '/fishing-sheet.png', {
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


        numRods += 1;

        // Use `make.sprite` to create a sprite which uses the atlas for rendering + animation frames.
        // (Here, 'idle' is the default animation played once the sprite is added to the scene.)
        const fishingRod = liveAtlas.make.sprite(numRods * 10, numRods * 10, 'fishing', 'idle');

        // Animations can be chained via `await`:
        const loop = async () => {
          await liveAtlas.anims.play('fishing', 'cast', fishingRod)
          await liveAtlas.anims.play('fishing', 'idle', fishingRod)
          if(Math.random() > 0.5){ await liveAtlas.anims.play('fishing', 'nibble', fishingRod); }
          await liveAtlas.anims.play('fishing', 'reel', fishingRod)
          loop();
        };
        loop();

      },

      toggleParticleSystem: async () => {
        if (waterfallManager) {
          waterfallEmitter.stop().killAll();
          waterfallManager.destroy();
          waterfallManager = undefined;
          waterfallEmitter = undefined;
          return;
        }

        waterfallManager = this.add.particles(this.atlas.textureKey);
        const frames = Object.keys(this.atlas.frames);
        waterfallEmitter = waterfallManager.createEmitter({
          x: {min: 0, max: this.atlas.renderTexture.width},
          y: 0,
          lifespan: 2000,
          gravityY: 300,
          alpha: {start: 1, end: 0.33},
          quantity: 1,
          frame: frames
        });
      },

      removeRandom: () => {
        this.removeRandom();
      },
      clear: () => {
        this.uiScene.setAvatarCounter(0);
        this.uiScene.setObjCounter(0);
        this.atlas.clearAll();
      },
      repack: () => {
        this.atlas.repack();
      },
      saveToBrowser: () => {
        this.atlas.save.toBrowserStorage();
      },
      saveToDisk: () => {
        this.atlas.save.toDiskFile();
      },
      loadFromBrowser: () => {
        this.atlas.load.fromBrowserStorage().then(() => {
          this.uiScene.setAvatarCounter(0);
          this.uiScene.setObjCounter(Object.keys(this.atlas.frames).length);
        });
      },
      loadFromNetworkRequest: () => {
        this.atlas.load.fromNetworkRequest("cached.json").then(() => {
          this.uiScene.setAvatarCounter(0);
          this.uiScene.setObjCounter(Object.keys(this.atlas.frames).length);
        });
      },
      renderToDOM: () => {
        this.atlas.save.toImage().then(img => {
          document.body.appendChild(img);
        });
      },
      togglePixelArt: () => {
        isPixel = !isPixel;
        this.atlas.setPixelArt(isPixel);
      },
      toggleFrameBrush: () => {
        hasBrush = !hasBrush;

        let i = 0;
        const frames = Object.keys(this.atlas.frames);
        const max = frames.length;
        this.input.on('pointermove', (pointer:Phaser.Input.Pointer) => {
          if (!hasBrush){ return; }
          blitter.create(pointer.worldX, pointer.worldY, frames[i]);
          i ++;
          i %= max;
        });
      }
    };
    const folder = gui.addFolder("Basic Usage");
    folder.add(api, "loadObjects");
    folder.add(api, "loadAvatars");

    folder.add(api, "removeRandom");
    folder.add(api, "repack");
    folder.add(api, "clear");

    const anims = gui.addFolder("Examples");
    anims.add(api, "addFishingRod");
    anims.add(api, "toggleParticleSystem");
    anims.add(api, "toggleFrameBrush");

    const serialization = gui.addFolder("Serialization");
    serialization.add(api, "saveToBrowser");
    serialization.add(api, "loadFromBrowser");
    serialization.add(api, "saveToDisk");
    serialization.add(api, "loadFromNetworkRequest");

    const other = gui.addFolder("Other");
    other.add(api, "togglePixelArt");

    const debugging = gui.addFolder("Debugging");
    debugging.add(api, "toggleVisibility");
    debugging.add(api, "renderToDOM");
  };

  // lastRun = Date.now();
  // currentRun = Date.now();
  update = (time: number, delta: number): void => {
    // this.currentRun = Date.now();
    // if (this.currentRun - this.lastRun < 1000 / 24) {
    //   return;
    // }
    // this.lastRun = this.currentRun;
    const cam = this.cameras.main;
    if (!this.atlas.renderTexture.visible){
      cam.setZoom(1);
      cam.setPosition(0,0);
      return;
    }
    const dist = this.atlas.renderTexture.width;
    const min = Math.min(this.scale.width, this.scale.height) / 1.25;
    cam.setZoom(
      Phaser.Math.Linear(cam.zoom, Phaser.Math.Clamp(min / dist, 0, 10), 0.5)
    );
    cam.centerOn(
      this.atlas.renderTexture.x + this.atlas.renderTexture.width / 2,
      this.atlas.renderTexture.y + this.atlas.renderTexture.height / 2
    );
  };

  removeRandom = () => {
    const frameKeys = Object.keys(this.atlas.frames);
    const randomKey = frameKeys[Math.floor(Math.random() * frameKeys.length)];
    console.log("Removing " + randomKey);
    this.atlas.removeFrame(randomKey, true);
  };

  loadObjects = (start: number, end: number) => {
    const itemsToLoad = objectData.slice(start, end);
    if (!itemsToLoad.length) {
      console.log("Loaded all available items");
      return;
    }
    this.atlas.add.imageList(itemsToLoad).then(() => {
      this.uiScene.adjObjCounter(itemsToLoad.length);
    });
  };

  loadAvatars = (start: number, end: number) => {
    const avatarsToload = avatarData.slice(start, end);
    if (!avatarsToload.length) {
      console.log("Loaded all available avatars");
      return;
    }
    for (const url of avatarsToload) {
      this.atlas.add.spritesheet(url, url, {
        dimensions: { width: 32, height: 64 },
      });
    }

    this.uiScene.adjAvatarCounter(avatarsToload.length);
  };

  private createAtlas() {
    this.atlas = new LiveAtlas(this, "main-pixel");
    this.atlas.setPixelArt(true).setDebugVisible(true);
    this.atlas.renderTexture.setOrigin(0, 0);
  }
}
