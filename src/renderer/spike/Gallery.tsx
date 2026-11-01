import { useState } from 'react';
import { parseEgp, formatEgp, piastres, sum, type Piastres } from '../../domain/money';
import { lineTotal, milli, parseQty, type Milli } from '../../domain/qty';
import '../styles/gallery.css';
import { ar, t } from '../i18n/ar';
import {
  formatBusinessDate,
  formatDateTime,
  formatQuantity,
  type DigitStyle,
} from '../i18n/format';
import { DataGrid, type Column } from '../ui/DataGrid';
import { Ltr, Money } from '../ui/Money';

interface Line {
  id: string;
  name: string;
  qty: Milli;
  price: Piastres;
}

const LINES: Line[] = [
  { id: 'l1', name: 'كابل USB-C طول 1 متر', qty: milli(2000), price: piastres(8550) },
  { id: 'l2', name: 'شاحن Anker 20W', qty: milli(1000), price: piastres(45000) },
  { id: 'l3', name: 'جبنة رومي (بالكيلو)', qty: milli(350), price: piastres(8550) },
  { id: 'l4', name: 'لبن Juhayna 1L', qty: milli(12000), price: piastres(3750) },
];

export default function Gallery() {
  const [style, setStyle] = useState<DigitStyle>('western');
  const [priceText, setPriceText] = useState('');
  const [priceError, setPriceError] = useState(false);
  const [pricePt, setPricePt] = useState<Piastres | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [qtyError, setQtyError] = useState(false);
  const [qtyMilli, setQtyMilli] = useState<Milli | null>(null);

  function commitPrice() {
    if (priceText.trim() === '') return;
    try {
      const value = parseEgp(priceText);
      setPricePt(value);
      setPriceText(formatEgp(value));
      setPriceError(false);
    } catch {
      setPricePt(null);
      setPriceError(true);
    }
  }

  function commitQty() {
    if (qtyText.trim() === '') return;
    try {
      const value = parseQty(qtyText);
      setQtyMilli(value);
      setQtyText(formatQuantity(value));
      setQtyError(false);
    } catch {
      setQtyMilli(null);
      setQtyError(true);
    }
  }

  const columns: Column<Line>[] = [
    { key: 'i', header: ar.gallery.colIndex, cell: (l) => LINES.indexOf(l) + 1 },
    { key: 'name', header: ar.gallery.colProduct, cell: (l) => l.name },
    {
      key: 'qty',
      header: ar.gallery.colQty,
      numeric: true,
      cell: (l) => formatQuantity(l.qty, style),
    },
    {
      key: 'price',
      header: ar.gallery.colPrice,
      numeric: true,
      cell: (l) => <Money value={l.price} style={style} />,
    },
    {
      key: 'total',
      header: ar.gallery.colTotal,
      numeric: true,
      cell: (l) => <Money value={lineTotal(l.price, l.qty)} style={style} />,
    },
  ];
  const invoiceTotal = sum(LINES.map((l) => lineTotal(l.price, l.qty)));

  return (
    <div className="gallery" data-testid="gallery">
      <nav className="gallery-nav" aria-label={ar.appName}>
        <ul>
          {ar.gallery.nav.map((label, i) => (
            <li key={label}>
              <a href="#/gallery" data-testid={`nav-${i}`}>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="gallery-main">
        <section className="card">
          <h1>{t('gallery.title')}</h1>
          <div className="toolbar" role="radiogroup" aria-label={t('gallery.digitStyle')}>
            <span>{t('gallery.digitStyle')}</span>
            <button
              type="button"
              role="radio"
              aria-checked={style === 'western'}
              aria-pressed={style === 'western'}
              data-testid="digit-western"
              tabIndex={style === 'western' ? 0 : -1}
              onClick={() => setStyle('western')}
            >
              {t('gallery.western')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={style === 'arabic-indic'}
              aria-pressed={style === 'arabic-indic'}
              data-testid="digit-arabic"
              tabIndex={style === 'arabic-indic' ? 0 : -1}
              onClick={() => setStyle('arabic-indic')}
            >
              {t('gallery.arabicIndic')}
            </button>
          </div>
        </section>

        <section className="card">
          <h2>{t('gallery.formTitle')}</h2>
          <div className="form-grid">
            <div>
              <label htmlFor="f-name">{t('gallery.productName')}</label>
              <input id="f-name" data-testid="f-name" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="f-barcode">{t('gallery.barcode')}</label>
              <input
                id="f-barcode"
                data-testid="f-barcode"
                className="ltr-field"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="f-price">{t('gallery.price')}</label>
              <input
                id="f-price"
                data-testid="f-price"
                className="ltr-field"
                inputMode="decimal"
                autoComplete="off"
                value={priceText}
                aria-invalid={priceError}
                data-piastres={pricePt ?? ''}
                onChange={(e) => setPriceText(e.target.value)}
                onBlur={commitPrice}
              />
              <div className="error" role="alert">
                {priceError ? '⚠' : ''}
              </div>
            </div>
            <div>
              <label htmlFor="f-qty">{t('gallery.quantity')}</label>
              <input
                id="f-qty"
                data-testid="f-qty"
                className="ltr-field"
                inputMode="decimal"
                autoComplete="off"
                value={qtyText}
                aria-invalid={qtyError}
                data-milli={qtyMilli ?? ''}
                onChange={(e) => setQtyText(e.target.value)}
                onBlur={commitQty}
              />
              <div className="error" role="alert">
                {qtyError ? '⚠' : ''}
              </div>
            </div>
          </div>
          <p data-testid="parsed">
            {t('gallery.parsedAs')}: <Ltr>{pricePt === null ? '-' : String(pricePt)}</Ltr> /{' '}
            <Ltr>{qtyMilli === null ? '-' : String(qtyMilli)}</Ltr>
          </p>
        </section>

        <section className="card">
          <h2>{t('gallery.tableTitle')}</h2>
          <DataGrid
            label={t('gallery.tableTitle')}
            columns={columns}
            rows={LINES}
            rowKey={(l) => l.id}
            footer={
              <tr>
                <td colSpan={4}>{t('gallery.total')}</td>
                <td className="num" data-testid="invoice-total">
                  <Money value={invoiceTotal} style={style} />
                </td>
              </tr>
            }
          />
        </section>

        <section className="card" data-testid="mixed">
          <h2>{t('gallery.mixedTitle')}</h2>
          <p>
            {t('gallery.invoiceLine')} <Ltr>INV-000123</Ltr> {t('gallery.onDate')}{' '}
            <Ltr>{formatBusinessDate('2026-11-01', style)}</Ltr>{' '}
            <Ltr>{formatDateTime('2026-11-01T12:05:00Z', style)}</Ltr>
          </p>
          <p>
            {t('gallery.phone')}: <Ltr>01012345678</Ltr>
          </p>
        </section>
      </main>
    </div>
  );
}
