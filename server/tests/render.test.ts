import { describe, expect, it } from 'vitest';
import { assembleAnalysis } from '../src/engine/assemble.js';
import { renderInvestorReport, renderListingReport } from '../src/reports/render.js';
import { defaultDealInputs } from '../src/config/knobs.js';
import { makeComp, makeKnobs, makeSelection, makeSubject } from './factories.js';
import type { RepairEstimate } from '../src/types.js';

function analysis() {
  const comps = [makeComp('c0', 300_000), makeComp('c1', 310_000), makeComp('c2', 320_000)];
  const repairs: RepairEstimate = {
    lineItems: [{ category: 'kitchen', scope: 'full', cost: 40_000 }],
    subtotal: 40_000,
    contingencyPct: 0.1,
    total: 44_000,
    confidence: 'medium',
  };
  return assembleAnalysis({
    subject: makeSubject({ standardizedAddress: '212 Torrington Dr, York, PA 17402' }),
    comps,
    selections: comps.map((c) => makeSelection(c.providerId)),
    repairs,
    knobs: makeKnobs(),
    dealInputs: { ...defaultDealInputs() },
    meta: { provider: 'test', deepMode: false, tokenUsage: {}, generatedAt: 't0' },
  });
}

describe('report renderer', () => {
  it('listing report shows three-tier pricing and ADG branding', () => {
    const html = renderListingReport(analysis());
    expect(html).toContain('Comparative Market Analysis');
    expect(html).toContain('Adam Druck Group');
    expect(html).toContain('Quick Sale');
    expect(html).toContain('$309,900'); // marketList rounding
    expect(html).toContain('212 Torrington Dr');
  });

  it('investor report shows ARV, wholesale and flip math', () => {
    const html = renderInvestorReport(analysis());
    expect(html).toContain('Investment Analysis');
    expect(html).toContain('Wholesale');
    expect(html).toContain('Flip P&amp;L');
    expect(html).toContain('$310,000'); // ARV
  });

  it('escapes HTML in the subject address', () => {
    const a = analysis();
    a.subject.standardizedAddress = '<script>alert(1)</script>';
    const html = renderInvestorReport(a);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
