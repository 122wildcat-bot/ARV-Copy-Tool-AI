/**
 * Deals routes (BuildSpec §11): fetch, list, recalc, and manual comp add/remove.
 * recalc and comp edits are pure/fast — no data pull, no LLM call.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { dealsRepo } from '../db/repo.js';
import { addComp, recalc, removeComp, type RecalcEdits } from '../service/recalcService.js';
import type { AnalysisResult } from '../types.js';

export const dealsRouter = Router();

/** Load a deal and assert the caller owns it. */
function loadOwned(req: { userId?: number }, id: number): AnalysisResult | { error: number } {
  const deal = dealsRepo.get(id);
  if (!deal) return { error: 404 };
  if (deal.userId !== req.userId) return { error: 403 };
  return deal.analysis;
}

dealsRouter.get('/', requireAuth, (req, res) => {
  res.json({ deals: dealsRepo.listForUser(req.userId!) });
});

dealsRouter.get('/:id', requireAuth, (req, res) => {
  const result = loadOwned(req, Number(req.params.id));
  if ('error' in result) {
    res.status(result.error).json({ error: result.error === 404 ? 'not found' : 'forbidden' });
    return;
  }
  res.json({ analysis: result });
});

const recalcSchema = z.object({
  repairs: z.unknown().optional(),
  knobs: z.record(z.number()).optional(),
  dealInputs: z.record(z.number()).optional(),
});

dealsRouter.post('/:id/recalc', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const result = loadOwned(req, id);
  if ('error' in result) {
    res.status(result.error).json({ error: result.error === 404 ? 'not found' : 'forbidden' });
    return;
  }
  const parsed = recalcSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = recalc(result, parsed.data as RecalcEdits);
  dealsRepo.update(id, updated);
  res.json({ analysis: updated });
});

dealsRouter.post('/:id/comps/add', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const result = loadOwned(req, id);
  if ('error' in result) {
    res.status(result.error).json({ error: result.error === 404 ? 'not found' : 'forbidden' });
    return;
  }
  const { comp, selection } = req.body ?? {};
  if (!comp || !selection) {
    res.status(400).json({ error: 'comp and selection are required' });
    return;
  }
  const updated = addComp(result, comp, selection);
  dealsRepo.update(id, updated);
  res.json({ analysis: updated });
});

const removeSchema = z.object({ providerId: z.string() });

dealsRouter.post('/:id/comps/remove', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const result = loadOwned(req, id);
  if ('error' in result) {
    res.status(result.error).json({ error: result.error === 404 ? 'not found' : 'forbidden' });
    return;
  }
  const parsed = removeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const updated = removeComp(result, parsed.data.providerId);
  dealsRepo.update(id, updated);
  res.json({ analysis: updated });
});
