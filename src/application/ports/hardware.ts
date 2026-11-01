export type HardwareKind = 'printer' | 'scanner' | 'cash-drawer';

export type HardwareErrorCode =
  | 'NOT_CONNECTED'
  | 'TIMEOUT'
  | 'DEVICE_BUSY'
  | 'PAPER_OUT'
  | 'COVER_OPEN'
  | 'UNSUPPORTED'
  | 'IO_ERROR';

/** Errors a person can fix and a retry may clear. PAPER_OUT and COVER_OPEN need a person first. */
const RETRYABLE: ReadonlySet<HardwareErrorCode> = new Set(['TIMEOUT', 'DEVICE_BUSY']);

export class HardwareError extends Error {
  readonly code: HardwareErrorCode;

  constructor(code: HardwareErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'HardwareError';
    this.code = code;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export interface HardwareDescriptor {
  readonly kind: HardwareKind;
  readonly name: string;
  readonly isMock: boolean;
  /**
   * Stays `false` until the adapter has passed the physical checklist in
   * docs/hardware-matrix.md on a real device. Mocks must never set it to true.
   */
  readonly verifiedOnPhysicalHardware: false;
}

export type PaperWidth = 58 | 80;

export interface PrinterStatus {
  readonly online: boolean;
  readonly paperOut: boolean;
  readonly coverOpen: boolean;
}

export interface PrintJob {
  readonly jobName: string;
  readonly html: string;
  readonly paperWidth: PaperWidth;
}

export interface Printer {
  readonly descriptor: HardwareDescriptor;
  status(): Promise<PrinterStatus>;
  /** Resolves when the device accepted the job; rejects with HardwareError otherwise. */
  print(job: PrintJob): Promise<void>;
}

export interface CashDrawer {
  readonly descriptor: HardwareDescriptor;
  /** Sends the open pulse. Rejects with HardwareError on failure. */
  open(): Promise<void>;
}

export type Unsubscribe = () => void;

export interface BarcodeScanner {
  readonly descriptor: HardwareDescriptor;
  onScan(handler: (barcode: string) => void): Unsubscribe;
}
