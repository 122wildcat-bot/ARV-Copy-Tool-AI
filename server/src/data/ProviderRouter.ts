/**
 * ProviderRouter (BuildSpec §7.2). Prefers the first provider whose `covers()`
 * returns true for the subject (e.g. Bright MLS in its counties), else falls
 * back to the configured national provider.
 *
 * Subject resolution is a chicken-and-egg problem: `covers()` needs county/zip,
 * which we only get after resolving the subject. So we resolve the subject with
 * the national fallback first (cheap), then decide which provider runs the comp
 * search — routing to a licensed feed when the subject lands in its footprint.
 */
import { env } from '../config/env.js';
import type { CompProperty, CompSearchCriteria, SubjectProperty } from '../types.js';
import type { PropertyDataProvider } from './PropertyDataProvider.js';
import { AttomProvider } from './providers/AttomProvider.js';
import { BrightMlsProvider } from './providers/BrightMlsProvider.js';
import { MockProvider } from './providers/MockProvider.js';
import { RentcastProvider } from './providers/RentcastProvider.js';

function buildNationalProvider(): PropertyDataProvider {
  switch (env.dataProvider) {
    case 'mock':
      return new MockProvider();
    case 'attom':
      return new AttomProvider();
    case 'rentcast':
      return new RentcastProvider();
    // housecanary intentionally not yet implemented (BuildSpec §7.1)
    default:
      return new RentcastProvider();
  }
}

export class ProviderRouter {
  private readonly licensed: PropertyDataProvider[];
  private readonly national: PropertyDataProvider;

  constructor(opts?: { licensed?: PropertyDataProvider[]; national?: PropertyDataProvider }) {
    // Licensed/preferred providers, checked in order via covers().
    this.licensed = opts?.licensed ?? [new BrightMlsProvider()];
    this.national = opts?.national ?? buildNationalProvider();
  }

  /** Pick the provider that should handle comps for a resolved subject. */
  pickFor(subject: { county: string | null; zip: string | null }): PropertyDataProvider {
    const preferred = this.licensed.find((p) => p.covers(subject));
    return preferred ?? this.national;
  }

  async getSubject(address: string): Promise<SubjectProperty | null> {
    // Resolve with the national provider; a licensed feed can refine later.
    return this.national.getSubject(address);
  }

  async getCandidateComps(
    subject: SubjectProperty,
    c: CompSearchCriteria,
  ): Promise<{ provider: string; comps: CompProperty[] }> {
    const provider = this.pickFor(subject);
    const comps = await provider.getCandidateComps(subject, c);
    return { provider: provider.name, comps };
  }
}
