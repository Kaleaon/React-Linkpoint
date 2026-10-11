import { useEffect, useState } from 'react';
import { app } from '../linkpoint/app.ts';
import FormField from './FormField.jsx';

export default function VoiceDevices() {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState(() => app.voice.getDevices());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [connecting, setConnecting] = useState(app.voice.state === 'connecting');
  const supported = Boolean(navigator.mediaDevices?.enumerateDevices);
  const outputSupported = 'setSinkId' in HTMLMediaElement.prototype;

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!supported) return;
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (active)
          setDevices(list.filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput'));
      } catch (error) {
        if (active) setNote(error.message || 'Audio devices could not be listed.');
      }
    };
    const stateChanged = ({ state }) => {
      setConnecting(state === 'connecting');
      void refresh();
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    app.voice.on('state', stateChanged);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
      app.voice.off('state', stateChanged);
    };
  }, [supported]);

  const choose = async (kind, deviceId) => {
    setBusy(true);
    setNote('');
    try {
      if (kind === 'audioinput') await app.voice.setInputDevice(deviceId);
      else await app.voice.setOutputDevice(deviceId);
      setSelected(app.voice.getDevices());
    } catch (error) {
      setNote(error.message || 'The audio device could not be selected.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="settings-field-grid">
        {['audioinput', 'audiooutput'].map((kind) => {
          const key = kind === 'audioinput' ? 'inputDeviceId' : 'outputDeviceId';
          const list = devices.filter(
            (d) => d.kind === kind && d.deviceId && d.deviceId !== 'default',
          );
          return (
            <FormField
              key={kind}
              label={kind === 'audioinput' ? 'Voice microphone' : 'Voice speakers'}
            >
              <select
                id={`settings-voice-${kind}`}
                value={selected[key]}
                disabled={
                  !supported || busy || connecting || (kind === 'audiooutput' && !outputSupported)
                }
                onChange={(event) => void choose(kind, event.target.value)}
              >
                <option value="">System default</option>
                {selected[key] && !list.some((d) => d.deviceId === selected[key]) ? (
                  <option value={selected[key]}>Selected device (unavailable)</option>
                ) : null}
                {list.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `${kind === 'audioinput' ? 'Microphone' : 'Speakers'} ${i + 1}`}
                  </option>
                ))}
              </select>
            </FormField>
          );
        })}
      </div>
      <small>
        Device names appear after voice microphone access is allowed. Selections apply to voice in
        this session.
        {!outputSupported ? ' Select speakers in your system sound settings on this browser.' : ''}
      </small>
      {note ? <p role="alert">{note}</p> : null}
    </div>
  );
}
