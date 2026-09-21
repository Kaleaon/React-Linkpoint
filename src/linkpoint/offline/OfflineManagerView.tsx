import React, { useState, useEffect } from 'react';
import { LocalGridManager } from './LocalGridManager';
import { LocalAssetManager, AssetType } from './LocalAssetManager';
import { CacheManager } from './CacheManager';
import { OARParser } from './OARParser';

interface Props {
  gridManager: LocalGridManager;
  assetManager: LocalAssetManager;
  cacheManager: CacheManager;
}

export const OfflineManagerView: React.FC<Props> = ({ gridManager, assetManager, cacheManager }) => {
  const [isRunning, setIsRunning] = useState(gridManager.isGridRunning());
  const [needsAccountSetup, setNeedsAccountSetup] = useState(gridManager.isFirstTimeSetupNeeded());

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('Resident');
  const [password, setPassword] = useState('');

  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('texture');
  const [assetData, setAssetData] = useState('');
  const [assetsList, setAssetsList] = useState(assetManager.getAllAssets());

  const [cacheSettings, setCacheSettings] = useState(cacheManager.getSettings());
  const [cacheMB, setCacheMB] = useState(Math.round(cacheSettings.maxSizeBytes / (1024 * 1024)));

  const [oarXmlInput, setOarXmlInput] = useState('');
  const [importedStatus, setImportedStatus] = useState('');

  useEffect(() => {
    const handleState = (data: { isRunning: boolean }) => setIsRunning(data.isRunning);
    gridManager.on('gridStateChanged', handleState);
    return () => gridManager.off('gridStateChanged', handleState);
  }, [gridManager]);

  const handleToggleState = () => {
    if (needsAccountSetup) {
      alert('Please configure your first-time account before starting the local grid.');
      return;
    }
    try {
      const nextState = !isRunning;
      gridManager.toggleGridState(nextState);
      setIsRunning(gridManager.isGridRunning());
    } catch (e: any) {
      alert(e.message || 'Error toggling grid state');
    }
  };

  const handleAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !password) {
      alert('First Name and Password are required.');
      return;
    }
    gridManager.setupOfflineAccount(firstName, lastName, password);
    setNeedsAccountSetup(false);
    alert('Offline Account configured successfully!');
  };

  const handleAssetUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || !assetData) {
      alert('Asset Name and Data are required.');
      return;
    }
    assetManager.uploadAsset(assetName, assetType, assetData);
    setAssetName('');
    setAssetData('');
    setAssetsList(assetManager.getAllAssets());
    alert('Asset uploaded to local store!');
  };

  const handleCacheChange = (newMB: number) => {
    setCacheMB(newMB);
    const updated = cacheManager.setMaxSizeMB(newMB);
    setCacheSettings(updated);
  };

  const handleClearCache = () => {
    cacheManager.clearCache();
    setAssetsList(assetManager.getAllAssets());
    alert('Offline cache cleared!');
  };

  const handleImportOar = async () => {
    if (!oarXmlInput) return;
    const parser = new OARParser();
    const result = await parser.parseOAR(oarXmlInput);
    gridManager.getServer().addRegion(result.region);
    setImportedStatus(`Successfully imported region "${result.region.name}" with ${result.region.prims.length} objects.`);
    setOarXmlInput('');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', color: '#333' }}>
      <h2>Offline OpenSim Grid Control Center</h2>

      <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Local Grid Status: <span style={{ color: isRunning ? 'green' : 'red' }}>{isRunning ? 'WORKING (ONLINE)' : 'SHUTDOWN (OFFLINE)'}</span></h3>
        <button
          onClick={handleToggleState}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            background: isRunning ? '#d9534f' : '#5cb85c',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {isRunning ? 'Shutdown Local Grid' : 'Start Local Grid'}
        </button>
      </div>

      {needsAccountSetup && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffe8a1', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3>First Time Offline Account Setup</h3>
          <form onSubmit={handleAccountSubmit}>
            <div style={{ marginBottom: '10px' }}>
              <label>First Name: </label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="e.g. Local" required />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Last Name: </label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="e.g. Resident" />
            </div>
            <div style={{ marginBottom: '10px' }}>
              <label>Password: </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" style={{ padding: '8px 16px', background: '#0275d8', color: '#fff', border: 'none', borderRadius: '4px' }}>Save Account</button>
          </form>
        </div>
      )}

      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>OAR Backup Importer</h3>
        <p>Paste SceneObjectGroup XML string or OAR data to populate local region scene:</p>
        <textarea
          rows={4}
          style={{ width: '100%', marginBottom: '10px' }}
          value={oarXmlInput}
          onChange={e => setOarXmlInput(e.target.value)}
          placeholder="<SceneObjectGroup>...</SceneObjectGroup>"
        />
        <button onClick={handleImportOar} style={{ padding: '8px 16px', background: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px' }}>Import OAR Scene</button>
        {importedStatus && <p style={{ color: 'green', marginTop: '10px' }}>{importedStatus}</p>}
      </div>

      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Local Asset Upload</h3>
        <form onSubmit={handleAssetUpload}>
          <div style={{ marginBottom: '10px' }}>
            <label>Asset Name: </label>
            <input type="text" value={assetName} onChange={e => setAssetName(e.target.value)} placeholder="e.g. Custom Texture" required />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Asset Type: </label>
            <select value={assetType} onChange={e => setAssetType(e.target.value as AssetType)}>
              <option value="texture">Texture</option>
              <option value="sound">Sound</option>
              <option value="script">Script</option>
              <option value="mesh">Mesh / Model</option>
              <option value="clothing">Clothing</option>
            </select>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label>Asset Data (String / Base64): </label>
            <input type="text" value={assetData} onChange={e => setAssetData(e.target.value)} style={{ width: '60%' }} required />
          </div>
          <button type="submit" style={{ padding: '8px 16px', background: '#0275d8', color: '#fff', border: 'none', borderRadius: '4px' }}>Upload Asset</button>
        </form>
        <h4>Persisted Local Assets ({assetsList.length})</h4>
        <ul>
          {assetsList.map(a => (
            <li key={a.id}>
              <strong>{a.name}</strong> ({a.assetType}) - {a.sizeBytes} bytes - ID: {a.id}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Storage & Cache Sizing Options</h3>
        <p>Customizable cache storage size limit (256 MB up to 1,000,000 MB [~1 TB]):</p>
        <div style={{ marginBottom: '15px' }}>
          <label>Max Cache Size (MB): </label>
          <input
            type="number"
            min={256}
            max={1000000}
            value={cacheMB}
            onChange={e => handleCacheChange(Number(e.target.value))}
            style={{ width: '120px', padding: '4px', marginRight: '10px' }}
          />
          <span>({(cacheMB / 1024).toFixed(2)} GB)</span>
        </div>
        <div style={{ marginBottom: '15px' }}>
          <input
            type="range"
            min={256}
            max={1000000}
            value={cacheMB}
            onChange={e => handleCacheChange(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
        <button onClick={handleClearCache} style={{ padding: '8px 16px', background: '#f0ad4e', color: '#fff', border: 'none', borderRadius: '4px' }}>Clear Offline Cache</button>
      </div>
    </div>
  );
};
