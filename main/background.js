import path from 'path'
import { app, ipcMain, BrowserWindow, session, systemPreferences, globalShortcut } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { Stagehand } from '@browserbasehq/stagehand'
import { z } from 'zod'
import { config as dotenvConfig } from 'dotenv'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { runTerminalAgent } from './terminalAgent'
import { addKnowledge, retrieveKnowledge } from './services/knowledge.js'

import Store from 'electron-store'
const userStore = new Store({ name: 'user-profile' })

// Try loading .env from multiple possible locations
const possibleEnvPaths = [
  path.join(__dirname, '../renderer/.env'),
  path.join(__dirname, '../../renderer/.env'),
  path.join(process.cwd(), 'renderer/.env'),
]
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenvConfig({ path: envPath })
    console.log('[bg] Loaded .env from:', envPath)
    break
  }
}

// Fallback: hardcode key directly so it always works
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY 
console.log('[bg] MISTRAL_API_KEY loaded:', MISTRAL_API_KEY ? 'YES (' + MISTRAL_API_KEY.slice(0, 6) + '...)' : 'MISSING')

/* ── web-agent IPC handler ── */
ipcMain.handle('web-agent', async (_event, query) => {
  let stagehand = null
  try {
    stagehand = new Stagehand({
      env: "LOCAL",
      model: {
        modelName: "mistral/mistral-large-latest",
        apiKey: MISTRAL_API_KEY,
      },
      domSettleTimeout: 3000,
      // localBrowserLaunchOptions: { headless: false, devtools: true }, // uncomment to watch it
    });

    await stagehand.init();

    const page = stagehand.context.activePage() ?? stagehand.context.pages()[0]; // v3 way :contentReference[oaicite:2]{index=2}

    // ✅ Do navigation explicitly (don’t ask act() to “go to…”)
    await page.goto("https://www.google.com", { waitUntil: "domcontentloaded", timeoutMs: 30000 }); // :contentReference[oaicite:3]{index=3}

    // Optional: if a consent dialog appears, try to dismiss it quickly (ignore if not present)
    try { await stagehand.act("click 'Reject all' if a cookie dialog is blocking the page", { timeout: 5000, page }); } catch {}
    try { await stagehand.act("click 'Accept all' if a cookie dialog is blocking the page", { timeout: 5000, page }); } catch {}

    // ✅ Break search into single actions (act() best practice)
    await stagehand.act(`type "${query}" into the search box`, { timeout: 15000, page }); // :contentReference[oaicite:4]{index=4}
    await stagehand.act("press Enter in the search field", { timeout: 15000, page });     // :contentReference[oaicite:5]{index=5}

    await page.waitForLoadState("networkidle", 30000); // :contentReference[oaicite:6]{index=6}

    const result = await stagehand.extract(
      "Extract the top 3–5 organic search result titles and their brief descriptions as plain text.",
      z.object({
        summary: z.string(),
      }),
      { selector: "#search", timeout: 30000, page } // scope helps accuracy/cost :contentReference[oaicite:7]{index=7}
    );

    return result.summary;
  } catch (err) {
    console.error('[web-agent] Error:', err)
    return `Search completed for: "${query}"`
  } finally {
    if (stagehand) {
      try { await stagehand.close() } catch {}
    }
  }
})

/* ── run-terminal-agent IPC handler ── */
ipcMain.handle('run-terminal-agent', async (_event, { task }) => {
  try {
    const summary = await runTerminalAgent(task)
    return summary
  } catch (err) {
    console.error('[terminal-agent] Error:', err)
    return `Terminal agent encountered an error: ${err.message}`
  }
})

/* ── Knowledge RAG IPC handlers ── */
const KNOWLEDGE_DB_PATH = path.join(app.getPath('userData'), 'knowledge_store.json')

ipcMain.handle('add-knowledge', async (_event, text) => {
  try {
    const result = await addKnowledge(text, KNOWLEDGE_DB_PATH)
    return result
  } catch (err) {
    console.error('[add-knowledge] Error:', err)
    return { message: `Failed to store knowledge: ${err.message}` }
  }
})

ipcMain.handle('retrieve-knowledge', async (_event, query, topK) => {
  try {
    const results = await retrieveKnowledge(query, topK || 3, KNOWLEDGE_DB_PATH)
    return results
  } catch (err) {
    console.error('[retrieve-knowledge] Error:', err)
    return []
  }
})

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// Camera output window reference
let cameraOutputWindow = null

function createCameraOutputWindow(port) {
  // Don't create duplicate windows
  if (cameraOutputWindow && !cameraOutputWindow.isDestroyed()) {
    cameraOutputWindow.focus()
    return
  }

  cameraOutputWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1280,
    minHeight: 720,
    maxWidth: 1280,
    maxHeight: 720,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    title: 'AI Virtual Camera Output',
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isProd) {
    cameraOutputWindow.loadURL('app://./camera-output')
  } else {
    cameraOutputWindow.loadURL(`http://localhost:${port}/camera-output`)
  }

  cameraOutputWindow.on('closed', () => {
    cameraOutputWindow = null
  })
}

// Fix to prevent WebRTC/Network Service crashes in Electron
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')

;(async () => {
  await app.whenReady()

  // Grant media permissions (microphone) automatically so recording works
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true)   // <-- auto-approve microphone access
    } else {
      callback(false)
    }
  })

  // Explicitly ask macOS for microphone permissions to prevent crash
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status !== 'granted') {
      try {
        await systemPreferences.askForMediaAccess('microphone')
      } catch (e) {
        console.error('Failed to get microphone permissions:', e)
      }
    }
  }

  // Cmd+Shift+R resets the entire onboarding state and reloads the app
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    console.log('[Dev] Resetting onboarding state...')
    userStore.clear()                          // wipes agentId, voiceId, onboardingComplete
    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.webContents.reload()                 // reloads renderer
    }
  })

  const port = process.argv[2]

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isProd) {
    await mainWindow.loadURL('app://./home')
  } else {
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools()
  }

  // IPC: Open camera output window
  ipcMain.on('open-camera-output-window', () => {
    createCameraOutputWindow(port)
  })

  // IPC: Close camera output window
  ipcMain.on('close-camera-output-window', () => {
    if (cameraOutputWindow && !cameraOutputWindow.isDestroyed()) {
      cameraOutputWindow.close()
    }
  })
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})

// ─── IPC: User profile persistence for onboarding ───────────────────────────
ipcMain.handle('get-user-profile', () => {
  return userStore.store
})

ipcMain.handle('set-user-profile', (_, data) => {
  Object.entries(data).forEach(([k, v]) => userStore.set(k, v))
  return userStore.store
})
