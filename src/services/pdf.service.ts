import puppeteer from 'puppeteer';
import { format } from 'date-fns';
import { ApiError } from '../utils/ApiError';

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
  const guestName = isFamily
    ? `${TITLE_MAP[guest.title] || ''} ${guest.lastName} Family`
    : `${TITLE_MAP[guest.title] || ''} ${guest.firstName} ${guest.lastName}`;

  const weddingDate = new Date(wedding.weddingDate);
  const formattedDate = format(weddingDate, 'MMMM do, yyyy');
  const rsvpDate = new Date(wedding.rsvpDeadline);
  const formattedRsvpDate = format(rsvpDate, 'MMMM do, yyyy');

  const primaryColor = wedding.primaryColor || '#C5A059'; // Default Gold
  const accentColor = wedding.accentColor || '#E8E8E8'; // Default Grey

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
      font-family: 'Montserrat', sans-serif;
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
      padding: 50px 60px;
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
      margin-bottom: 30px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-container img {
      max-height: 80px;
      max-width: 120px;
      object-fit: contain;
    }

    .top-text {
      font-family: 'Montserrat', sans-serif;
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: #666666;
      margin-bottom: 35px;
      line-height: 2;
    }

    .couple-names {
      font-family: '${wedding.pdfFont}', cursive;
      font-size: 64px;
      color: ${primaryColor};
      line-height: 1.1;
      margin-bottom: 35px;
      padding: 0 20px;
    }

    .invite-guest {
      font-family: 'Playfair Display', serif;
      font-size: 24px;
      font-weight: 600;
      color: #333333;
      margin: 25px 0;
      padding: 15px 40px;
      border-top: 1px solid ${accentColor};
      border-bottom: 1px solid ${accentColor};
    }

    .day-date {
      font-family: 'Montserrat', sans-serif;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #4A4A4A;
      margin-bottom: 30px;
    }

    .events-grid {
      display: flex;
      width: 100%;
      justify-content: space-between;
      margin: 30px 0;
      padding: 0 40px;
    }

    .event-block {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .event-divider {
      width: 1px;
      background-color: ${accentColor};
      margin: 0 30px;
    }

    .event-name {
      font-family: 'Playfair Display', serif;
      font-size: 16px;
      font-weight: 600;
      color: #333333;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .event-time {
      font-family: 'Montserrat', sans-serif;
      font-size: 12px;
      color: #666666;
      letter-spacing: 2px;
    }

    .venue-section {
      margin-top: 20px;
      margin-bottom: 40px;
    }

    .venue-name {
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      font-weight: 600;
      color: #333333;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }

    .venue-address {
      font-family: 'Montserrat', sans-serif;
      font-size: 12px;
      color: #666666;
      line-height: 1.6;
    }

    .rsvp {
      font-family: 'Montserrat', sans-serif;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #888888;
      margin-top: auto;
      padding-top: 30px;
    }

    .rsvp-date {
      color: ${primaryColor};
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    ${wedding.pdfLogoUrl ? `<div class="logo-container"><img src="${wedding.pdfLogoUrl}" alt="Logo" /></div>` : ''}
    
    <div class="top-text">
      Together with their families<br>
      invite you to celebrate the wedding of
    </div>

    <div class="couple-names">
      ${escapeHtml(wedding.brideName)}<br>
      <span style="font-size: 40px; font-family: 'Playfair Display', serif; color: #4A4A4A;">&amp;</span><br>
      ${escapeHtml(wedding.groomName)}
    </div>

    <div class="invite-guest">
      ${escapeHtml(guestName)}
    </div>

    <div class="day-date">
      ${escapeHtml(wedding.pdfWeddingDay)} | ${escapeHtml(formattedDate)}
    </div>

    <div class="events-grid">
      <div class="event-block">
        <div class="event-name">${escapeHtml(wedding.pdfCeremonyName)}</div>
        <div class="event-time">${escapeHtml(wedding.pdfCeremonyTime)}</div>
      </div>
      <div class="event-divider"></div>
      <div class="event-block">
        <div class="event-name">Reception</div>
        <div class="event-time">${escapeHtml(wedding.pdfStartTime)} - ${escapeHtml(wedding.pdfEndTime)}</div>
      </div>
    </div>

    ${wedding.venueName ? `
    <div class="venue-section">
      <div class="venue-name">${escapeHtml(wedding.venueName)}</div>
      ${wedding.venueAddress ? `<div class="venue-address">${escapeHtml(wedding.venueAddress)}</div>` : ''}
    </div>
    ` : ''}

    <div class="rsvp">
      Kindly RSVP by <span class="rsvp-date">${escapeHtml(formattedRsvpDate)}</span>
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

    await page.setContent(html, { waitUntil: 'networkidle0' }); // Wait for logo to load

    // Wait for Google Fonts to load via CSS @import
    await page.evaluate(async () => {
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
