import Phaser from "phaser";
import { LiveAtlas } from "../live-atlas/LiveAtlas";
import objectData from "./objectData";

export default class MainScene extends Phaser.Scene {
  private marios: Phaser.GameObjects.Image[] = [];

  preload = () => {
    // this.load.image("mario", "https://i.imgur.com/nKgMvuj.png");
    this.load.image("background", "https://i.imgur.com/dzpw15B.jpg");
  };

  private topLabel?: Phaser.GameObjects.Text;

  private liveAtlas: LiveAtlas;
  private isRunning = true;
  create = () => {
    this.topLabel = this.add.text(0, 0, "0:00", {
      color: "#fff",
      fontSize: "16px",
    }).setDepth(Infinity);

    this.add
      .image(0, 0, "background")
      // .setVisible(false)
      .setOrigin(0, 0) // Anchor to top left so (0,0) is flush against the corner
      .setDisplaySize(1024, 768) // Fit background image to window
      .setDepth(-1); // Behind everything

    this.liveAtlas = new LiveAtlas(this, "main");
    this.liveAtlas.setPixelArt(true).setDebugVisible(true);

    // this.liveAtlas.load.fromBrowserStorage().then(()=>{
    //   // setTimeout(()=>{
        // this.liveAtlas.load.fromNetworkRequest("/cache/live-atlas-main.atlas").then(()=>{
        //   this.isRunning = false;
        // });
    //   // }, 1000);
    // });

    (window as any).atlas = this.liveAtlas;

    // this.liveAtlas.load.fromBrowserStorage().then(() => {
    // this.loadBunchaObjects(2500, 2520);
    (window as any).removeRandom = (immediately = true)=>{
      const random = Math.floor(Math.random()*this.loadedFrames.length);
      const val = this.loadedFrames[random];
      const left = this.loadedFrames.slice(0, random);
      const right = this.loadedFrames.slice(random + 1);
      this.loadedFrames = left.concat(right);
      this.liveAtlas.removeFrame(val, immediately);
    };
    (window as any).thing = () => {
      this.liveAtlas.add.spritesheet('fishing-sheet', '/fishing-sheet.png', {
        dimensions: {
          width: 96,
          height: 64,
        }
      });

      this.liveAtlas.add.spritesheet('confetti', '/confetti-1.png', {
        dimensions: {
          width: 160,
          height: 160,
        }
      });

      this.liveAtlas.add.spritesheet('avatar', '/avatar.png', {
        dimensions: {
          width: 32,
          height: 64,
        }
      });

      this.liveAtlas.add.spritesheet('avatar2', '/avatar-2.png', {
        dimensions: {
          width: 32,
          height: 64,
        }
      });
    };
    (window as any).loadBunchaObjects = this.loadBunchaObjects;
    (window as any).save = this.liveAtlas.save.toBrowserStorage.bind(
      this.liveAtlas
    );
    (window as any).load = this.liveAtlas.load.fromBrowserStorage.bind(
      this.liveAtlas
    );
    // });
  };

  private loadedFrames:string[] = [];

  loadBunchaObjects = async (start = 0, end = 20) => {
    const next = objectData.slice(start, end);
    Array.prototype.push.apply(this.loadedFrames, next);
    this.liveAtlas.addMultipleFramesByURL(next);
    // .then(() => {
      // console.log("DONE!");
      // this.liveAtlas.save.toDiskFile();

      // for (let i = start; i < end; i++) {
        // this.loadedCount += 1;

        // this.pendingCount -= 1;
        // const img = this.liveAtlas.make.image(0, 0, objectData[i]);

        // img.setData("velocity", {
        //   x: Math.random() * 500,
        //   y: Math.random() * 500,
        // });

        // this.marios.push(img);
        // this.pendingCount -= 1;
      // }

      // this.isRunning = false;
    // });
    // const objectList = objectData.slice(start, end);

    // this.pendingCount = objectList.length;
  };
  update = (time: number, delta: number) => {
    if (this.isRunning){
      this.topLabel.setText(time.toString());
    }
    // do something every tick here
    // let mario;
    // let velocity;
    // for (let i = 0; i < this.marios.length; i++) {
    //   mario = this.marios[i];
    //   velocity = mario.getData("velocity") as { x: number; y: number };

    //   // Move the thing
    //   mario.x += velocity.x * delta * 0.001;
    //   mario.y += velocity.y * delta * 0.001;
    //   mario.angle += velocity.x * delta * 0.001;

    //   // Check if we hit a boundary and bounce
    //   if (mario.x > 1024 || mario.x < 0) {
    //     velocity.x *= -1;
    //   }
    //   if (mario.y > 768 || mario.y < 0) {
    //     velocity.y *= -1;
    //   }
    //   mario.setData("velocity", velocity);
    // }
  };
}
