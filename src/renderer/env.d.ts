import type { HesbanApi } from '../preload/api';

declare global {
  interface Window {
    readonly hesban: HesbanApi;
  }
}

export {};
