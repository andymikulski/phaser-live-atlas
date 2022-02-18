import Phaser from "phaser";
import { LiveAtlas } from "./LiveAtlas";
import objectData from "./objectData";

export const asyncLoader = (
  loadKey: string,
  loaderPlugin: Phaser.Loader.LoaderPlugin
) => {
  return new Promise<void>((resolve, reject) => {
    loaderPlugin
      .on(
        "filecomplete",
        (key: string, _type: "audio" | "json", _info: any) => {
          if (key === loadKey) {
            // console.log('file complete', key);
            resolve();
          }
        }
      )
      .on("loaderror", (file: Phaser.Loader.FileTypes.ImageFile) => {
        // console.log('file rejected', file.key);
        if (file.key === loadKey) {
          reject();
        }
      });
    loaderPlugin.start();
  });
};

const NUM_MARIOS = 10;
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
    // console.log('start');

    this.liveAtlas = new LiveAtlas(this, "main");

    this.liveAtlas.addFrame("https://i.imgur.com/nKgMvuj.png").then(() => {
      console.log("mario should be availalbe", this.liveAtlas.textureKey());
      let mario;
      for (let i = 0; i < NUM_MARIOS; i++) {
        mario = this.add
          .image(
            32,
            32,
            this.liveAtlas.textureKey(),
            "https://i.imgur.com/nKgMvuj.png"
          )
          .setData("velocity", {
            x: Math.random() * 500,
            y: Math.random() * 500,
          })
          // .setSize(32, 32)
          .setDisplaySize(32, 32);
        this.marios.push(mario);
      }
    });

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

    this.loadBunchaObjects();
    // const atlas = this.make.renderTexture({ width: 4096, height: 4096 });
    // // .setVisible(false);
    // atlas.saveTexture("asdf");

    // this.importImage(atlas, "https://i.imgur.com/nKgMvuj.png").then(() => {
    //   let mario;
    //   for (let i = 0; i < NUM_MARIOS; i++) {
    //     mario = this.add
    //       .image(32, 32, "asdf", "https://i.imgur.com/nKgMvuj.png")
    //       .setData("velocity", {
    //         x: Math.random() * 500,
    //         y: Math.random() * 500,
    //       })
    //       // .setSize(32, 32)
    //       .setDisplaySize(32, 32);

    //     this.marios.push(mario);
    //   }
    // }).catch((err)=>{
    //   console.log('err importing mario', err);
    // })

    // // const backbuffer = this.make.renderTexture({ width: 4096, height: 4096 }).setVisible(false);
    // // atlas.fill(0xFF0000, 1.0, 0, 0, 4096, 4096);

    // // this.cameras.main.setZoom(0.15);
    // // this.cameras.main.centerOn(4096 / 2, 4096 / 2);

    // // this.add.image(10, 10, 'asdf').setOrigin(0, 0);

    // this.loadBunchaObjects(atlas); //, backbuffer);

    // // const imgUrl = "https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/lPnkx7ZwDqHgb6Td/wnfSaCjj7OaQMEU9oukAjd";
    // // this.importImage(atlas, backbuffer, objectList[i]);
    // // const imgUrl = 'https://i.imgur.com/nKgMvuj.png';
  };

  updateDebugText = () => {
    this.topLabel?.setText(
      this.loadedCount +
        " in atlas - " +
        this.failedCount +
        " failed - " +
        this.pendingCount +
        " pending"
    );
  };

  loadBunchaObjects = async () => {
    const objectList = Object.values(objectData).reduce((acc, curr) => {
      if (acc.indexOf(curr) === -1) {
        acc.push(curr);
      }
      return acc;
    }, [] as string[]);
    // const objectList = ["https://i.imgur.com/nKgMvuj.png"];

    this.pendingCount = objectList.length;

    for (let i = 0; i < objectList.length / 2; i++) {
      try {
        // await this.importImage(atlas, objectList[i]);
        await this.liveAtlas.addFrame(objectList[i]);
        this.loadedCount += 1;
        const img = this.add.image(
          0,
          0,
          this.liveAtlas.textureKey(),
          objectList[0]
        );

        img.setData("velocity", {
          x: Math.random() * 500,
          y: Math.random() * 500,
        });

        this.marios.push(img);
      } catch (err) {
        this.failedCount += 1;
        // console.log('err in ',i,err)
      }

      this.pendingCount -= 1;
      this.updateDebugText();
    }

    setInterval(()=>{

      const idx = 1 + (Math.random() * (objectList.length / 2) - 1) | 0;
      // remove random frame
      console.log('removing random frame...');
      this.liveAtlas.removeFrame(objectList[idx]);

      console.time('repack');
      this.liveAtlas.repack();
      console.timeEnd('repack');
    }, 5000);
  };

  // imageStamp: Phaser.GameObjects.Image;

  // private xCursor: number = 0;
  // private yCursor: number = 0;
  // private curRowHeight: number = 0;

  // importImage = async (
  //   atlas: Phaser.GameObjects.RenderTexture,
  //   // backbuffer: Phaser.GameObjects.RenderTexture,
  //   imgUrl: string
  // ) => {
  //   return new Promise<void>((res, rej) => {
  //     // Check if this texture already has this as a frame
  //     if (atlas.texture.has(imgUrl)) {
  //       res();
  //       return;
  //     }

  //     // console.log('import img..')
  //     asyncLoader(imgUrl, this.load.image(imgUrl))
  //       .then(() => {
  //         // backbuffer.resize(atlas.width, atlas.height);
  //         // backbuffer.draw(atlas);

  //         // const baseWidth = atlas.width;
  //         // const baseHeight = atlas.height;

  //         // atlas.resize(
  //         //   atlas.width, // + img.frame.width,
  //         //   atlas.height, // + img.frame.height,
  //         // );
  //         // atlas.draw(backbuffer, 0, 0);

  //         const img = this.add.image(0, 0, imgUrl).setOrigin(0, 0);

  //         this.curRowHeight = Math.max(this.curRowHeight, img.frame.realHeight);

  //         const x = this.xCursor;
  //         const y = this.yCursor;
  //         atlas.draw(img, x, y);
  //         img.setVisible(false).setActive(false).destroy(true);
  //         this.textures.remove(imgUrl);

  //         console.log("AHHH", img.texture);
  //         // Register `imgUrl` as a frame on this texture

  //         const frame = atlas.texture.add(
  //           imgUrl,
  //           0,
  //           x,
  //           y,
  //           img.frame.realWidth,
  //           img.frame.realHeight
  //         );
  //         console.log(
  //           "here..",
  //           imgUrl,
  //           img.frame.realWidth,
  //           img.frame.realHeight,
  //           "frame",
  //           frame.x,
  //           frame.y,
  //           frame.width,
  //           frame.height
  //         );
  //         // console.log('frame..', frame);

  //         this.xCursor += img.frame.realWidth;
  //         if (this.xCursor > 4096) {
  //           this.xCursor = 0;
  //           this.yCursor += this.curRowHeight;
  //           this.curRowHeight = 0;
  //         }
  //         // backbuffer.resize(0, 0);
  //         // console.timeEnd("add to rt");
  //         // console.log("add to rt", atlas.visible);
  //         res();
  //       })
  //       .catch((err) => {
  //         console.log("error loading img...", err);
  //         // console.log('err here...');
  //         rej(err);
  //       });
  //   });
  // };

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
