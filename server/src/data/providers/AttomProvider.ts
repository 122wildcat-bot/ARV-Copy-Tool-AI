/**
 * ATTOM provider (BuildSpec §7.1) — stronger national default, public-record
 * heavy. Interface-complete scaffold; the HTTP mapping is to be filled in
 * during Phase 2 against the ATTOM property + sales-comps endpoints.
 *
 * Docs: https://api.developer.attomdata.com/docs
 */
import { env } from '../../config/env.js';
import type { CompProperty, CompSearchCriteria, SubjectProperty } from '../../types.js';
import { ProviderNotConfiguredError, type PropertyDataProvider } from '../PropertyDataProvider.js';

export class AttomProvider implements PropertyDataProvider {
  readonly name = 'attom';
  private readonly apiKey: string;

  constructor(apiKey = env.attomApiKey) {
    this.apiKey = apiKey;
  }

  covers(): boolean {
    return true; // national
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new ProviderNotConfiguredError(this.name, 'ATTOM_API_KEY is not set');
    }
  }

  async getSubject(_address: string): Promise<SubjectProperty | null> {
    this.assertConfigured();
    // TODO(Phase 2): GET /property/detail then map to SubjectProperty.
    throw new ProviderNotConfiguredError(this.name, 'ATTOM mapping not yet implemented');
  }

  async getCandidateComps(
    _subject: SubjectProperty,
    _c: CompSearchCriteria,
  ): Promise<CompProperty[]> {
    this.assertConfigured();
    // TODO(Phase 2): GET /salescomparables/address then map to CompProperty[].
    throw new ProviderNotConfiguredError(this.name, 'ATTOM mapping not yet implemented');
  }
}
