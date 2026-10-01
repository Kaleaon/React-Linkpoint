const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linkpointDesktop', {
  allowLoginEndpoint: (url) => ipcRenderer.invoke('linkpoint:allow-login', url),
  request: (request) => ipcRenderer.invoke('linkpoint:request', request),
  connectViewer: (request) => ipcRenderer.invoke('linkpoint:viewer-connect', request),
  sendChat: (request) => ipcRenderer.invoke('linkpoint:viewer-chat', request),
  sendInstantMessage: (request) => ipcRenderer.invoke('linkpoint:viewer-im', request),
  sendFriendRequest: (request) => ipcRenderer.invoke('linkpoint:viewer-friend-request', request),
  fetchFriends: () => ipcRenderer.invoke('linkpoint:viewer-friends'),
  teleport: (request) => ipcRenderer.invoke('linkpoint:viewer-teleport', request),
  touchObject: (request) => ipcRenderer.invoke('linkpoint:viewer-touch', request),
  sit: (request) => ipcRenderer.invoke('linkpoint:viewer-sit', request),
  stand: () => ipcRenderer.invoke('linkpoint:viewer-stand'),
  getBalance: () => ipcRenderer.invoke('linkpoint:viewer-balance'),
  disconnectViewer: () => ipcRenderer.invoke('linkpoint:viewer-disconnect'),
  onViewerEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on('linkpoint:viewer-event', handler);
    return () => ipcRenderer.removeListener('linkpoint:viewer-event', handler);
  },
});
