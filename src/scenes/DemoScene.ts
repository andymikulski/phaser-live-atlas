import Phaser from "phaser";
import { LiveAtlas } from "../live-atlas/lib/LiveAtlas";
import objectData from "./objectData";

export default class DemoScene extends Phaser.Scene {
  preload = () => {
    this.load.image("background", "https://i.imgur.com/dzpw15B.jpg");
  };

  private pixelAtlas: LiveAtlas;
  private smoothAtlas: LiveAtlas;

  create = () => {
    this.add
      .image(0, 0, "background")
      .setAlpha(0.33)
      // .setVisible(false)
      .setOrigin(0, 0) // Anchor to top left so (0,0) is flush against the corner
      .setDisplaySize(1024, 768) // Fit background image to window
      .setDepth(-1); // Behind everything

    this.pixelAtlas = new LiveAtlas(this, "main-pixel");
    this.pixelAtlas.setPixelArt(true).setDebugVisible(true);
    this.smoothAtlas = new LiveAtlas(this, "main-smooth");
    this.smoothAtlas.setDebugVisible(true);
    this.smoothAtlas.renderTexture.setPosition(100, 100);

    this.pixelAtlas.add.spritesheet('confetti-1', '/confetti-1.png', {
      dimensions: {
        width: 160,
        height: 160,
      },
      anims: {
        'default': {
          frameRate: 60,
          start: 0,
          end: 71,
        },
      }
    }).then(()=>{
      this.pixelAtlas.make.animation(100, 100, 'confetti-1').setScale(5);
    });
  }
}
