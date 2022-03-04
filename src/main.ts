import Phaser from 'phaser';
import MainScene from './scenes/MainScene';

setTimeout(()=>{
  new Phaser.Game({
    type: Phaser.CANVAS,
    pixelArt: true,
    width: 4096,
    height: 4096,
    backgroundColor: 0x010101,
    // scale: {
      // mode: Phaser.Scale.FIT,
    // },
    // Remove or comment to disable physics
    physics: {
      default: 'arcade',
      arcade: {
        gravity: {
          y: 100,
        }
      }
    },
    // Entry point
    scene: MainScene // or PhysicsScene
  })

}, 1000);
