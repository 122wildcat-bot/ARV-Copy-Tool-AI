/**
 * Provider-agnostic data interface (BuildSpec §7.2).
 *
 * Cardinal rule (BuildSpec §0.3): all property/comp data flows through this
 * interface. Business logic NEVER calls a vendor SDK directly — only through
 * a `PropertyDataProvider`, selected by the `ProviderRouter`.
 */
import type { CompProperty, CompSearchCriteria, SubjectProperty } from '../types.js';

export interface PropertyDataProvider {
  readonly name: string;

  /** Returns null if the address can't be resolved. */
  getSubject(address: string): Promise<SubjectProperty | null>;

  /** Returns SOLD comps only, sorted by relevance/distance. */
  getCandidateComps(
    subject: SubjectProperty,
    c: CompSearchCriteria,
  ): Promise<CompProperty[]>;

  /**
   * True if this provider should handle the given subject. Used by the router
   * to prefer a licensed feed (e.g. Bright MLS) in its covered counties.
   */
  covers(subject: { county: string | null; zip: string | null }): boolean;
}

/** Thrown when a provider is selected but lacks the credentials/config to run. */
export class ProviderNotConfiguredError extends Error {
  constructor(providerName: string, detail: string) {
    super(`Data provider "${providerName}" is not configured: ${detail}`);
    this.name = 'ProviderNotConfiguredError';
  }
}
