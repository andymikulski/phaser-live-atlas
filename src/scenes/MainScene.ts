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
      .setAlpha(0.33)
      // .setVisible(false)
      .setOrigin(0, 0) // Anchor to top left so (0,0) is flush against the corner
      .setDisplaySize(1024, 768) // Fit background image to window
      .setDepth(-1); // Behind everything

    this.liveAtlas = new LiveAtlas(this, "main");
    this.liveAtlas.setPixelArt(true).setDebugVisible(false);

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
    (window as any).thing = async () => {
      await this.liveAtlas.add.spritesheet('confetti-1', '/confetti-1.png', {
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
      })
      this.liveAtlas.add.spritesheet('fishing-sheet', '/fishing-sheet.png', {
        dimensions: {
          width: 96,
          height: 64,
        },
        anims: {
          cast: { frameRate: 6, start: 0, end: 13 },
          idle: { frameRate: 3, start: 11, end: 13, yoyo: true, repeat: Phaser.FOREVER },
          nibble: { frameRate: 6, start: 14, end: 17, repeat: Phaser.FOREVER },
          friction: { frameRate: 8, start: 18, end: 21, yoyo: true, repeat: Phaser.FOREVER },
          "reel-in": { frameRate: 8, start: 22, end: 33 },
        }
      }).then(()=>{
        const makePole = () => {
          const fishingRod = this.liveAtlas.make.sprite(Math.random() * this.scale.width, Math.random() * this.scale.height, 'fishing-sheet', 'idle');
        this.liveAtlas.anims.goto('fishing-sheet', 'cast', fishingRod);

        const doThing = async () => {
          await this.liveAtlas.anims.play('fishing-sheet', 'cast', fishingRod);
          await new Promise(res => setTimeout(res, 1000));

          this.liveAtlas.anims.play('fishing-sheet', 'idle', fishingRod);
          await new Promise(res => setTimeout(res, 300));

          this.liveAtlas.anims.play('fishing-sheet', 'nibble', fishingRod);
          await new Promise(res => setTimeout(res, 300));

          this.liveAtlas.anims.play('fishing-sheet', 'friction', fishingRod);
          await new Promise(res => setTimeout(res, 500));

          await this.liveAtlas.anims.play('fishing-sheet', 'reel-in', fishingRod);


          this.liveAtlas.anims.goto('fishing-sheet', 'cast', fishingRod);

          // fishingRod.setVisible(false);
          await new Promise(res => setTimeout(res, 2000));

          doThing();
        };

        doThing();
        }


        for(let i = 0; i < 100; i++){
          setTimeout(()=>{
            makePole();
          }, i * 10);
        }
      });


      // this.liveAtlas.add.spritesheet('confetti-1', '/confetti-1.png', {
      //   dimensions: {
      //     width: 160,
      //     height: 160,
      //   },
      //   anims: {
      //     'default': {
      //       frameRate: 60,
      //       start: 0,
      //       end: 71,
      //     },
      //   }
      // }).then(()=>{

      //   setInterval(()=>{
      //     this.liveAtlas.make.animation(this.scale.width * Math.random(), this.scale.height * Math.random(), 'confetti-1');
      //   }, 250);

      //   // const img = this.add.sprite(10, 10, this.liveAtlas.textureKey);
      //   // this.liveAtlas.anims.play('confetti-1', 'default', img);
      //   // const img = this.add.image(10, 10, this.liveAtlas.textureKey, 'fishing-sheet-1');
      //   // console.log("AHHH", img);
      //   // this.liveAtlas.anims.play('confetti', img);
      // });

      // this.liveAtlas.add.spritesheet('confetti', '/confetti-1.png', {
      //   dimensions: {
      //     width: 160,
      //     height: 160,
      //   }
      // }).then(()=>{
      //   this.anims.create({
      //     key: 'confetti-anim',
      //     frames: this.anims.generateFrameNames(this.liveAtlas.textureKey, {
      //       prefix: 'confetti-',
      //       start: 0,
      //       end: 70,
      //     }),
      //     duration: 1000,
      //     repeat: Phaser.FOREVER,
      //   });

      //   const img = this.add.sprite(100, 100, this.liveAtlas.textureKey);
      //   this.anims.play('confetti-anim', img);
      // })

      // this.liveAtlas.add.spritesheet('avatar', '/avatar.png', {
      //   dimensions: {
      //     width: 32,
      //     height: 64,
      //   }
      // });

      // this.liveAtlas.add.spritesheet('avatar2', '/avatar-2.png', {
      //   dimensions: {
      //     width: 32,
      //     height: 64,
      //   }
      // });
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
    return  this.liveAtlas.addMultipleFramesByURL(next);
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
