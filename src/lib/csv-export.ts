type CsvValue = string | number | boolean | null | undefined;

function escapeCsvValue(value: CsvValue): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection (OWASP "CSV Injection"): a cell
  // beginning with = + - @ or a control char is evaluated as a formula by
  // Excel/Sheets, so an attacker-controlled name/note could exfiltrate data or
  // run commands when an admin opens the export. Prefix such values with an
  // apostrophe so they render literally, and always quote them.
  const risky = /^[=+\-@\t\r]/.test(s);
  if (risky) s = "'" + s;
  return risky || /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvColumn<T> {
  label: string;
  value: (row: T) => CsvValue;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCsvValue(c.value(row))).join(","));
  return [header, ...body].join("\r\n");
}

/** Triggers a browser download of a CSV string — opens directly in Excel. A
 *  leading UTF-8 BOM stops Excel from mangling non-ASCII characters (₹, names). */
export function downloadCsv(filename: string, csv: string): void {
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
