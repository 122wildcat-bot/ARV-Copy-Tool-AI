import { describe, expect, it } from 'vitest';
import { resolveProviderName } from '../src/data/ProviderRouter.js';

describe('resolveProviderName (deploy works with only an ANTHROPIC_API_KEY)', () => {
  it('honors an explicit DATA_PROVIDER', () => {
    expect(
      resolveProviderName({ dataProvider: 'attom', attomApiKey: '', rentcastApiKey: '' }),
    ).toBe('attom');
    expect(
      resolveProviderName({ dataProvider: 'mock', attomApiKey: 'k', rentcastApiKey: '' }),
    ).toBe('mock');
  });

  it('auto-selects ATTOM when its key is present and DATA_PROVIDER is blank', () => {
    expect(
      resolveProviderName({ dataProvider: '', attomApiKey: 'k', rentcastApiKey: '' }),
    ).toBe('attom');
  });

  it('auto-selects RentCast when only its key is present', () => {
    expect(
      resolveProviderName({ dataProvider: '', attomApiKey: '', rentcastApiKey: 'k' }),
    ).toBe('rentcast');
  });

  it('falls back to mock when nothing is configured', () => {
    expect(
      resolveProviderName({ dataProvider: '', attomApiKey: '', rentcastApiKey: '' }),
    ).toBe('mock');
  });
});
