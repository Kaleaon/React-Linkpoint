// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraScreen, EnvironmentScreen, SnapshotScreen } from '../../screens/ViewerControls.jsx';
import { app } from '../app';
import { WorldViewer } from '../world';
import { Utils } from '../utils';
import { mountScreen, unmount, click, buttonByText, typeInto, type Mounted } from './ui-helpers';
vi.mock('../../screens/World3D.jsx', () => ({ default: () => null }));
let mounted: Mounted | null = null;
afterEach(async () => { await unmount(mounted); mounted = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); app.world.setLocalEnvironment(null); });
it('camera controls dispatch real preset and orbit changes', async () => {
  const preset = vi.spyOn(app.world, 'setCameraPreset').mockImplementation(() => {});
  const rotate = vi.spyOn(app.world, 'rotateCamera').mockImplementation(() => {});
  mounted = await mountScreen(CameraScreen);
  await click(buttonByText(mounted.host, 'Front view'));
  await click(buttonByText(mounted.host, 'Left'));
  expect(preset).toHaveBeenCalledWith('front'); expect(rotate).toHaveBeenCalledWith(0, -10);
});
it('local environment selection preserves simulator environment and can restore region settings', async () => {
  const regionEnvironment = app.world.environment;
  mounted = await mountScreen(EnvironmentScreen);
  await typeInto(mounted.host.querySelector('select')!, '0.5');
  expect(app.world.localEnvironmentHour).toBe(0.5); expect(app.world.environment).toBe(regionEnvironment);
  await typeInto(mounted.host.querySelector('select')!, 'region');
  expect(app.world.localEnvironmentHour).toBeNull();
});
it('snapshot reports when a renderer is unavailable', async () => {
  mounted = await mountScreen(SnapshotScreen);
  await click(buttonByText(mounted.host, 'Save PNG snapshot'));
  expect(mounted.host.textContent).toContain('before taking a snapshot');
});
it('frame cap throttles draws and forwards FOV and draw distance to the renderer', () => {
  let callback: FrameRequestCallback;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { callback = cb; return 1; });
  const world = new WorldViewer(new Utils.EventEmitter());
  world.scene3d = { render: vi.fn() } as any;
  world.camera3d = { updateMatrices: vi.fn() } as any;
  vi.spyOn(world as any, 'applyEnvironment').mockImplementation(() => {});
  vi.spyOn(world as any, 'updateAnimatedSkins').mockImplementation(() => {});
  vi.spyOn(world as any, 'updateAnimatedAvatars').mockImplementation(() => {});
  vi.spyOn(world as any, 'updateParticles').mockImplementation(() => {});
  world.configureRendering({ drawDistance: 96, fov: 80, fps: 30, batterySaver: false });
  world.startRendering(); callback!(0); callback!(16); callback!(34);
  expect(world.scene3d!.render).toHaveBeenCalledTimes(2);
  expect(world.scene3d!.drawDistance).toBe(96); expect(world.camera3d!.fov).toBe(80);
});
