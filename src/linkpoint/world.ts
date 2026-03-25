/**
 * Linkpoint PWA - World Viewer Module
 */

import { Utils } from './utils';
import { Graphics3D } from './graphics-3d';
import { Camera3D } from './camera-3d';
import { Scene3D } from './scene-3d';

export class WorldViewer extends Utils.EventEmitter {
  public protocol: any;
  public canvas: HTMLCanvasElement | null = null;
  public graphics3d: Graphics3D | null = null;
  public camera3d: Camera3D | null = null;
  public scene3d: Scene3D | null = null;
  private animationId: number | null = null;
  public use3D: boolean = true;
  
  public region: any = { name: 'Simulated Region', x: 256000, y: 256000 };
  public objects: any[] = [];

  constructor(protocolManager: any) {
    super();
    this.protocol = protocolManager;
  }

  async init() {
    this.canvas = document.getElementById('world-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;

    try {
      this.graphics3d = new Graphics3D(this.canvas);
      await this.graphics3d.init();

      this.camera3d = new Camera3D();
      this.camera3d.setPosition(128, 138, 35);
      this.camera3d.setRotation(-0.3, -Math.PI / 2, 0);
      this.camera3d.setMode('orbit');
      this.camera3d.setOrbitTarget(128, 128, 25);

      this.scene3d = new Scene3D(this.graphics3d, this.camera3d);
      await this.scene3d.init();

      this.addDemo3DObjects();
      this.startRendering();
      this.updateLocationDisplay();
    } catch (error) {
      console.error('3D initialization failed:', error);
      this.use3D = false;
    }

    window.addEventListener('resize', () => this.resizeCanvas());
    this.resizeCanvas();
  }

  private addDemo3DObjects() {
    if (!this.scene3d) return;

    this.scene3d.addObject('ground', {
      mesh: 'plane',
      position: [128, 128, 0],
      scale: [25.6, 25.6, 1],
      color: [0.2, 0.4, 0.2, 1]
    });

    for (let i = 0; i < 5; i++) {
      this.scene3d.addObject(`cube_${i}`, {
        mesh: 'cube',
        position: [128 + (Math.random() - 0.5) * 50, 128 + (Math.random() - 0.5) * 50, 2],
        scale: [4, 4, 4],
        color: [Math.random(), Math.random(), Math.random(), 1]
      });
    }
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth;
      this.canvas.height = parent.clientHeight;
      if (this.graphics3d) this.graphics3d.resize(this.canvas.width, this.canvas.height);
    }
  }

  public startRendering() {
    const render = (time: number) => {
      if (this.use3D && this.scene3d && this.camera3d) {
        this.camera3d.updateMatrices();
        this.scene3d.render();
      }
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  public stopRendering() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
  }

  public updateLocationDisplay() {
    const regionName = document.getElementById('region-name');
    const coordinates = document.getElementById('coordinates');
    if (regionName) regionName.textContent = this.region.name;
    if (coordinates && this.camera3d) {
      const [x, y, z] = this.camera3d.position;
      coordinates.textContent = `${Math.floor(x)}, ${Math.floor(y)}, ${Math.floor(z)}`;
    }
  }

  public moveCamera(dx: number, dy: number, dz: number) {
    if (this.camera3d) {
      this.camera3d.move(dy, dx, dz);
      this.updateLocationDisplay();
    }
  }
}
