import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly numeric?: boolean;
  readonly cell: (row: Row) => ReactNode;
}

interface Props<Row> {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly footer?: ReactNode;
  readonly label: string;
}

/**
 * Grid with one tab stop (roving tabindex) and arrow-key navigation that follows reading
 * direction: in right-to-left layouts ArrowLeft moves to the next column.
 */
export function DataGrid<Row>({ columns, rows, rowKey, footer, label }: Props<Row>) {
  const [active, setActive] = useState({ row: 0, col: 0 });
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  function focusCell(row: number, col: number) {
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const c = Math.max(0, Math.min(columns.length - 1, col));
    setActive({ row: r, col: c });
    bodyRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const next = rtl ? 'ArrowLeft' : 'ArrowRight';
    const previous = rtl ? 'ArrowRight' : 'ArrowLeft';
    const { row, col } = active;
    switch (event.key) {
      case next:
        focusCell(row, col + 1);
        break;
      case previous:
        focusCell(row, col - 1);
        break;
      case 'ArrowDown':
        focusCell(row + 1, col);
        break;
      case 'ArrowUp':
        focusCell(row - 1, col);
        break;
      case 'Home':
        focusCell(event.ctrlKey ? 0 : row, 0);
        break;
      case 'End':
        focusCell(event.ctrlKey ? rows.length - 1 : row, columns.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div className="table-wrap">
      <table className="data-grid" aria-label={label} data-testid="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef} onKeyDown={onKeyDown}>
          {rows.map((row, r) => (
            <tr key={rowKey(row)}>
              {columns.map((c, ci) => (
                <td
                  key={c.key}
                  className={c.numeric ? 'num' : undefined}
                  data-cell={`${r}-${ci}`}
                  tabIndex={active.row === r && active.col === ci ? 0 : -1}
                  onFocus={() => setActive({ row: r, col: ci })}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot>{footer}</tfoot> : null}
      </table>
    </div>
  );
}
