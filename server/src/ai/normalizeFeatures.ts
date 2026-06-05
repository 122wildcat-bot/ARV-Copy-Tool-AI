/**
 * Call A — feature normalization (BuildSpec §8.1).
 * Model: LLM_MODEL_EXTRACT (cheapest). High-volume, low-complexity cleanup.
 *
 * Provider adapters already map raw payloads into our SubjectProperty/
 * CompProperty schema, so the structural normalization is largely done. This
 * call focuses on the remaining value-add: inferring missing property type and
 * surfacing data-quality problems the downstream reasoning should weigh. It
 * performs NO valuation.
 */
import { z } from 'zod';
import { env } from '../config/env.js';
import type { CompProperty, NormalizationResult, SubjectProperty } from '../types.js';
import { callStructured, type TokenUsage } from './client.js';

const schema = z.object({
  inferredPropertyType: z.string().nullable(),
  dataQualityNotes: z.array(z.string()),
});

const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    inferredPropertyType: { type: ['string', 'null'] },
    dataQualityNotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['inferredPropertyType', 'dataQualityNotes'],
} as const;

export interface NormalizeResult {
  normalized: NormalizationResult;
  usage: TokenUsage;
}

export async function normalizeFeatures(
  subject: SubjectProperty,
  comps: CompProperty[],
): Promise<NormalizeResult> {
  const userContent = JSON.stringify(
    {
      instruction:
        'Inspect the subject and comps. Infer the subject property type if missing, and list any data-quality problems (missing GLA, suspicious sale prices, stale dates, type mismatches). Do not value anything.',
      subject,
      comps,
    },
    null,
    2,
  );

  const { value, usage } = await callStructured({
    model: env.models.extract,
    system:
      'You are a real estate data normalizer. You clean and flag property data. You never estimate value.',
    userContent,
    toolName: 'submit_normalization',
    toolDescription: 'Submit the inferred property type and any data-quality notes.',
    inputSchema: INPUT_SCHEMA,
    schema,
    maxTokens: 1024,
  });

  const normalizedSubject: SubjectProperty = {
    ...subject,
    propertyType: subject.propertyType ?? value.inferredPropertyType,
  };

  return {
    normalized: {
      subject: normalizedSubject,
      comps,
      dataQualityNotes: value.dataQualityNotes,
    },
    usage,
  };
}
