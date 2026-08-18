import puppeteer from 'puppeteer';
import { format } from 'date-fns';
import { ApiError } from '../utils/ApiError';

interface PdfRsvpContact {
  name: string;
  phone: string;
}

interface PdfWeddingData {
  brideName: string;
  groomName: string;
  weddingDate: string | Date;
  venueName?: string | null;
  venueAddress?: string | null;
  primaryColor?: string;
  accentColor?: string;
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

  // Build the RSVP contact lines from this guest's assigned first/second RSVP
  // contacts (configured in Venue & RSVP, same source as the Guests page selects).
  // Neither is mandatory, so render only whichever are actually set.
  const rsvpContacts = [wedding.firstRsvpContact, wedding.secondRsvpContact].filter(
    (c): c is PdfRsvpContact => !!c && !!c.name && !!c.phone
  );
  const rsvpContactsHtml = rsvpContacts
    .map((c) => `${escapeHtml(c.name)} &middot; ${escapeHtml(c.phone)}`)
    .join('<br>');

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
      background: #FFFFFF;
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
      background: #FFFFFF;
      border: 1px solid ${accentColor};
      padding: 34px 44px;
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

    /* Logo badge — a compact framed box at the top of the card, sized to the
       image rather than reserving a large empty block when unset. */
    .logo-frame {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 30px;
      margin: 0 auto 18px;
      border: 1.5px solid ${primaryColor};
      border-radius: 8px;
    }

    .logo-frame img {
      max-height: 84px;
      max-width: 260px;
      object-fit: contain;
      display: block;
    }

    /* Slim ornamental divider used between sections instead of large blank gaps */
    .ornament {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      margin: 12px 0;
    }

    .ornament-line {
      flex: 1;
      max-width: 64px;
      height: 1px;
      background: ${accentColor};
    }

    .ornament-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: ${primaryColor};
      flex-shrink: 0;
    }

    .fathers-text {
      font-family: 'Playfair Display', serif;
      font-size: 12.5px;
      letter-spacing: 1.6px;
      text-transform: uppercase;
      color: #333333;
      margin-bottom: 4px;
      line-height: 1.5;
    }

    .together-with {
      font-family: 'Montserrat', sans-serif;
      font-weight: 400;
      font-size: 10px;
      color: #8a8a8a;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      display: inline-block;
      margin: 4px 0;
    }

    .request-honor {
      font-family: 'Playfair Display', serif;
      font-size: 12.5px;
      color: #333333;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin: 0 0 10px;
    }

    .invite-guest {
      font-family: 'Playfair Display', serif;
      font-size: 17px;
      color: #333333;
      letter-spacing: 0.5px;
      margin: 10px 0;
      padding: 10px 34px;
      border-top: 1px solid ${accentColor};
      border-bottom: 1px solid ${accentColor};
    }

    .couple-names {
      font-family: '${wedding.pdfFont}', cursive;
      font-size: 50px;
      color: ${primaryColor};
      line-height: 1.15;
      margin: 12px 0;
      padding: 0 10px;
    }

    .celebrate-text {
      font-family: 'Playfair Display', serif;
      font-size: 11.5px;
      color: #333333;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .day-date {
      font-family: 'Playfair Display', serif;
      font-size: 13px;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #333333;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .at-text {
      font-family: 'Playfair Display', serif;
      font-size: 12px;
      color: #333333;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .venue-name {
      font-family: 'Playfair Display', serif;
      font-size: 16px;
      color: #333333;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      display: block;
      margin-top: 3px;
    }

    .time-text {
      font-family: 'Playfair Display', serif;
      font-size: 11px;
      color: #333333;
      letter-spacing: 1px;
      text-transform: uppercase;
      line-height: 1.5;
      margin-bottom: 4px;
    }

    .rsvp {
      font-family: 'Playfair Display', serif;
      font-size: 11.5px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #333333;
      margin-top: 6px;
      line-height: 1.6;
    }

    .rsvp-date {
      color: ${primaryColor};
    }

    .rsvp-contacts {
      margin-top: 6px;
      font-size: 10.5px;
      letter-spacing: 0.5px;
      text-transform: none;
      color: #555555;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="card">
    ${wedding.pdfLogoUrl ? `<div class="logo-frame"><img src="${wedding.pdfLogoUrl}" alt="Logo" /></div>` : ''}

    <div class="fathers-text">
      MR. &amp; MRS. ${escapeHtml((wedding.brideFatherName || '').toUpperCase())}<br>
      <span class="together-with">together with</span><br>
      MR. &amp; MRS. ${escapeHtml((wedding.groomFatherName || '').toUpperCase())}
    </div>

    <div class="ornament"><span class="ornament-line"></span><span class="ornament-dot"></span><span class="ornament-line"></span></div>

    <div class="request-honor">
      REQUEST THE HONOUR OF THE PRESENCE OF
    </div>

    <div class="invite-guest">
      ${escapeHtml(guestName).toUpperCase()}
    </div>

    <div class="celebrate-text">
      TO CELEBRATE THE WEDDING OF THEIR DAUGHTER &amp; SON
    </div>

    <div class="couple-names">
      ${escapeHtml(wedding.brideName)} &amp; ${escapeHtml(wedding.groomName)}
    </div>

    <div class="day-date">
      ${escapeHtml(wedding.pdfWeddingDay?.toUpperCase() || '')} &middot; ${escapeHtml(formattedDate)}
    </div>

    <div class="at-text">
      AT
      <span class="venue-name">${escapeHtml(wedding.venueName)}</span>
    </div>

    <div class="time-text">
      ${escapeHtml(format12Hour(wedding.pdfStartTime))} &ndash; ${escapeHtml(format12Hour(wedding.pdfEndTime))}<br>
      ${escapeHtml(wedding.pdfCeremonyName)} @ ${escapeHtml(format12Hour(wedding.pdfCeremonyTime))}
    </div>

    <div class="ornament"><span class="ornament-line"></span><span class="ornament-dot"></span><span class="ornament-line"></span></div>

    <div class="rsvp">
      RSVP before <span class="rsvp-date">${escapeHtml(formattedRsvpDate)}</span>
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
