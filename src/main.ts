import Phaser from 'phaser';
import DemoScene from './scenes/DemoScene';

setTimeout(()=>{
  new Phaser.Game({
    type: Phaser.CANVAS,
    // pixelArt: true,
    width: 1024,
    height: 768,
    backgroundColor: 0xffffff,
    // scale: {
      // mode: Phaser.Scale.FIT,
    // },
    // Remove or comment to disable physics
    physics: {
      default: 'arcade',
      arcade: {
        debug: true,
        gravity: {
          y: 0,
        }
      }
    },
    // Entry point
    scene: DemoScene // or PhysicsScene
  })

}, 1000);
