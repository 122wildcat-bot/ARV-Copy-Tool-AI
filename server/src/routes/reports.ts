/**
 * Reports route (BuildSpec §11, §12). Renders investor or listing HTML from a
 * stored deal. PDF mode returns the report HTML today; the Playwright HTML→PDF
 * wrapper is the remaining Phase 7 wiring (kept separate so the renderer stays
 * pure and testable).
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { dealsRepo } from '../db/repo.js';
import { renderInvestorReport, renderListingReport } from '../reports/render.js';

const bodySchema = z.object({
  format: z.enum(['pdf', 'html']).default('html'),
  mode: z.enum(['investor', 'listing']).default('investor'),
});

export const reportsRouter = Router();

reportsRouter.post('/:id', requireAuth, (req, res) => {
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

  // Phase 7: when format === 'pdf', pipe `html` through Playwright HTML→PDF.
  res.type('html').send(html);
});
