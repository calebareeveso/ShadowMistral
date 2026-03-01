import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('terminalBridge', {
  onPtyData(cb) {
    ipcRenderer.on('pty-data', (_event, data) => cb(data))
  },
  onStatusChange(cb) {
    ipcRenderer.on('pty-status', (_event, status) => cb(status))
  },
})
