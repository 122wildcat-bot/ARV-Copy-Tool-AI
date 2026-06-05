/**
 * ATTOM provider (BuildSpec §7.1) — stronger national default, public-record
 * heavy. Maps the ATTOM Property API into our schema.
 *
 * Endpoints used:
 *   GET /property/detail            → subject characteristics + lat/lng
 *   GET /sale/snapshot              → recent sold records within a radius
 *
 * Field paths follow ATTOM's documented `property[]` envelope. Anything
 * uncertain about a live payload is marked NOTE and should be confirmed against
 * real responses during Phase 2 (BuildSpec §14) — ATTOM's response shape varies
 * by subscription tier.
 *
 * Docs: https://api.developer.attomdata.com/docs
 */
import { env } from '../../config/env.js';
import type {
  BasementType,
  CompProperty,
  CompSearchCriteria,
  SubjectProperty,
} from '../../types.js';
import { haversineMiles } from '../geo.js';
import { ProviderNotConfiguredError, type PropertyDataProvider } from '../PropertyDataProvider.js';

const BASE_URL = 'https://api.gateway.attomdata.com/propertyapi/v1.0.0';

/** Loose shape of an ATTOM `property[]` element (only the fields we read). */
interface AttomProperty {
  identifier?: { attomId?: number | string; apn?: string; Id?: number | string };
  address?: { line1?: string; line2?: string; oneLine?: string; postal1?: string; countrySubd?: string };
  location?: { latitude?: string | number; longitude?: string | number };
  area?: { countrysecsubd?: string; countyName?: string };
  lot?: { lotsize2?: number; lotSize2?: number; poolind?: string };
  summary?: { yearbuilt?: number; propclass?: string; propsubtype?: string; levels?: number };
  building?: {
    size?: { livingsize?: number; universalsize?: number; bldgsize?: number; grosssize?: number };
    rooms?: { beds?: number; bathstotal?: number };
    interior?: { bsmtsize?: number; bsmttype?: string };
    parking?: { prkgSize?: number | string; garagetype?: string };
    summary?: { levels?: number };
  };
  sale?: {
    amount?: { saleamt?: number };
    salesearchdate?: string;
    saleTransDate?: string;
  };
}

interface AttomResponse {
  status?: { code?: number; msg?: string; total?: number };
  property?: AttomProperty[];
}

export class AttomProvider implements PropertyDataProvider {
  readonly name = 'attom';
  private readonly apiKey: string;

  constructor(apiKey = env.attomApiKey) {
    this.apiKey = apiKey;
  }

  /** National coverage — used as the fallback for any subject. */
  covers(): boolean {
    return true;
  }

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    if (!this.apiKey) {
      throw new ProviderNotConfiguredError(this.name, 'ATTOM_API_KEY is not set');
    }
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      headers: { apikey: this.apiKey, accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`ATTOM ${path} failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  async getSubject(address: string): Promise<SubjectProperty | null> {
    const { address1, address2 } = splitAddress(address);
    const data = await this.get<AttomResponse>('/property/detail', { address1, address2 });
    const rec = data.property?.[0];
    if (!rec) return null;
    return this.toSubject(rec, address);
  }

  async getCandidateComps(
    subject: SubjectProperty,
    c: CompSearchCriteria,
  ): Promise<CompProperty[]> {
    const data = await this.get<AttomResponse>('/sale/snapshot', {
      latitude: subject.lat,
      longitude: subject.lng,
      radius: c.radiusMiles,
      startsalesearchdate: monthsAgo(c.monthsBack),
      endsalesearchdate: isoDate(new Date()),
      pagesize: c.limit,
      orderby: 'salesearchdate desc',
    });

    return (data.property ?? [])
      .map((r) => this.toComp(r, subject))
      .filter((comp): comp is CompProperty => comp !== null);
  }

  private toSubject(r: AttomProperty, fallbackAddress: string): SubjectProperty {
    const lat = num(r.location?.latitude) ?? 0;
    const lng = num(r.location?.longitude) ?? 0;
    return {
      providerId: String(r.identifier?.attomId ?? r.identifier?.Id ?? r.identifier?.apn ?? fallbackAddress),
      standardizedAddress: r.address?.oneLine ?? fallbackAddress,
      lat,
      lng,
      beds: num(r.building?.rooms?.beds),
      baths: num(r.building?.rooms?.bathstotal),
      gla: num(r.building?.size?.livingsize) ?? num(r.building?.size?.universalsize),
      lotSizeSqft: num(r.lot?.lotsize2 ?? r.lot?.lotSize2),
      yearBuilt: num(r.summary?.yearbuilt),
      propertyType: r.summary?.propsubtype ?? r.summary?.propclass ?? null,
      stories: num(r.building?.summary?.levels ?? r.summary?.levels),
      garageSpaces: num(r.building?.parking?.prkgSize),
      pool: r.lot?.poolind ? r.lot.poolind.toUpperCase().startsWith('Y') : null,
      basement: inferBasement(r),
      // NOTE: ATTOM exposes county under area.countrysecsubd on most tiers.
      county: r.area?.countrysecsubd ?? r.area?.countyName ?? null,
      zip: r.address?.postal1 ?? null,
      lastSaleDate: r.sale?.salesearchdate ?? r.sale?.saleTransDate ?? null,
      lastSalePrice: num(r.sale?.amount?.saleamt),
      conditionSignals: [],
      raw: r,
    };
  }

  private toComp(r: AttomProperty, subject: SubjectProperty): CompProperty | null {
    const salePrice = num(r.sale?.amount?.saleamt);
    const saleDate = r.sale?.salesearchdate ?? r.sale?.saleTransDate ?? '';
    // A comp must be a real sold record with a price.
    if (!salePrice || !saleDate) return null;

    const base = this.toSubject(r, r.address?.oneLine ?? 'comp');
    const distanceMiles =
      base.lat && base.lng
        ? haversineMiles({ lat: subject.lat, lng: subject.lng }, { lat: base.lat, lng: base.lng })
        : 0;

    return {
      ...base,
      saleDate,
      salePrice,
      distanceMiles,
      daysOnMarket: null,
      // ATTOM is public-record sourced, not true MLS solds — flag for confidence.
      dataSource: 'public_record',
    };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitAddress(address: string): { address1: string; address2: string } {
  const idx = address.indexOf(',');
  if (idx < 0) return { address1: address.trim(), address2: '' };
  return { address1: address.slice(0, idx).trim(), address2: address.slice(idx + 1).trim() };
}

function isoDate(d: Date): string {
  // ATTOM expects yyyy/mm/dd.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return isoDate(d);
}

function inferBasement(r: AttomProperty): BasementType | null {
  const size = num(r.building?.interior?.bsmtsize);
  if (size && size > 0) {
    const type = (r.building?.interior?.bsmttype ?? '').toLowerCase();
    if (type.includes('fin')) return 'finished';
    return 'unfinished';
  }
  return null;
}
