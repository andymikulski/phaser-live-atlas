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
  private loadedCount: number = 0;
  private failedCount: number = 0;
  private pendingCount: number = 0;

  private liveAtlas: LiveAtlas;

  create = () => {
    this.topLabel = this.add.text(0, 0, "0 in atlas - 0 failed - 0 pending", {
      color: "#fff",
      fontSize: "16px",
    });

    this.add
      .image(0, 0, "background")
      // .setVisible(false)
      .setOrigin(0, 0) // Anchor to top left so (0,0) is flush against the corner
      .setDisplaySize(1024, 768) // Fit background image to window
      .setDepth(-1); // Behind everything

    // console.log('start');

    this.liveAtlas = new LiveAtlas(this, "main");
    this.liveAtlas.setPixelArt(true).setDebugVisible(true);


    fetch('/cache/live-atlas-main.atlas').then(x => x.blob()).then(blob => {
      this.liveAtlas.load.fromDiskFile(blob).then(()=>{
        console.log('AHHHH');
      })
    }).catch(err => {
      console.log('err', err);
    });

    (window as any).atlas = this.liveAtlas;

    // this.liveAtlas.load.fromBrowserStorage().then(() => {
      // this.loadBunchaObjects(2500, 2520);
      (window as any).loadBunchaObjects = this.loadBunchaObjects;
      (window as any).save = this.liveAtlas.save.toBrowserStorage.bind(this.liveAtlas);
      (window as any).load = this.liveAtlas.load.fromBrowserStorage.bind(this.liveAtlas);
    // });
  };

  loadBunchaObjects = async (start = 0, end = 20) => {
    this.liveAtlas.addMultipleFramesByURL(objectData).then(()=>{
      console.log('DONE!');
      this.liveAtlas.save.toDiskFile();
    })
    // const objectList = objectData.slice(start, end);

    // this.pendingCount = objectList.length;

    // for (let i = 0; i < objectList.length; i++) {
    //   this.loadedCount += 1;

    //   this.pendingCount -= 1;
    // }
    //   const img = this.liveAtlas.make.image(0, 0, objectList[i]);

    //   img.setPosition(Math.random() * 500, Math.random() * 500);

    //   img.setData("velocity", {
    //     x: Math.random() * 500,
    //     y: Math.random() * 500,
    //   });

    //   this.marios.push(img);
    //   this.pendingCount -= 1;
    // }

  };
  // update = (time: number, delta: number) => {
  //   // do something every tick here
  //   let mario;
  //   let velocity;
  //   for (let i = 0; i < this.marios.length; i++) {
  //     mario = this.marios[i];
  //     velocity = mario.getData("velocity") as { x: number; y: number };

  //     // Move the thing
  //     mario.x += velocity.x * delta * 0.001;
  //     mario.y += velocity.y * delta * 0.001;
  //     mario.angle += velocity.x * delta * 0.001;

  //     // Check if we hit a boundary and bounce
  //     if (mario.x > 1024 || mario.x < 0) {
  //       velocity.x *= -1;
  //     }
  //     if (mario.y > 768 || mario.y < 0) {
  //       velocity.y *= -1;
  //     }
  //     mario.setData("velocity", velocity);
  //   }
  // };
}
