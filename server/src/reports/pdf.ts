/**
 * HTML → PDF via Playwright (BuildSpec §12, Phase 7). Playwright is imported
 * lazily so the API boots and serves HTML reports even when the browser binary
 * isn't installed. PDF generation requires a one-time `npx playwright install
 * chromium`.
 */

export class PdfUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `PDF rendering is unavailable: ${detail}. Run "npx playwright install chromium" in the server workspace.`,
    );
    this.name = 'PdfUnavailableError';
  }
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    throw new PdfUnavailableError(err instanceof Error ? err.message : 'playwright not installed');
  }

  let browser: import('playwright').Browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox'] });
  } catch (err) {
    // Most commonly the browser binary hasn't been downloaded.
    throw new PdfUnavailableError(err instanceof Error ? err.message : 'failed to launch chromium');
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
    });
  } finally {
    await browser.close();
  }
}
