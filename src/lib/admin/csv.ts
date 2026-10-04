/**
 * CSV for the Import / Export screen. These files are made in Excel and LibreOffice, so the
 * delimiter is sniffed instead of assumed, a quoted cell may contain the delimiter, a newline or a
 * doubled quote, and exports carry a UTF-8 BOM because Excel on Windows drops it otherwise.
 */

const QUOTE = '"';

export function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((row) => row.trim() !== '') ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of ['\t', ';', ','] as const) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Rows of trimmed cells; fully empty rows are dropped. */
export function parseTable(input: string): string[][] {
  const text = input.replace(/^/, '').replace(/\r\n?/g, '\n');
  const delimiter = sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char !== QUOTE) {
        cell += char;
      } else if (text[i + 1] === QUOTE) {
        cell += QUOTE;
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === QUOTE && cell === '') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      endCell();
      continue;
    }
    if (char === '\n') {
      endRow();
      continue;
    }
    cell += char;
  }
  if (cell !== '' || row.length) endRow();

  return rows;
}

function escapeCell(value: string): string {
  const text = value ?? '';
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Spreadsheet-ready file: BOM, CRLF line endings, quoted where needed. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows
    .map((row) => row.map((cell) => escapeCell(cell === null || cell === undefined ? '' : String(cell))).join(','))
    .join('\r\n');
  return `\uFEFF${body}\r\n`;
}
