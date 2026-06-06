/**
 * Geocoder adapter (BuildSpec §7.4). Swappable behind one interface. Defaults
 * to the free US Census geocoder; Google optional via GOOGLE_GEOCODE_KEY.
 */
import { env } from '../config/env.js';

export interface GeocodeResult {
  lat: number;
  lng: number;
  standardized: string;
}

export interface Geocoder {
  geocode(address: string): Promise<GeocodeResult | null>;
}

/** Free US Census Bureau geocoder — good enough for US addresses, no key. */
export class CensusGeocoder implements Geocoder {
  async geocode(address: string): Promise<GeocodeResult | null> {
    const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
    url.searchParams.set('address', address);
    url.searchParams.set('benchmark', 'Public_AR_Current');
    url.searchParams.set('format', 'json');

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: { addressMatches?: Array<{ coordinates?: { x: number; y: number }; matchedAddress?: string }> };
    };
    const match = data.result?.addressMatches?.[0];
    if (!match?.coordinates) return null;
    return {
      lat: match.coordinates.y,
      lng: match.coordinates.x,
      standardized: match.matchedAddress ?? address,
    };
  }
}

export class GoogleGeocoder implements Geocoder {
  constructor(private readonly apiKey = env.googleGeocodeKey) {}

  async geocode(address: string): Promise<GeocodeResult | null> {
    if (!this.apiKey) throw new Error('GOOGLE_GEOCODE_KEY is not set');
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', address);
    url.searchParams.set('key', this.apiKey);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string }>;
    };
    const r = data.results?.[0];
    if (!r?.geometry?.location) return null;
    return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, standardized: r.formatted_address ?? address };
  }
}

export function buildGeocoder(): Geocoder {
  // 'provider' mode defers to the data provider's own geocoding upstream; here
  // we still need a coordinate source, so use Census as the concrete default.
  if (env.geocoder === 'google') return new GoogleGeocoder();
  return new CensusGeocoder();
}
