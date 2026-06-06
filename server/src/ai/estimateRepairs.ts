/**
 * Call C — repair estimate (BuildSpec §8.3).
 * Model: LLM_MODEL_REASON. Produces an itemized repair budget to bring the
 * subject to market/renovated condition (the ARV basis). The deterministic
 * engine totals the line items; the user can edit any line.
 */
import { z } from 'zod';
import { env } from '../config/env.js';
import { REPAIR_METHODOLOGY } from '../prompts/cmaSystemPrompt.js';
import type { RepairEstimate, SubjectConditionRead, SubjectProperty } from '../types.js';
import { callStructured, type TokenUsage } from './client.js';

const repairSchema = z.object({
  lineItems: z
    .array(
      z.object({
        category: z.string(),
        scope: z.string(),
        cost: z.number(),
      }),
    )
    .min(1),
  contingencyPct: z.number(),
  confidence: z.enum(['low', 'medium', 'high']),
});

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    lineItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          scope: { type: 'string' },
          cost: { type: 'number' },
        },
        required: ['category', 'scope', 'cost'],
      },
    },
    contingencyPct: { type: 'number' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['lineItems', 'contingencyPct', 'confidence'],
} as const;

export interface EstimateRepairsResult {
  repairs: RepairEstimate;
  usage: TokenUsage;
}

export async function estimateRepairs(
  subject: SubjectProperty,
  conditionRead: SubjectConditionRead,
): Promise<EstimateRepairsResult> {
  const userContent = JSON.stringify(
    {
      instruction: 'Itemize the repair budget to bring this subject to market/renovated condition.',
      conditionRead,
      gla: subject.gla,
      yearBuilt: subject.yearBuilt,
      conditionSignals: subject.conditionSignals,
      propertyType: subject.propertyType,
    },
    null,
    2,
  );

  const { value, usage } = await callStructured({
    model: env.models.reason,
    system: REPAIR_METHODOLOGY,
    userContent,
    toolName: 'submit_repair_estimate',
    toolDescription: 'Submit the itemized repair budget with a contingency percentage and a confidence level.',
    inputSchema: INPUT_SCHEMA,
    schema: repairSchema,
    maxTokens: 2048,
  });

  // Deterministic totals (BuildSpec §0.4): the engine sums the line items and
  // applies the contingency — the model never produces the total.
  const subtotal = value.lineItems.reduce((acc, li) => acc + li.cost, 0);
  const contingencyPct = normalizeContingency(value.contingencyPct);
  const total = Math.round(subtotal * (1 + contingencyPct));

  const repairs: RepairEstimate = {
    lineItems: value.lineItems,
    subtotal,
    contingencyPct,
    total,
    confidence: value.confidence,
  };

  return { repairs, usage };
}

/**
 * Models sometimes return a contingency as a whole-number percent (12) rather
 * than a fraction (0.12). Normalize to a fraction and clamp to a sane range so
 * a stray value can never blow up the budget (e.g. subtotal * (1 + 12)).
 */
export function normalizeContingency(raw: number): number {
  const frac = raw > 1 ? raw / 100 : raw;
  if (!Number.isFinite(frac) || frac < 0) return 0;
  return Math.min(frac, 0.5);
}
