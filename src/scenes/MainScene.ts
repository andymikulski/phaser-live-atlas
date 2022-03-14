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
    this.cameras.main.setZoom(4).centerOn(0,0);
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

    this.liveAtlas.setPixelArt(true);

    this.liveAtlas.addFrame("https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/oxrhEtb3sV7VutbQ/AQ9yOcyOnUkIV70MPl8LcL").then(()=>{
      this.liveAtlas.removeFrame("https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/oxrhEtb3sV7VutbQ/AQ9yOcyOnUkIV70MPl8LcL", true);
    });

    console.time("load existing from storage");
    this.liveAtlas.loadFromLocalStorage().then(() => {
      console.timeEnd("load existing from storage");

      this.liveAtlas.getStoredByteSize().then((bytes)=>{
        console.log('stored bytes', bytes);
      });

      this.loadBunchaObjects();

      (window as any).loadBunchaObjects = this.loadBunchaObjects;
    });
  };

  loadBunchaObjects = async (start = 0, end = 20) => {
    const objectList = objectData.slice(start, end);

    this.pendingCount = objectList.length;

    for (let i = 0; i < objectList.length; i++) {
      if (!this.liveAtlas.hasFrame(objectList[i])) {
        this.liveAtlas.addFrame(objectList[i]).then(() => {
          this.loadedCount += 1;

          const img = this.add.image(
            0,
            0,
            this.liveAtlas.textureKey,
            objectList[i]
          );

          img.setData("velocity", {
            x: Math.random() * 500,
            y: Math.random() * 500,
          });

          this.marios.push(img);
        });
      } else {
        this.loadedCount += 1;

        const img = this.add.image(
          0,
          0,
          this.liveAtlas.textureKey,
          objectList[i]
        );

        img.setData("velocity", {
          x: Math.random() * 500,
          y: Math.random() * 500,
        });

        this.marios.push(img);
      }
      this.pendingCount -= 1;
    }

    console.log("done");
    (window as any).saveRT = async () => {
      await this.liveAtlas.saveToLocalStorage();
      console.log('stored size', await this.liveAtlas.getStoredByteSize());
    };

    let removeCount = 0;
    (window as any).removeNext = () => {
      this.liveAtlas.removeFrame(objectList[removeCount], true);
      removeCount += 1;
    };
    (window as any).repack = this.liveAtlas.repack.bind(this.liveAtlas);
  };
  update = (time: number, delta: number) => {
    // do something every tick here
    let mario;
    let velocity;
    for (let i = 0; i < this.marios.length; i++) {
      mario = this.marios[i];
      velocity = mario.getData("velocity") as { x: number; y: number };

      // Move the thing
      mario.x += velocity.x * delta * 0.001;
      mario.y += velocity.y * delta * 0.001;
      mario.angle += velocity.x * delta * 0.001;

      // Check if we hit a boundary and bounce
      if (mario.x > 1024 || mario.x < 0) {
        velocity.x *= -1;
      }
      if (mario.y > 768 || mario.y < 0) {
        velocity.y *= -1;
      }
      mario.setData("velocity", velocity);
    }
  };


}
