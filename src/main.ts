import Phaser from 'phaser';
import MainScene from './scenes/MainScene';

new Phaser.Game({
  // type: Phaser.CANVAS,
  width: 1024,
  height: 768,
  backgroundColor: 0xA1E064,
  scale: {
    mode: Phaser.Scale.FIT,
  },
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
