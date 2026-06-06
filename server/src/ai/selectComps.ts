/**
 * Call B — comp selection & adjustments (BuildSpec §8.2).
 * Model: LLM_MODEL_REASON (or LLM_MODEL_DEEP in deep mode).
 * The model selects comps, scores similarity, proposes soft adjustments, and
 * reads subject condition. It does NOT compute any reconciled figure.
 */
import { z } from 'zod';
import { env } from '../config/env.js';
import { ADG_METHODOLOGY } from '../prompts/cmaSystemPrompt.js';
import type { CompProperty, CompSelectionResult, SubjectProperty } from '../types.js';
import { callStructured, type TokenUsage } from './client.js';

const adjustmentsSchema = z.object({
  gla: z.number(),
  lot: z.number(),
  beds: z.number(),
  baths: z.number(),
  garage: z.number(),
  condition: z.number(),
  age: z.number(),
  pool: z.number(),
  basement: z.number(),
  other: z.number(),
});

const selectionSchema = z.object({
  selectedComps: z
    .array(
      z.object({
        providerId: z.string(),
        similarityScore: z.number(),
        adjustments: adjustmentsSchema,
        adjustmentRationale: z.string(),
        isOutlierCandidate: z.boolean(),
      }),
    )
    .min(1),
  subjectConditionRead: z.enum(['distressed', 'dated', 'average', 'updated', 'renovated']),
  marketNotes: z.string(),
  floorCeilingNote: z.string(),
});

const numberField = { type: 'number' } as const;
const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    selectedComps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          providerId: { type: 'string' },
          similarityScore: { type: 'number' },
          adjustments: {
            type: 'object',
            additionalProperties: false,
            properties: {
              gla: numberField,
              lot: numberField,
              beds: numberField,
              baths: numberField,
              garage: numberField,
              condition: numberField,
              age: numberField,
              pool: numberField,
              basement: numberField,
              other: numberField,
            },
            required: ['gla', 'lot', 'beds', 'baths', 'garage', 'condition', 'age', 'pool', 'basement', 'other'],
          },
          adjustmentRationale: { type: 'string' },
          isOutlierCandidate: { type: 'boolean' },
        },
        required: ['providerId', 'similarityScore', 'adjustments', 'adjustmentRationale', 'isOutlierCandidate'],
      },
    },
    subjectConditionRead: {
      type: 'string',
      enum: ['distressed', 'dated', 'average', 'updated', 'renovated'],
    },
    marketNotes: { type: 'string' },
    floorCeilingNote: { type: 'string' },
  },
  required: ['selectedComps', 'subjectConditionRead', 'marketNotes', 'floorCeilingNote'],
} as const;

export interface SelectCompsResult {
  selection: CompSelectionResult;
  usage: TokenUsage;
}

export async function selectComps(
  subject: SubjectProperty,
  comps: CompProperty[],
  opts: { targetCount: number; deepMode?: boolean },
): Promise<SelectCompsResult> {
  const model = opts.deepMode ? env.models.deep : env.models.reason;

  const userContent = JSON.stringify(
    {
      instruction: `Select up to ${opts.targetCount} sold comps for the subject. Reference each by its providerId exactly.`,
      subject,
      candidateComps: comps,
    },
    null,
    2,
  );

  const { value, usage } = await callStructured({
    model,
    system: ADG_METHODOLOGY,
    userContent,
    toolName: 'submit_comp_selection',
    toolDescription:
      'Submit the selected comps with similarity scores, soft-category dollar adjustments, a subject condition read, and market notes.',
    inputSchema: INPUT_SCHEMA,
    schema: selectionSchema,
    maxTokens: 4096,
  });

  return { selection: value, usage };
}
