import { safeStorage } from 'electron';
import type { KeyWrapper } from '../infrastructure/db/key-store';

/**
 * Wraps the database key with Windows DPAPI through Electron's asynchronous safeStorage API
 * (the synchronous API is deprecated in Electron 45). The key is passed as hex text.
 */
export const electronKeyWrapper: KeyWrapper = {
  async wrap(plain) {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error('OS-level encryption is not available');
    }
    return safeStorage.encryptStringAsync(plain.toString('hex'));
  },
  async unwrap(blob) {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(blob);
    return { plain: Buffer.from(result, 'hex'), shouldReWrap: shouldReEncrypt };
  },
};
