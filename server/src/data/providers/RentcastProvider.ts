/**
 * RentCast provider (BuildSpec §7.1) — the cheap, dev-friendly MVP default.
 *
 * Implements the PropertyDataProvider interface against the RentCast REST API.
 * Field mappings follow RentCast's documented schema; anything uncertain about
 * a live payload is marked with NOTE and should be confirmed against real
 * responses during Phase 2 (BuildSpec §14).
 *
 * Docs: https://developers.rentcast.io/reference
 */
import { env } from '../../config/env.js';
import type {
  BasementType,
  CompProperty,
  CompSearchCriteria,
  SubjectProperty,
} from '../../types.js';
import { ProviderNotConfiguredError, type PropertyDataProvider } from '../PropertyDataProvider.js';

const BASE_URL = 'https://api.rentcast.io/v1';

interface RentcastRecord {
  id?: string;
  formattedAddress?: string;
  latitude?: number;
  longitude?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  propertyType?: string;
  county?: string;
  zipCode?: string;
  features?: { garageSpaces?: number; pool?: boolean; floorCount?: number };
  lastSaleDate?: string;
  lastSalePrice?: number;
  // comp-only fields
  price?: number;
  listedDate?: string;
  daysOnMarket?: number;
  distance?: number;
}

export class RentcastProvider implements PropertyDataProvider {
  readonly name = 'rentcast';
  private readonly apiKey: string;

  constructor(apiKey = env.rentcastApiKey) {
    this.apiKey = apiKey;
  }

  /** RentCast is a national provider — it covers everything as a fallback. */
  covers(): boolean {
    return true;
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    if (!this.apiKey) {
      throw new ProviderNotConfiguredError(this.name, 'RENTCAST_API_KEY is not set');
    }
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey, accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`RentCast ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async getSubject(address: string): Promise<SubjectProperty | null> {
    const records = await this.get<RentcastRecord[]>('/properties', { address });
    const rec = Array.isArray(records) ? records[0] : (records as RentcastRecord | undefined);
    if (!rec) return null;
    return this.toSubject(rec, address);
  }

  async getCandidateComps(
    subject: SubjectProperty,
    c: CompSearchCriteria,
  ): Promise<CompProperty[]> {
    // RentCast's AVM value endpoint returns sold comparables with distances.
    const result = await this.get<{ comparables?: RentcastRecord[] }>('/avm/value', {
      latitude: subject.lat,
      longitude: subject.lng,
      propertyType: subject.propertyType ?? undefined,
      bedrooms: subject.beds ?? undefined,
      bathrooms: subject.baths ?? undefined,
      squareFootage: subject.gla ?? undefined,
      maxRadius: c.radiusMiles,
      compCount: c.limit,
    });
    const comps = result.comparables ?? [];
    return comps
      .filter((r) => typeof r.price === 'number')
      .map((r) => this.toComp(r));
  }

  private toSubject(r: RentcastRecord, fallbackAddress: string): SubjectProperty {
    return {
      providerId: r.id ?? r.formattedAddress ?? fallbackAddress,
      standardizedAddress: r.formattedAddress ?? fallbackAddress,
      lat: r.latitude ?? 0,
      lng: r.longitude ?? 0,
      beds: r.bedrooms ?? null,
      baths: r.bathrooms ?? null,
      gla: r.squareFootage ?? null,
      lotSizeSqft: r.lotSize ?? null,
      yearBuilt: r.yearBuilt ?? null,
      propertyType: r.propertyType ?? null,
      stories: r.features?.floorCount ?? null,
      garageSpaces: r.features?.garageSpaces ?? null,
      pool: r.features?.pool ?? null,
      basement: this.inferBasement(r),
      county: r.county ?? null,
      zip: r.zipCode ?? null,
      lastSaleDate: r.lastSaleDate ?? null,
      lastSalePrice: r.lastSalePrice ?? null,
      conditionSignals: [],
      raw: r,
    };
  }

  private toComp(r: RentcastRecord): CompProperty {
    const subjectLike = this.toSubject(r, r.formattedAddress ?? 'comp');
    return {
      ...subjectLike,
      saleDate: r.lastSaleDate ?? r.listedDate ?? '',
      salePrice: r.price ?? r.lastSalePrice ?? 0,
      distanceMiles: r.distance ?? 0,
      daysOnMarket: r.daysOnMarket ?? null,
      // NOTE: RentCast comparables are AVM-sourced (estimate/public record),
      // not true MLS solds; flag accordingly for confidence grading.
      dataSource: 'estimate',
    };
  }

  // RentCast does not expose a basement enum directly; left null unless a
  // feature flag is present. Kept as a hook for future mapping.
  private inferBasement(_r: RentcastRecord): BasementType | null {
    return null;
  }
}
