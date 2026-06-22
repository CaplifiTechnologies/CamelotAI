// CamelotAI — Electron main process.
// Dev: loads Next dev server. Packaged: boots embedded Next production server.

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron')
const { homedir } = require('os')
const path = require('path')
const fs = require('fs')
const { startNextProduction, stopNextProduction } = require('./next-server')
const { setupPackagedEnv } = require('./packaged-env')
const { readText, writeText, listDir, allowedRoots } = require('./fs-bridge')

// CAMELOT_FORCE_PACKAGED=1 exercises embedded Next server without a .dmg (smoke:embedded).
const forcePackaged = process.env.CAMELOT_FORCE_PACKAGED === '1'
const isDev = !app.isPackaged && !forcePackaged
const PORT = process.env.CAMELOT_WEB_PORT ?? '20020'
const appRoot = isDev ? path.join(__dirname, '..') : app.getAppPath()

let mainWindow = null
let prodUrl = null

async function resolveWebUrl() {
  if (process.env.CAMELOT_WEB_URL) return process.env.CAMELOT_WEB_URL
  if (isDev) return `http://localhost:${PORT}`
  setupPackagedEnv(app, appRoot)
  prodUrl = await startNextProduction(appRoot, Number(PORT))
  return prodUrl
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(url)

  const wc = mainWindow.webContents
  wc.on('did-finish-load', () => {
    console.log('[camelot] window loaded:', wc.getURL())
    if (process.env.CAMELOT_SMOKE === '1') {
      console.log('[camelot] smoke OK — shell booted and loaded; quitting.')
      setTimeout(() => app.quit(), 400)
    }
  })
  wc.on('did-fail-load', (_e, code, desc, failedUrl) => {
    console.error(`[camelot] FAILED to load ${failedUrl}: ${desc} (${code})`)
    if (process.env.CAMELOT_SMOKE === '1') app.exit(1)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// --- IPC handlers -----------------------------------------------------------

ipcMain.handle('boardroom:export', async (_evt, markdown) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'Camelot-transcript.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, markdown ?? '', 'utf8')
  return { ok: true, filePath }
})

ipcMain.handle('fs:roots', async () => ({ roots: allowedRoots() }))

ipcMain.handle('fs:read', async (_evt, filePath) => {
  try {
    return { ok: true, content: readText(filePath) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('fs:write', async (_evt, { filePath, content }) => {
  try {
    const written = writeText(filePath, content)
    return { ok: true, filePath: written }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('fs:list', async (_evt, dirPath) => {
  try {
    return { ok: true, entries: listDir(dirPath) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

const ODYSSEUS_INSTRUCTIONS_PATH = path.join(homedir(), 'odysseus', 'data', 'matt-instructions.md')

ipcMain.handle('odysseus:instructions-path', async () => ({
  path: ODYSSEUS_INSTRUCTIONS_PATH,
  exists: fs.existsSync(ODYSSEUS_INSTRUCTIONS_PATH),
}))

ipcMain.handle('odysseus:open-instructions', async () => {
  try {
    if (!fs.existsSync(ODYSSEUS_INSTRUCTIONS_PATH)) {
      fs.mkdirSync(path.dirname(ODYSSEUS_INSTRUCTIONS_PATH), { recursive: true })
      fs.writeFileSync(
        ODYSSEUS_INSTRUCTIONS_PATH,
        '# Odysseus instructions\n\nEdit this file to tune Odysseus behavior in Camelot.\n',
        'utf8',
      )
    }
    const err = await shell.openPath(ODYSSEUS_INSTRUCTIONS_PATH)
    return { ok: !err, path: ODYSSEUS_INSTRUCTIONS_PATH, error: err || undefined }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Export Log…',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow?.webContents.send('menu:export-log'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Toggle Local Only',
          accelerator: 'CmdOrCtrl+L',
          click: () => mainWindow?.webContents.send('menu:toggle-local-only'),
        },
        {
          label: 'Setup Wizard…',
          click: () => mainWindow?.webContents.send('menu:open-setup'),
        },
        {
          label: 'Edit Odysseus Instructions…',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.send('menu:open-odysseus-instructions'),
        },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(async () => {
  buildMenu()
  try {
    const url = await resolveWebUrl()
    createWindow(url)
  } catch (err) {
    console.error('[camelot] failed to start:', err)
    app.exit(1)
  }
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const url = prodUrl ?? (await resolveWebUrl())
      createWindow(url)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopNextProduction()
})