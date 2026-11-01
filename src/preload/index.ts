import { contextBridge, ipcRenderer } from 'electron';
import { createApi } from './api';

contextBridge.exposeInMainWorld(
  'hesban',
  createApi((channel, payload) => ipcRenderer.invoke(channel, payload)),
);
