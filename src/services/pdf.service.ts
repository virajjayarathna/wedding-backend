import puppeteer from 'puppeteer';
import { format } from 'date-fns';
import { ApiError } from '../utils/ApiError';

interface PdfRsvpContact {
  name: string;
  phone: string;
}

type PdfCeremonyType = 'WEDDING' | 'HOME_COMING';

interface PdfWeddingData {
  brideName: string;
  groomName: string;
  // Which card template to render. WEDDING (the default for anything not
  // explicitly set) keeps the original bride-first wording; HOME_COMING is the
  // groom's-side card, so the couple and the "daughter & son" line both flip.
  ceremonyType?: PdfCeremonyType | null;
  weddingDate: string | Date;
  venueName?: string | null;
  venueAddress?: string | null;
  // Already-resolved theme colours (see src/lib/theme.ts). The caller resolves
  // them so the PDF matches the web invitation's palette rather than falling
  // back to gold whenever a couple has only set a preset.
  primaryColor?: string;
  accentColor?: string;
  textColor?: string;
  cardColor?: string;
  pdfLogoUrl?: string | null;
  pdfFont?: string | null;
  pdfWeddingDay?: string | null;
  pdfStartTime?: string | null;
  pdfEndTime?: string | null;
  pdfCeremonyName?: string | null;
  pdfCeremonyTime?: string | null;
  rsvpDeadline?: string | Date | null;
  brideFatherName?: string | null;
  groomFatherName?: string | null;
  // This guest's assigned RSVP contacts, resolved from WeddingDetails.rsvpContacts
  // (configured in the admin Venue & RSVP tab) — same source as the "First/Second
  // RSVP Contact" selects on the Guests page. Either or both may be absent.
  firstRsvpContact?: PdfRsvpContact | null;
  secondRsvpContact?: PdfRsvpContact | null;
}

interface PdfGuestData {
  title: string;
  firstName: string;
  lastName: string;
}

const TITLE_MAP: Record<string, string> = {
  MR: 'Mr.',
  MRS: 'Mrs.',
  MR_AND_MRS: 'Mr. & Mrs.',
  MS: 'Ms.',
  DR: 'Dr.',
  FAMILY: 'The',
  MASTER: 'Master',
};

/**
 * Generate a beautiful PDF invitation card using Puppeteer.
 * Returns a Buffer containing the PDF data.
 */
export async function generateInvitationPdf(
  wedding: PdfWeddingData,
  guest: PdfGuestData
): Promise<Buffer> {
  // Validate mandatory fields
  if (
    !wedding.pdfFont ||
    !wedding.pdfWeddingDay ||
    !wedding.pdfStartTime ||
    !wedding.pdfEndTime ||
    !wedding.pdfCeremonyName ||
    !wedding.pdfCeremonyTime ||
    !wedding.rsvpDeadline
  ) {
    throw ApiError.badRequest('Incomplete PDF configuration. Please ensure all mandatory fields are filled out in the PDF tab.');
  }

  const isFamily = guest.title === 'FAMILY';
  let guestPrefix = '';
  if (guest.title === 'FAMILY') guestPrefix = 'FAMILY';
  else if (guest.title === 'MR') guestPrefix = 'MR.';
  else if (guest.title === 'MRS') guestPrefix = 'MRS.';
  else if (guest.title === 'MS') guestPrefix = 'MS.';
  else guestPrefix = TITLE_MAP[guest.title] || '';

  const guestName = isFamily
    ? `${guestPrefix} ${guest.lastName}`
    : `${guestPrefix} ${guest.firstName} ${guest.lastName}`;

  const weddingDate = new Date(wedding.weddingDate);
  const formattedDate = format(weddingDate, 'MMMM | dd | yyyy').toUpperCase();
  const rsvpDate = new Date(wedding.rsvpDeadline);
  const formattedRsvpDate = format(rsvpDate, 'MMMM do, yyyy');

  const primaryColor = wedding.primaryColor || '#C5A059'; // Default Gold
  const accentColor = wedding.accentColor || '#E8E8E8'; // Default Grey
  const textColor = wedding.textColor || '#333333';
  const cardColor = wedding.cardColor || '#FFFFFF';

  // Build the RSVP contact lines from this guest's assigned first/second RSVP
  // contacts (configured in Venue & RSVP, same source as the Guests page selects).
  // Neither is mandatory, so render only whichever are actually set.
  const rsvpContacts = [wedding.firstRsvpContact, wedding.secondRsvpContact].filter(
    (c): c is PdfRsvpContact => !!c && !!c.name && !!c.phone
  );
  const rsvpContactsHtml = rsvpContacts
    .map((c) => `${escapeHtml(c.name)} - ${escapeHtml(c.phone)}`)
    .join('<br>');

  // Home-coming cards are sent from the groom's side, so the couple reads
  // groom-first and the celebrate line swaps "daughter & son" accordingly.
  const isHomeComing = wedding.ceremonyType === 'HOME_COMING';
  const celebrateText = isHomeComing
    ? 'TO CELEBRATE THE WEDDING OF THEIR SON &amp; DAUGHTER'
    : 'TO CELEBRATE THE WEDDING OF THEIR DAUGHTER &amp; SON';
  const coupleNames = isHomeComing
    ? `${escapeHtml(wedding.groomName)} &amp; ${escapeHtml(wedding.brideName)}`
    : `${escapeHtml(wedding.brideName)} &amp; ${escapeHtml(wedding.groomName)}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600&family=Great+Vibes&family=Alex+Brush&family=Dancing+Script&family=Pinyon+Script&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: 794px;
      height: 1123px;
      background: ${cardColor};
      font-family: 'Playfair Display', serif;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .card {
      width: 710px;
      height: 1040px;
      background: ${cardColor};
      border: 1px solid ${accentColor};
      padding: 25px 40px;
      text-align: center;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 15px;
      left: 15px;
      right: 15px;
      bottom: 15px;
      border: 2px solid ${primaryColor};
      pointer-events: none;
    }

    .card::after {
      content: '';
      position: absolute;
      top: 22px;
      left: 22px;
      right: 22px;
      bottom: 22px;
      border: 1px solid ${accentColor};
      pointer-events: none;
    }

    .logo-container {
      margin-bottom: 25px;
      height: 250px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-container img {
      max-height: 250px;
      max-width: 350px;
      object-fit: contain;
    }

    .fathers-text {
      font-family: 'Playfair Display', serif;
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: ${textColor};
      margin-bottom: 10px;
      line-height: 1.8;
    }

    .together-with {
      font-family: 'Playfair Display', serif;
      font-size: 13px;
      color: ${textColor};
      text-transform: uppercase;
      letter-spacing: 2px;
      display: inline-block;
      margin: 5px 0;
    }

    .request-honor {
      font-family: 'Playfair Display', serif;
      font-size: 13px;
      color: ${textColor};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 10px 0 15px;
    }

    .invite-guest {
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      color: ${textColor};
      margin: 15px 0;
      padding: 15px 40px;
      border-top: 1px solid ${accentColor};
      border-bottom: 1px solid ${accentColor};
    }

    .couple-names {
      font-family: '${wedding.pdfFont}', cursive;
      font-size: 52px;
      color: ${primaryColor};
      line-height: 1.2;
      margin: 20px 0;
      padding: 0 10px;
    }

    .celebrate-text {
      font-family: 'Playfair Display', serif;
      font-size: 12px;
      color: ${textColor};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
      line-height: 1.8;
    }

    .day-date {
      font-family: 'Playfair Display', serif;
      font-size: 14px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: ${textColor};
      margin-bottom: 15px;
      line-height: 1.8;
    }

    .at-text {
      font-family: 'Playfair Display', serif;
      font-size: 13px;
      color: ${textColor};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
      line-height: 1.8;
    }

    .venue-name {
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      color: ${textColor};
      letter-spacing: 2px;
      text-transform: uppercase;
      display: block;
      margin-top: 5px;
    }

    .time-text {
      font-family: 'Playfair Display', serif;
      font-size: 12px;
      color: ${textColor};
      letter-spacing: 1px;
      text-transform: uppercase;
      line-height: 1.8;
      margin-bottom: 10px;
    }

    .rsvp {
      font-family: 'Playfair Display', serif;
      font-size: 12px;
      letter-spacing: 2px;
      color: ${textColor};
      margin-top: 25px;
      line-height: 2;
    }

    .rsvp-date {
      color: ${textColor};
    }

    .rsvp-contacts {
      margin-top: 10px;
      font-size: 11px;
      letter-spacing: 1px;
      color: ${textColor};
    }
  </style>
</head>
<body>
  <div class="card">
    ${wedding.pdfLogoUrl ? `<div class="logo-container"><img src="${wedding.pdfLogoUrl}" alt="Logo" /></div>` : ''}

    <div class="fathers-text">
      MR. &amp; MRS. ${escapeHtml((wedding.brideFatherName || '').toUpperCase())}<br>
      <span class="together-with">TOGETHER WITH</span><br>
      MR. &amp; MRS. ${escapeHtml((wedding.groomFatherName || '').toUpperCase())}
    </div>

    <div class="request-honor">
      REQUEST THE HONOUR OF THE PRESENCE OF
    </div>

    <div class="invite-guest">
      ${escapeHtml(guestName).toUpperCase()}
    </div>

    <div class="celebrate-text">
      ${celebrateText}
    </div>

    <div class="couple-names">
      ${coupleNames}
    </div>

    <div class="day-date">
      ON<br>
      ${escapeHtml(wedding.pdfWeddingDay?.toUpperCase() || '')}<br>
      ${escapeHtml(formattedDate)}
    </div>

    <div class="at-text">
      AT<br>
      <span class="venue-name">${escapeHtml(wedding.venueName)}</span>
    </div>

    <div class="time-text">
      FROM ${escapeHtml(format12Hour(wedding.pdfStartTime))} TO ${escapeHtml(format12Hour(wedding.pdfEndTime))}<br>
      ${escapeHtml(wedding.pdfCeremonyName)} @ ${escapeHtml(format12Hour(wedding.pdfCeremonyTime))}
    </div>

    <div class="rsvp">
      RSVP before <span class="rsvp-date">${escapeHtml(formattedRsvpDate)}</span><br>
      ${rsvpContactsHtml ? `<div class="rsvp-contacts">${rsvpContactsHtml}</div>` : ''}
    </div>
  </div>
</body>
</html>
  `.trim();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'load' }); // Wait for logo to load

    // Wait for Google Fonts to load via CSS @import
    await page.evaluate(async () => {
      // @ts-ignore
      await document.fonts.ready;
    });

    const pdfBuffer = await page.pdf({
      width: '794px',
      height: '1123px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/** Escape HTML special characters to prevent XSS in the template. */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Convert HH:MM to 12-hour AM/PM format */
function format12Hour(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  if (!h || !m) return timeStr;
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}
