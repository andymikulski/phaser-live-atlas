import Phaser from 'phaser';
import objectData from './objectData';

export const asyncLoader = (loadKey: string, loaderPlugin: Phaser.Loader.LoaderPlugin) => {
  return new Promise<void>((resolve, reject) => {
    loaderPlugin
      .on("filecomplete", (key: string, _type: "audio" | "json", _info: any) => {
        if (key === loadKey) {
        // console.log('file complete', key);
        resolve();
        }
      })
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
    this.load.image('mario', 'https://i.imgur.com/nKgMvuj.png');
    this.load.image('background', 'https://i.imgur.com/dzpw15B.jpg');
  };
  create = () => {
    // console.log('start');

    this.add.text(0, 0, 'Main Scene - no physics', { color: '#fff', fontSize: '16px' });

    this.add.image(0, 0, 'background')
      .setVisible(false)
      .setOrigin(0, 0) // Anchor to top left so (0,0) is flush against the corner
      .setDisplaySize(1024, 768) // Fit background image to window
      .setDepth(-1); // Behind everything

    let mario;
    for (let i = 0; i < NUM_MARIOS; i++) {
      mario = this.add.image(32, 32, 'mario')
        .setData('velocity', { x: Math.random() * 500, y: Math.random() * 500 })
        .setDisplaySize(32, 32);

      this.marios.push(mario);
    }


    const atlas = this.make.renderTexture({ width: 4096, height: 4096 }).setVisible(false);
    // const backbuffer = this.make.renderTexture({ width: 4096, height: 4096 }).setVisible(false);
    atlas.fill(0xFF0000, 1.0, 0, 0, 4096, 4096);


    this.cameras.main.setZoom(0.15);
    this.cameras.main.centerOn(4096 / 2, 4096 / 2);


    atlas.saveTexture('asdf');
    this.add.image(10, 10, 'asdf').setOrigin(0, 0);

    this.loadBunchaObjects(atlas); //, backbuffer);

    // const imgUrl = "https://cdn.gather.town/storage.googleapis.com/gather-town.appspot.com/uploads/lPnkx7ZwDqHgb6Td/wnfSaCjj7OaQMEU9oukAjd";
    // this.importImage(atlas, backbuffer, objectList[i]);
        // const imgUrl = 'https://i.imgur.com/nKgMvuj.png';
  };

  loadBunchaObjects = async (atlas: Phaser.GameObjects.RenderTexture) => {
    const objectList = Object.values(objectData).reduce((acc, curr)=>{
      if(acc.indexOf(curr.normal) === -1){
        acc.push(curr.normal);
      }
      
      return acc;
    }, [] as string[]);

    for (let i = 0; i < objectList.length; i++) {
      // console.log('i..', i);
      try {
        await this.importImage(atlas, objectList[i]);
        // console.log('after importimg', i)
      }catch(err){
        // console.log('err in ',i,err)
      }
      // console.log('second i', i);
    }

    // console.log('here after stuff');
  }

  private atlasCursorX = 0;
  private atlasCursorY = 0;

  importImage = async (
    atlas: Phaser.GameObjects.RenderTexture,
    // backbuffer: Phaser.GameObjects.RenderTexture,
    imgUrl: string
  ) => {
    return new Promise<void>((res, rej) => {
      // console.log('import img..')
      asyncLoader(imgUrl, this.load.image(imgUrl)).then(() => {
        console.time('add to rt');
        // backbuffer.resize(atlas.width, atlas.height);
        // backbuffer.draw(atlas);

        const img = this.add.image(0, 0, imgUrl);

        const baseWidth = atlas.width;
        const baseHeight = atlas.height;

        // atlas.resize(
        //   atlas.width, // + img.frame.width,
        //   atlas.height, // + img.frame.height,
        // );
        // atlas.draw(backbuffer, 0, 0);
        atlas.draw(img, Math.random() * 4096, Math.random() * 4096);
        img.destroy(true);
        this.textures.remove(imgUrl);

        // backbuffer.resize(0, 0);
        console.timeEnd('add to rt');
        res();
      }).catch(()=>{
        // console.log('err here...');
        rej();
      });

    });
  }

  update = (time: number, delta: number) => {
    // do something every tick here
    let mario;
    let velocity;
    for (let i = 0; i < this.marios.length; i++) {
      mario = this.marios[i];
      velocity = mario.getData('velocity') as {x:number; y:number;};

      // Move the thing
      mario.x += velocity.x * delta * 0.001;
      mario.y += velocity.y * delta * 0.001;

      // Check if we hit a boundary and bounce
      if (mario.x > 1024 || mario.x < 0){
        velocity.x *= -1;
      }
      if (mario.y > 768 || mario.y < 0){
        velocity.y *= -1;
      }
      mario.setData('velocity', velocity)
    }
  }
}
