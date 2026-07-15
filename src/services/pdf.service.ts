import puppeteer from 'puppeteer';
import { format } from 'date-fns';

interface PdfWeddingData {
  brideName: string;
  groomName: string;
  weddingDate: string | Date;
  venueName?: string | null;
  venueAddress?: string | null;
  primaryColor?: string;
  accentColor?: string;
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
  const isFamily = guest.title === 'FAMILY';
  const guestName = isFamily
    ? `${TITLE_MAP[guest.title] || ''} ${guest.lastName} Family`
    : `${TITLE_MAP[guest.title] || ''} ${guest.firstName} ${guest.lastName}`;

  const weddingDate = new Date(wedding.weddingDate);
  const formattedDate = format(weddingDate, 'EEEE, MMMM do, yyyy');
  const formattedTime = format(weddingDate, 'h:mm a');

  const primaryColor = wedding.primaryColor || '#D4AF37';
  const accentColor = wedding.accentColor || '#E6D5B8';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Montserrat:wght@300;400;500;600&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: 794px;
      height: 1123px;
      background: linear-gradient(135deg, #FDFBF7 0%, #F8F4EC 100%);
      font-family: 'Montserrat', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .card {
      width: 650px;
      background: #FFFFFF;
      border: 2px solid ${primaryColor};
      box-shadow: inset 0 0 0 6px #FFFFFF, inset 0 0 0 7px ${primaryColor};
      padding: 60px 50px;
      text-align: center;
      position: relative;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      bottom: 12px;
      border: 1px solid ${accentColor};
      pointer-events: none;
    }

    .ornament {
      color: ${primaryColor};
      font-size: 28px;
      letter-spacing: 8px;
      margin-bottom: 20px;
    }

    .invite-text {
      font-family: 'Montserrat', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 4px;
      text-transform: uppercase;
      color: #8C7863;
      margin-bottom: 8px;
    }

    .guest-name {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      font-weight: 600;
      color: #333230;
      margin-bottom: 30px;
    }

    .divider {
      width: 80px;
      height: 1px;
      background: linear-gradient(90deg, transparent, ${primaryColor}, transparent);
      margin: 0 auto 30px;
    }

    .couple-label {
      font-size: 10px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #8C7863;
      margin-bottom: 12px;
      font-weight: 400;
    }

    .couple-names {
      font-family: 'Playfair Display', serif;
      font-size: 42px;
      font-weight: 700;
      color: #333230;
      line-height: 1.2;
      margin-bottom: 6px;
    }

    .ampersand {
      color: ${primaryColor};
      font-style: italic;
      font-size: 36px;
      display: inline-block;
      margin: 0 12px;
      font-weight: 400;
    }

    .are-getting-married {
      font-family: 'Playfair Display', serif;
      font-style: italic;
      font-size: 16px;
      color: ${primaryColor};
      margin-bottom: 35px;
    }

    .details-section {
      margin-bottom: 30px;
    }

    .details-label {
      font-size: 9px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #8C7863;
      margin-bottom: 8px;
      font-weight: 500;
    }

    .details-value {
      font-family: 'Playfair Display', serif;
      font-size: 16px;
      color: #333230;
      font-weight: 500;
      line-height: 1.5;
    }

    .details-sub {
      font-size: 13px;
      color: #666;
      font-weight: 300;
      margin-top: 4px;
      line-height: 1.4;
    }

    .footer-ornament {
      color: ${primaryColor};
      font-size: 22px;
      letter-spacing: 6px;
      margin-top: 20px;
    }

    .rsvp-note {
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #8C7863;
      margin-top: 25px;
      font-weight: 400;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="ornament">✦ ✦ ✦</div>

    <p class="invite-text">A Special Invitation For</p>
    <p class="guest-name">${escapeHtml(guestName)}</p>

    <div class="divider"></div>

    <p class="couple-label">Together with their families</p>
    <p class="couple-names">
      ${escapeHtml(wedding.brideName)}
      <span class="ampersand">&amp;</span>
      ${escapeHtml(wedding.groomName)}
    </p>
    <p class="are-getting-married">are getting married</p>

    <div class="details-section">
      <p class="details-label">Date &amp; Time</p>
      <p class="details-value">${escapeHtml(formattedDate)}</p>
      <p class="details-sub">${escapeHtml(formattedTime)}</p>
    </div>

    ${
      wedding.venueName
        ? `
    <div class="details-section">
      <p class="details-label">Venue</p>
      <p class="details-value">${escapeHtml(wedding.venueName)}</p>
      ${wedding.venueAddress ? `<p class="details-sub">${escapeHtml(wedding.venueAddress)}</p>` : ''}
    </div>
    `
        : ''
    }

    <div class="divider"></div>

    <p class="rsvp-note">Kindly respond at your earliest convenience</p>

    <div class="footer-ornament">✦ ✦ ✦</div>
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

    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Wait for Google Fonts to load via CSS @import
    await page.waitForFunction('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      width: '794px',
      height: '1123px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    // Puppeteer returns Uint8Array in newer versions — ensure we return a Node Buffer
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/** Escape HTML special characters to prevent XSS in the template. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
