import Phaser from "phaser";
import { LiveAtlas } from "../live-atlas/lib/LiveAtlas";
import objectData from "./objectData";
import avatarData from "./avatarData";

export default class DemoScene extends Phaser.Scene {
  preload = () => {
    // this.load.image("background", "https://i.imgur.com/dzpw15B.jpg");
  };

  private atlas: LiveAtlas;

  create = () => {
    // this.add
    //   .image(0, 0, "background")
    //   .setAlpha(0.33)
    //   // .setVisible(false)
    //   .setOrigin(0, 0) // Anchor to top left so (0,0) is flush against the corner
    //   .setDisplaySize(1024, 768) // Fit background image to window
    //   .setDepth(-1); // Behind everything

    this.atlas = new LiveAtlas(this, "main-pixel");
    this.atlas.setPixelArt(true).setDebugVisible(true);

    this.atlas.renderTexture.setOrigin(0,0);
    (window as any).atlas = this.atlas;
    (window as any).loadObjects = this.loadObjects.bind(this);
    (window as any).loadAvatars = this.loadAvatars.bind(this);
    (window as any).removeRandom = this.removeRandom.bind(this);

    (window as any).loadConfetti = () => {
      this.atlas.add
      .spritesheet("confetti-1", "/confetti-1.png", {
        dimensions: {
          width: 160,
          height: 160,
        },
        anims: {
          default: {
            frameRate: 60,
            start: 0,
            end: 71,
          },
        },
      })
      .then(() => {
        setInterval(() => {
          this.atlas.make
            .animation(
              Math.random() * this.scale.width,
              Math.random() * this.scale.height,
              "confetti-1"
            )
            .setScale(1 + Math.random());
        }, 333);
      });
    }
  };

  update = (time: number, delta: number): void => {
    const dist = this.atlas.renderTexture.width;
    const cam = this.cameras.main;
    const min = Math.min(this.scale.width, this.scale.height) / 1.1;

    cam.setZoom(
      Phaser.Math.Linear(
        cam.zoom,
        Phaser.Math.Clamp(min / dist, 0, 10),
        0.5
      )
    );
    cam.centerOn(this.atlas.renderTexture.x + this.atlas.renderTexture.width/2, this.atlas.renderTexture.y + this.atlas.renderTexture.height/2);
    // cam.setPosition(this.atlas.renderTexture.width / 2, this.atlas.renderTexture.height / 2);
  }

  removeRandom = () => {
    const frameKeys = Object.keys(this.atlas.frames);
    const randomKey = frameKeys[Math.random()* frameKeys.length];
    this.atlas.removeFrame(randomKey, true);
  }

  loadObjects = (start: number, end: number) => {
    const itemsToLoad = objectData.slice(start, end);
    this.atlas.add.imageList(itemsToLoad);
  };

  loadAvatars = (start:number, end: number) => {
    const avatarsToload = avatarData.slice(start, end);
    for(const url of avatarsToload){
      this.atlas.add.spritesheet(url, url, {
        dimensions: { width: 32, height: 64 },
      });
    }
  }
}
