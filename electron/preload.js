// CamelotAI — preload bridge. Exposes a minimal, explicit API to the renderer.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('camelot', {
  exportLog: (markdown) => ipcRenderer.invoke('boardroom:export', markdown),

  onExportLog: (cb) => ipcRenderer.on('menu:export-log', cb),
  onToggleLocalOnly: (cb) => ipcRenderer.on('menu:toggle-local-only', cb),
  onOpenSetup: (cb) => ipcRenderer.on('menu:open-setup', cb),
  onOpenOdysseusInstructions: (cb) => ipcRenderer.on('menu:open-odysseus-instructions', cb),

  odysseusInstructionsPath: () => ipcRenderer.invoke('odysseus:instructions-path'),
  openOdysseusInstructions: () => ipcRenderer.invoke('odysseus:open-instructions'),

  // Sandboxed local folder access (allowed roots only).
  fsRoots: () => ipcRenderer.invoke('fs:roots'),
  readFile: (filePath) => ipcRenderer.invoke('fs:read', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:write', { filePath, content }),
  listDir: (dirPath) => ipcRenderer.invoke('fs:list', dirPath),
})