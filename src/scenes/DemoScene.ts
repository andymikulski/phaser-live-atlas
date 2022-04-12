import Phaser from "phaser";
import { LiveAtlas } from "../live-atlas/lib/LiveAtlas";
import objectData from "./objectData";
import avatarData from "./avatarData";
import * as dat from "dat.gui";

const gui = new dat.GUI();

export default class DemoScene extends Phaser.Scene {
  private atlas: LiveAtlas;

  create = () => {
    this.createAtlas();

    const numObjs = objectData.length;
    const numAvatars = avatarData.length;
    let counter = -10;
    let avCounter = -10;
    const api = {
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
      removeRandom: () => {
        this.removeRandom();
      },
      clear: () => {
        this.atlas.clearAll();
      },
      repack: () => {
        this.atlas.repack();
      },
    };
    gui.add(api, "loadObjects");
    gui.add(api, "loadAvatars");
    gui.add(api, "removeRandom");
    gui.add(api, "repack");
    gui.add(api, "clear");
  };

  update = (time: number, delta: number): void => {
    const dist = this.atlas.renderTexture.width;
    const cam = this.cameras.main;
    const min = Math.min(this.scale.width, this.scale.height) / 1.025;

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
    this.atlas.add.imageList(itemsToLoad);
  };

  loadAvatars = (start: number, end: number) => {
    const avatarsToload = avatarData.slice(start, end);
    for (const url of avatarsToload) {
      this.atlas.add.spritesheet(url, url, {
        dimensions: { width: 32, height: 64 },
      });
    }
  };

  private createAtlas() {
    this.atlas = new LiveAtlas(this, "main-pixel");
    this.atlas.setPixelArt(true).setDebugVisible(true);
    this.atlas.renderTexture.setOrigin(0, 0);
  }
}
