import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttomProvider } from '../src/data/providers/AttomProvider.js';
import { makeSubject } from './factories.js';

function mockFetchOnce(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const subjectPayload = {
  status: { code: 0, total: 1 },
  property: [
    {
      identifier: { attomId: 123456 },
      address: { oneLine: '212 Torrington Dr, York, PA 17402', postal1: '17402' },
      location: { latitude: '39.96', longitude: '-76.65' },
      area: { countrysecsubd: 'York' },
      lot: { lotsize2: 8000, poolind: 'N' },
      summary: { yearbuilt: 1995, propsubtype: 'SFR' },
      building: {
        size: { livingsize: 2100, universalsize: 2100 },
        rooms: { beds: 4, bathstotal: 2.5 },
        interior: { bsmtsize: 900, bsmttype: 'Finished' },
        parking: { prkgSize: 2 },
        summary: { levels: 2 },
      },
      sale: { amount: { saleamt: 350000 }, salesearchdate: '2025-09-01' },
    },
  ],
};

describe('AttomProvider — subject mapping', () => {
  it('maps the property detail envelope into SubjectProperty', async () => {
    mockFetchOnce(subjectPayload);
    const provider = new AttomProvider('test-key');
    const subject = await provider.getSubject('212 Torrington Dr, York, PA 17402');

    expect(subject).not.toBeNull();
    expect(subject!.providerId).toBe('123456');
    expect(subject!.gla).toBe(2100);
    expect(subject!.beds).toBe(4);
    expect(subject!.baths).toBe(2.5);
    expect(subject!.lotSizeSqft).toBe(8000);
    expect(subject!.yearBuilt).toBe(1995);
    expect(subject!.county).toBe('York');
    expect(subject!.pool).toBe(false);
    expect(subject!.basement).toBe('finished');
    expect(subject!.lat).toBeCloseTo(39.96, 2);
  });

  it('returns null when ATTOM has no property', async () => {
    mockFetchOnce({ status: { code: 1 }, property: [] });
    const provider = new AttomProvider('test-key');
    expect(await provider.getSubject('nowhere')).toBeNull();
  });

  it('throws when the API key is missing', async () => {
    const provider = new AttomProvider('');
    await expect(provider.getSubject('x')).rejects.toThrow(/ATTOM_API_KEY is not set/);
  });
});

describe('AttomProvider — comps mapping', () => {
  it('maps sold records, computes distance, and drops records without a sale', async () => {
    mockFetchOnce({
      property: [
        {
          identifier: { attomId: 1 },
          address: { oneLine: '1 Near St' },
          location: { latitude: '39.97', longitude: '-76.65' },
          sale: { amount: { saleamt: 320000 }, salesearchdate: '2025-08-01' },
          building: { size: { livingsize: 2000 }, rooms: { beds: 4, bathstotal: 2 } },
        },
        {
          // No sale amount → must be dropped.
          identifier: { attomId: 2 },
          address: { oneLine: '2 NoSale St' },
          location: { latitude: '39.98', longitude: '-76.66' },
        },
      ],
    });

    const provider = new AttomProvider('test-key');
    const subject = makeSubject({ lat: 39.96, lng: -76.65 });
    const comps = await provider.getCandidateComps(subject, {
      radiusMiles: 1,
      monthsBack: 6,
      limit: 25,
    });

    expect(comps).toHaveLength(1);
    expect(comps[0]!.providerId).toBe('1');
    expect(comps[0]!.salePrice).toBe(320000);
    expect(comps[0]!.dataSource).toBe('public_record');
    expect(comps[0]!.distanceMiles).toBeGreaterThan(0);
    expect(comps[0]!.distanceMiles).toBeLessThan(2);
  });
});
