/**
 * Report rendering (BuildSpec §12, §16). Maps an AnalysisResult to branded HTML
 * for two modes — investor and listing/CMA. The Playwright HTML→PDF step
 * (Phase 7) wraps this HTML; the renderer itself is the durable part and is
 * pure/testable. ADG branding lives in the brand bar below.
 */
import type { AnalysisResult } from '../types.js';

const usd = (n: number): string =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function brandBar(): string {
  return `<header class="brand">
    <span class="monogram">AD</span>
    <span class="brandname">Adam Druck Group</span>
    <span class="tagline">Real Estate · Investment Analysis</span>
  </header>`;
}

function styles(): string {
  return `<style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1c1c1c; margin: 0; padding: 0 32px 48px; }
    .brand { display: flex; align-items: baseline; gap: 12px; border-bottom: 3px solid #b5651d; padding: 18px 0; margin-bottom: 24px; }
    .monogram { font-weight: bold; font-size: 22px; letter-spacing: 1px; color: #b5651d; }
    .brandname { font-size: 18px; font-weight: bold; }
    .tagline { font-size: 12px; color: #666; }
    h1 { font-size: 22px; margin: 8px 0; }
    h2 { font-size: 15px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: right; padding: 6px 8px; border-bottom: 1px solid #eee; }
    th:first-child, td:first-child { text-align: left; }
    .kpis { display: flex; gap: 24px; margin: 12px 0; }
    .kpi { background: #faf7f2; border: 1px solid #e8e0d4; border-radius: 6px; padding: 12px 16px; }
    .kpi .label { font-size: 11px; color: #777; text-transform: uppercase; }
    .kpi .value { font-size: 20px; font-weight: bold; }
    .note { font-size: 11px; color: #777; margin-top: 8px; }
    .flag { color: #a33; }
  </style>`;
}

function compRows(analysis: AnalysisResult): string {
  return analysis.comps.included
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.comp.standardizedAddress)}</td>
        <td>${usd(c.comp.salePrice)}</td>
        <td>${usd(c.adjustedPrice)}</td>
        <td>${c.similarityScore.toFixed(2)}</td>
        <td>${pct(c.grossAdjPct)}</td>
      </tr>`,
    )
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${styles()}</head>
    <body>${brandBar()}${body}</body></html>`;
}

export function renderListingReport(analysis: AnalysisResult): string {
  const v = analysis.valuation;
  const p = analysis.pricing;
  const body = `
    <h1>Comparative Market Analysis</h1>
    <p>${escapeHtml(analysis.subject.standardizedAddress)}</p>
    <div class="kpis">
      <div class="kpi"><div class="label">Quick Sale</div><div class="value">${usd(p.quickSale)}</div></div>
      <div class="kpi"><div class="label">Market Value</div><div class="value">${usd(p.marketList)}</div></div>
      <div class="kpi"><div class="label">Test the Market</div><div class="value">${usd(p.testTheMarket)}</div></div>
    </div>
    <h2>Selected Comparables</h2>
    <table><thead><tr><th>Address</th><th>Sold</th><th>Adjusted</th><th>Similarity</th><th>Gross Adj</th></tr></thead>
      <tbody>${compRows(analysis)}</tbody></table>
    <p class="note">Floor / ceiling reference: ${usd(v.valueRange[0])} – ${usd(v.valueRange[1])} (${analysis.comps.excluded.length} comp(s) excluded). Confidence: ${v.confidence}.</p>
  `;
  return shell('CMA — Adam Druck Group', body);
}

export function renderInvestorReport(analysis: AnalysisResult): string {
  const v = analysis.valuation;
  const w = analysis.deals.wholesale;
  const f = analysis.deals.flip;
  const body = `
    <h1>Investment Analysis</h1>
    <p>${escapeHtml(analysis.subject.standardizedAddress)}</p>
    <div class="kpis">
      <div class="kpi"><div class="label">ARV</div><div class="value">${usd(v.arv)}</div></div>
      <div class="kpi"><div class="label">Repairs</div><div class="value">${usd(analysis.repairs.total)}</div></div>
      <div class="kpi"><div class="label">As-Is</div><div class="value">${usd(v.asIsValue)}</div></div>
    </div>
    <h2>Wholesale</h2>
    <table><tbody>
      <tr><td>Buyer MAO</td><td>${usd(w.buyerMAO)}</td></tr>
      <tr><td>Offer to seller</td><td>${usd(w.offerToSeller)}</td></tr>
      <tr><td>Assignment fee (spread)</td><td>${usd(w.spread)}</td></tr>
    </tbody></table>
    <h2>Flip P&amp;L</h2>
    <table><tbody>
      <tr><td>Purchase</td><td>${usd(f.purchase)}</td></tr>
      <tr><td>Total cost</td><td>${usd(f.totalCost)}</td></tr>
      <tr><td>Projected profit</td><td>${usd(f.projectedProfit)}</td></tr>
      <tr><td>ROI</td><td>${pct(f.roi)}</td></tr>
    </tbody></table>
    <h2>Repair Breakdown</h2>
    <table><thead><tr><th>Category</th><th>Cost</th></tr></thead><tbody>
      ${analysis.repairs.lineItems.map((li) => `<tr><td>${escapeHtml(li.category)}</td><td>${usd(li.cost)}</td></tr>`).join('')}
      <tr><td>Contingency (${pct(analysis.repairs.contingencyPct)})</td><td>${usd(analysis.repairs.total - analysis.repairs.subtotal)}</td></tr>
    </tbody></table>
  `;
  return shell('Investment Analysis — Adam Druck Group', body);
}
