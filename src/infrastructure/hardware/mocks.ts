import {
  HardwareError,
  type BarcodeScanner,
  type CashDrawer,
  type HardwareDescriptor,
  type PrintJob,
  type Printer,
  type PrinterStatus,
  type Unsubscribe,
} from '../../application/ports/hardware';

/**
 * Test doubles. They prove only that HESBAN code handles the port contract and its failures.
 * They say nothing about real devices; every descriptor is marked isMock and unverified.
 */
const descriptor = (kind: HardwareDescriptor['kind'], name: string): HardwareDescriptor => ({
  kind,
  name,
  isMock: true,
  verifiedOnPhysicalHardware: false,
});

export class MockPrinter implements Printer {
  readonly descriptor = descriptor('printer', 'MockPrinter');
  readonly jobs: PrintJob[] = [];
  statusValue: PrinterStatus = { online: true, paperOut: false, coverOpen: false };
  /** Errors thrown by successive print() calls, consumed in order; undefined = succeed. */
  readonly printFailures: Array<HardwareError | Error | undefined> = [];
  printCalls = 0;

  status(): Promise<PrinterStatus> {
    return Promise.resolve(this.statusValue);
  }

  print(job: PrintJob): Promise<void> {
    this.printCalls++;
    const failure = this.printFailures.shift();
    if (failure) return Promise.reject(failure);
    this.jobs.push(job);
    return Promise.resolve();
  }
}

export class MockCashDrawer implements CashDrawer {
  readonly descriptor = descriptor('cash-drawer', 'MockCashDrawer');
  opened = 0;
  failWith: HardwareError | Error | undefined;

  open(): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.opened++;
    return Promise.resolve();
  }
}

export class MockScanner implements BarcodeScanner {
  readonly descriptor = descriptor('scanner', 'MockScanner');
  private readonly handlers = new Set<(barcode: string) => void>();

  onScan(handler: (barcode: string) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Simulates a completed scan. */
  emit(barcode: string): void {
    for (const handler of [...this.handlers]) handler(barcode);
  }
}
