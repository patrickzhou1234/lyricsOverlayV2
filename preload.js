const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Lyrics updates from Python backend
  onLyricsUpdate: (callback) => {
    ipcRenderer.on('lyrics-update', (event, data) => callback(data));
  },
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // Click-through toggle (false = clickable, true = click-through)
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),
  
  // Opacity control
  setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),
  onOpacityChanged: (callback) => {
    ipcRenderer.on('opacity-changed', (event, opacity) => callback(opacity));
  },
  
  // Desktop sources for audio capture
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources')
});
