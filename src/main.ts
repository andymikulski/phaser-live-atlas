import Phaser from 'phaser';
import DemoScene from './scenes/DemoScene';

new Phaser.Game({
  type: Phaser.CANVAS,
  // pixelArt: true,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0xffffff,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
    expandParent: true
  },
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
});