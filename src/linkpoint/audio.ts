import { Utils } from './utils';

type SoundEvent = { action: string; soundId?: string; objectId?: string; position?: number[]; gain?: number; flags?: number; sounds?: Array<{ soundId: string }> };

/** Web Audio renderer for SL trigger, attached, looping, queued, gain and preload messages. */
export class AudioManager extends Utils.EventEmitter {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, SoundEvent[]>();
  private attached = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private positions = new Map<string, number[]>();
  private volume = .7;

  constructor(private protocol: { on: (event: string, listener: Function) => void }) { super(); }

  init() {
    this.protocol.on('scene:sound-asset', (asset: any) => void this.acceptAsset(asset));
    this.protocol.on('scene:sound-event', (event: SoundEvent) => this.acceptEvent(event));
    this.protocol.on('scene:object-add', (object: any) => this.rememberObject(object));
    this.protocol.on('scene:object-update', (object: any) => this.rememberObject(object));
    this.protocol.on('scene:object-remove', (object: any) => { this.positions.delete(String(object.id)); this.stop(String(object.id)); });
    const unlock = () => void this.context?.resume();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master) this.master.gain.value = this.volume;
  }

  private audioContext() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  private rememberObject(object: any) {
    if (object?.id && Array.isArray(object.position)) this.positions.set(String(object.id), object.position);
  }

  private async acceptAsset(asset: any) {
    if (!asset?.assetId || !asset.data) return;
    try {
      const binary = atob(asset.data);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const buffer = await this.audioContext().decodeAudioData(bytes.buffer);
      this.buffers.set(asset.assetId, buffer);
      for (const event of this.pending.get(asset.assetId) || []) this.play(event);
      this.pending.delete(asset.assetId);
    } catch (error) { this.emit('error', { assetId: asset.assetId, error }); }
  }

  private acceptEvent(event: SoundEvent) {
    if (event.action === 'gain') {
      const active = this.attached.get(String(event.objectId));
      if (active) active.gain.gain.setTargetAtTime(event.gain || 0, this.audioContext().currentTime, .02);
      return;
    }
    if (event.action === 'stop') { this.stop(String(event.objectId)); return; }
    if (event.action === 'preload') return;
    if (!event.soundId) return;
    if (!this.buffers.has(event.soundId)) {
      this.pending.set(event.soundId, [...(this.pending.get(event.soundId) || []), event]);
      return;
    }
    this.play(event);
  }

  private play(event: SoundEvent) {
    const context = this.audioContext();
    const buffer = this.buffers.get(event.soundId!);
    if (!buffer || !this.master) return;
    const objectId = String(event.objectId || '');
    if (event.action === 'attached' && !(event.flags! & 16)) this.stop(objectId);
    const source = context.createBufferSource();
    const gain = context.createGain();
    const panner = context.createPanner();
    const pos = event.position || this.positions.get(objectId) || [128, 128, 25];
    source.buffer = buffer;
    source.loop = Boolean(event.flags! & 1);
    gain.gain.value = Math.max(0, Math.min(1, event.gain ?? 1));
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.maxDistance = 100; panner.rolloffFactor = 1;
    panner.positionX.value = pos[0] || 0; panner.positionY.value = pos[2] || 0; panner.positionZ.value = -(pos[1] || 0);
    source.connect(gain).connect(panner).connect(this.master);
    if (event.action === 'attached') this.attached.set(objectId, { source, gain });
    source.onended = () => { if (this.attached.get(objectId)?.source === source) this.attached.delete(objectId); };
    source.start();
  }

  private stop(objectId: string) {
    const active = this.attached.get(objectId);
    if (active) { try { active.source.stop(); } catch { /* already ended */ } this.attached.delete(objectId); }
  }
}
