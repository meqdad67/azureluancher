const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['log', 'progress', 'state', 'started', 'closed', 'launch-error', 'mod-status', 'win-state'];
contextBridge.exposeInMainWorld('azure', {
  invoke: async (channel, ...args) => {
    const r = await ipcRenderer.invoke(channel, ...args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  on: (channel, cb) => {
    if (!EVENTS.includes(channel)) return () => {};
    const fn = (_e, p) => cb(p);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
  platform: process.platform,
});
