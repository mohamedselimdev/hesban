import {
  HardwareError,
  type CashDrawer,
  type HardwareErrorCode,
  type Printer,
} from '../ports/hardware';
import { renderReceiptHtml } from '../receipt/html';
import type { ReceiptDocument } from '../receipt/model';

export type HardwareOutcome =
  | { readonly ok: true; readonly attempts: number }
  | {
      readonly ok: false;
      readonly code: HardwareErrorCode;
      readonly attempts: number;
      /** True when the document is safe to print again once the cause is fixed. */
      readonly reprintable: boolean;
    };

export interface PrintOptions {
  /** Extra attempts after the first, for retryable errors only. */
  readonly retries?: number;
  readonly delay?: (ms: number) => Promise<void>;
  readonly retryDelayMs?: number;
}

const toCode = (error: unknown): { code: HardwareErrorCode; retryable: boolean } =>
  error instanceof HardwareError
    ? { code: error.code, retryable: error.retryable }
    : { code: 'IO_ERROR', retryable: false };

/**
 * Prints a receipt. Printing is outside the financial transaction: this never throws for hardware
 * problems and never changes the document; the caller keeps the posted invoice and can reprint.
 */
export async function printReceipt(
  printer: Printer,
  doc: ReceiptDocument,
  options: PrintOptions = {},
): Promise<HardwareOutcome> {
  const retries = options.retries ?? 1;
  const delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const job = {
    jobName: `receipt-${doc.number}`,
    html: renderReceiptHtml(doc),
    paperWidth: doc.paperWidth,
  };

  let attempts = 0;
  for (;;) {
    attempts++;
    try {
      const status = await printer.status();
      if (!status.online) throw new HardwareError('NOT_CONNECTED');
      if (status.coverOpen) throw new HardwareError('COVER_OPEN');
      if (status.paperOut) throw new HardwareError('PAPER_OUT');
      await printer.print(job);
      return { ok: true, attempts };
    } catch (error) {
      const { code, retryable } = toCode(error);
      if (retryable && attempts <= retries) {
        await delay(options.retryDelayMs ?? 300);
        continue;
      }
      return { ok: false, code, attempts, reprintable: true };
    }
  }
}

/** Opens the drawer after a cash sale. A failure never undoes the sale. */
export async function openDrawer(drawer: CashDrawer): Promise<HardwareOutcome> {
  try {
    await drawer.open();
    return { ok: true, attempts: 1 };
  } catch (error) {
    return { ok: false, code: toCode(error).code, attempts: 1, reprintable: false };
  }
}
