import type { BarcodeScanner, HardwareDescriptor, Unsubscribe } from '../ports/hardware';
import { createScanDecoder, type KeyInput, type ScanDecoderOptions } from './scan-decoder';

/** Where key events come from: in the app this is a `keydown` listener in the renderer. */
export interface KeySource {
  subscribe(handler: (event: KeyInput) => void): Unsubscribe;
}

/** Keyboard-wedge scanner built from a key source and the decoder. Pure logic, no DOM access. */
export function createWedgeScanner(
  source: KeySource,
  options?: Partial<ScanDecoderOptions>,
): BarcodeScanner {
  const decoder = createScanDecoder(options);
  const handlers = new Set<(barcode: string) => void>();
  const descriptor: HardwareDescriptor = {
    kind: 'scanner',
    name: 'KeyboardWedgeScanner',
    isMock: false,
    verifiedOnPhysicalHardware: false,
  };
  let unsubscribe: Unsubscribe | undefined;

  return {
    descriptor,
    onScan(handler) {
      handlers.add(handler);
      unsubscribe ??= source.subscribe((event) => {
        const barcode = decoder.push(event);
        if (barcode !== null) for (const h of [...handlers]) h(barcode);
      });
      return () => {
        handlers.delete(handler);
        if (handlers.size === 0) {
          unsubscribe?.();
          unsubscribe = undefined;
          decoder.reset();
        }
      };
    },
  };
}
