/**
 * Bright MLS provider (BuildSpec §7.1, §9 Phase 9) — Adam's licensed RESO Web
 * API feed for core markets (York County PA + northern MD). Ground-truth sold
 * data; lowest marginal cost in covered counties.
 *
 * Interface-complete scaffold. Wired in Phase 9 once the data-license / feed is
 * approved. `covers()` restricts it to the licensed footprint so the router
 * only routes core-market subjects here (BuildSpec §7.2).
 *
 * Compliance (BuildSpec §7.1): internal-to-ADG use of MLS solds is standard;
 * exposing MLS-sourced solds to outside paid users requires a reviewed
 * data-license scope. Do NOT redistribute publicly.
 */
import { env } from '../../config/env.js';
import type { CompProperty, CompSearchCriteria, SubjectProperty } from '../../types.js';
import { ProviderNotConfiguredError, type PropertyDataProvider } from '../PropertyDataProvider.js';

/** Counties covered by Adam's Bright MLS data license. Extend as needed. */
const COVERED_COUNTIES = new Set(['York']);
const COVERED_ZIP_PREFIXES = ['17', '21']; // PA 17xxx, MD 21xxx (illustrative)

export class BrightMlsProvider implements PropertyDataProvider {
  readonly name = 'bright_mls';

  covers(subject: { county: string | null; zip: string | null }): boolean {
    if (!env.brightMls.enabled) return false;
    if (subject.county && COVERED_COUNTIES.has(subject.county)) return true;
    if (subject.zip && COVERED_ZIP_PREFIXES.some((p) => subject.zip!.startsWith(p))) return true;
    return false;
  }

  private assertConfigured(): void {
    if (!env.brightMls.enabled) {
      throw new ProviderNotConfiguredError(this.name, 'BRIGHT_MLS_ENABLED is false');
    }
    if (!env.brightMls.baseUrl || !env.brightMls.token) {
      throw new ProviderNotConfiguredError(this.name, 'BRIGHT_MLS_BASE_URL/TOKEN not set');
    }
  }

  async getSubject(_address: string): Promise<SubjectProperty | null> {
    this.assertConfigured();
    // TODO(Phase 9): query RESO Property resource by address, map to SubjectProperty.
    throw new ProviderNotConfiguredError(this.name, 'Bright MLS mapping not yet implemented');
  }

  async getCandidateComps(
    _subject: SubjectProperty,
    _c: CompSearchCriteria,
  ): Promise<CompProperty[]> {
    this.assertConfigured();
    // TODO(Phase 9): RESO Property query, StandardStatus=Closed within radius/window.
    throw new ProviderNotConfiguredError(this.name, 'Bright MLS mapping not yet implemented');
  }
}
