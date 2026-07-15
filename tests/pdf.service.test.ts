import { generateInvitationPdf } from '../src/services/pdf.service';
import puppeteer from 'puppeteer';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn(),
      waitForFunction: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
    }),
    close: jest.fn(),
  }),
}));

describe('PDF Service', () => {
  it('should generate a PDF and pass wedding details to HTML', async () => {
    const mockWedding = {
      brideName: 'Alice',
      groomName: 'Bob',
      weddingDate: '2026-12-25T10:00:00.000Z',
      venueName: 'Winter Wonderland',
      venueAddress: '123 Snow Lane',
      primaryColor: '#ff0000',
      accentColor: '#00ff00',
    };

    const mockGuest = {
      title: 'MR',
      firstName: 'John',
      lastName: 'Doe',
    };

    const pdfBuffer = await generateInvitationPdf(mockWedding as any, mockGuest);
    
    expect(pdfBuffer.toString()).toBe('pdf-content');
    
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Check if setContent was called with the right data
    const setContentArgs = (page.setContent as jest.Mock).mock.calls[0][0];
    
    expect(setContentArgs).toContain('Alice');
    expect(setContentArgs).toContain('Bob');
    expect(setContentArgs).toContain('Winter Wonderland');
    expect(setContentArgs).toContain('123 Snow Lane');
    expect(setContentArgs).toContain('#ff0000');
    expect(setContentArgs).toContain('#00ff00');
    expect(setContentArgs).toContain('John Doe');
  });
});
