import { contextBridge, ipcRenderer } from 'electron'

const handler = {
  send(channel, value) {
    ipcRenderer.send(channel, value)
  },
  on(channel, callback) {
    const subscription = (_event, ...args) => callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  // Camera output window controls
  openCameraOutputWindow() {
    ipcRenderer.send('open-camera-output-window')
  },
  closeCameraOutputWindow() {
    ipcRenderer.send('close-camera-output-window')
  },
  // Web agent (Stagehand)
  runWebAgent(query) {
    return ipcRenderer.invoke('web-agent', query)
  },
  // Terminal code agent (Claude Code via node-pty)
  runTerminalAgent(args) {
    return ipcRenderer.invoke('run-terminal-agent', args)
  },
  // Generic invoke for any IPC channel
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args)
  },
}

contextBridge.exposeInMainWorld('ipc', handler)

