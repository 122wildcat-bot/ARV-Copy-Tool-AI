/**
 * Analyze route (BuildSpec §11). POST /api/analyze → full AnalysisResult,
 * persisted as a deal for the user.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import { usersRepo } from '../auth/users.js';
import { dealsRepo } from '../db/repo.js';
import { analyzeAddress, type AnalyzeOverrides } from '../service/analyzeService.js';

const bodySchema = z.object({
  address: z.string().min(3),
  overrides: z.record(z.unknown()).optional(),
});

export const analyzeRouter = Router();

analyzeRouter.post('/', requireAuth, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const user = usersRepo.findById(req.userId!);
  try {
    const analysis = await analyzeAddress(
      parsed.data.address,
      (parsed.data.overrides ?? {}) as AnalyzeOverrides,
      user?.defaults ?? {},
    );
    const id = dealsRepo.create(req.userId!, analysis.subject.standardizedAddress, analysis);
    res.status(201).json({ dealId: id, analysis });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'analysis failed' });
  }
});
