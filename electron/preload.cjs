const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linkpointDesktop', {
  allowLoginEndpoint: (url) => ipcRenderer.invoke('linkpoint:allow-login', url),
  request: (request) => ipcRenderer.invoke('linkpoint:request', request),
  connectViewer: (request) => ipcRenderer.invoke('linkpoint:viewer-connect', request),
  sendChat: (request) => ipcRenderer.invoke('linkpoint:viewer-chat', request),
  disconnectViewer: () => ipcRenderer.invoke('linkpoint:viewer-disconnect'),
  onViewerEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('linkpoint:viewer-event', handler);
    return () => ipcRenderer.removeListener('linkpoint:viewer-event', handler);
  },
});
