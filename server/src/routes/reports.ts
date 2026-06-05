/**
 * Reports route (BuildSpec §11, §12). Renders investor or listing reports from
 * a stored deal. `format: "pdf"` runs the HTML through Playwright; `format:
 * "html"` returns the raw report (and is the fallback if browsers aren't
 * installed). The renderer stays pure and testable; PDF is a thin wrapper.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { dealsRepo } from '../db/repo.js';
import { htmlToPdf, PdfUnavailableError } from '../reports/pdf.js';
import { renderInvestorReport, renderListingReport } from '../reports/render.js';

const bodySchema = z.object({
  format: z.enum(['pdf', 'html']).default('pdf'),
  mode: z.enum(['investor', 'listing']).default('investor'),
});

export const reportsRouter = Router();

reportsRouter.post('/:id', requireAuth, async (req, res) => {
  const deal = dealsRepo.get(Number(req.params.id));
  if (!deal) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (deal.userId !== req.userId) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const html =
    parsed.data.mode === 'listing'
      ? renderListingReport(deal.analysis)
      : renderInvestorReport(deal.analysis);

  const filename = `${parsed.data.mode}-report-${deal.id}`;

  if (parsed.data.format === 'html') {
    res.type('html').send(html);
    return;
  }

  try {
    const pdf = await htmlToPdf(html);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (err instanceof PdfUnavailableError) {
      // Browsers not installed — tell the client how to enable PDF, and that
      // HTML is available now.
      res.status(503).json({ error: err.message, hint: 'retry with { "format": "html" }' });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'pdf render failed' });
  }
});

