/**
 * Mock data provider (dev/demo only). Returns a deterministic subject and a set
 * of sold comps for ANY address, so the full pipeline — AI comp selection +
 * repairs + deterministic valuation/deal math + reports — can be exercised with
 * only an ANTHROPIC_API_KEY (no vendor data key).
 *
 * Gated behind DATA_PROVIDER=mock. NEVER use for real analysis — the comps are
 * synthetic. Swap to RentCast/ATTOM/Bright MLS for production.
 */
import type {
  CompProperty,
  CompSearchCriteria,
  SubjectProperty,
} from '../../types.js';
import type { PropertyDataProvider } from '../PropertyDataProvider.js';

const BASE_LAT = 39.96;
const BASE_LNG = -76.65;

export class MockProvider implements PropertyDataProvider {
  readonly name = 'mock';

  covers(): boolean {
    return true;
  }

  async getSubject(address: string): Promise<SubjectProperty> {
    return {
      providerId: 'mock-subject',
      standardizedAddress: address,
      lat: BASE_LAT,
      lng: BASE_LNG,
      beds: 4,
      baths: 2.5,
      gla: 2100,
      lotSizeSqft: 8000,
      yearBuilt: 1995,
      propertyType: 'SFR',
      stories: 2,
      garageSpaces: 2,
      pool: false,
      basement: 'unfinished',
      county: 'York',
      zip: '17402',
      lastSaleDate: null,
      lastSalePrice: null,
      conditionSignals: ['original 1995 kitchen', 'worn carpet throughout', 'roof ~18 years old'],
      raw: { mock: true },
    };
  }

  async getCandidateComps(
    subject: SubjectProperty,
    c: CompSearchCriteria,
  ): Promise<CompProperty[]> {
    // Deterministic synthetic solds around the subject; one intentional outlier.
    const specs: Array<{ id: string; price: number; gla: number; baths: number; days: number }> = [
      { id: 'mock-c1', price: 365_000, gla: 2150, baths: 2.5, days: 18 },
      { id: 'mock-c2', price: 352_000, gla: 2000, baths: 2.0, days: 27 },
      { id: 'mock-c3', price: 379_000, gla: 2250, baths: 2.5, days: 12 },
      { id: 'mock-c4', price: 358_000, gla: 2050, baths: 2.5, days: 33 },
      { id: 'mock-c5', price: 371_000, gla: 2180, baths: 3.0, days: 9 },
      { id: 'mock-c6', price: 345_000, gla: 1950, baths: 2.0, days: 41 },
      { id: 'mock-c7', price: 412_000, gla: 2600, baths: 3.5, days: 21 }, // outlier
    ];

    return specs.slice(0, c.limit).map((s, i) => ({
      providerId: s.id,
      standardizedAddress: `${100 + i} Comparable Dr, York, PA 17402`,
      lat: BASE_LAT + (i - 3) * 0.002,
      lng: BASE_LNG + (i - 3) * 0.002,
      beds: 4,
      baths: s.baths,
      gla: s.gla,
      lotSizeSqft: 8000,
      yearBuilt: 1994 + (i % 5),
      propertyType: 'SFR',
      stories: 2,
      garageSpaces: 2,
      pool: false,
      basement: 'unfinished',
      county: 'York',
      zip: '17402',
      lastSaleDate: null,
      lastSalePrice: null,
      conditionSignals: [],
      raw: { mock: true },
      saleDate: '2025-09-01',
      salePrice: s.price,
      distanceMiles: 0.2 + i * 0.1,
      daysOnMarket: s.days,
      dataSource: 'mls',
    }));
  }
}
