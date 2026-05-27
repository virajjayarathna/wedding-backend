/**
 * CSV Parser Utility
 * Parses a simple CSV string into an array of objects using the first row as headers.
 * Used for bulk guest import.
 */

export interface ParsedGuestRow {
  title: string;
  firstName: string;
  lastName: string;
  phone?: string;
  maxAttendants?: number;
}

export function parseCsv(csvText: string): ParsedGuestRow[] {
  const lines = csvText
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row.');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  const requiredHeaders = ['title', 'firstname', 'lastname'];
  for (const req of requiredHeaders) {
    if (!headers.includes(req)) {
      throw new Error(
        `CSV is missing required column: "${req}". Required columns: title, firstName, lastName`
      );
    }
  }

  const rows: ParsedGuestRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });

    if (!row['title'] || !row['firstname'] || !row['lastname']) {
      continue; // Skip incomplete rows
    }

    rows.push({
      title: row['title'].toUpperCase(),
      firstName: row['firstname'],
      lastName: row['lastname'],
      phone: row['phone'] || undefined,
      maxAttendants: row['maxattendants'] ? parseInt(row['maxattendants'], 10) : 1,
    });
  }

  return rows;
}
