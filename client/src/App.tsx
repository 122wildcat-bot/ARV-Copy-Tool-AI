import { useEffect, useState } from 'react';
import { api, type AnalysisResult } from './lib/api.js';

/**
 * App shell (BuildSpec §13). Lean Phase 8 starting point: auth → address search
 * → result display with live recalc. Components under features/ can be split out
 * from here; one piece of state holds the AnalysisResult and every edit posts to
 * /recalc and replaces it.
 */
const usd = (n: number) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function Brandbar() {
  return (
    <header className="brandbar">
      <span className="monogram">AD</span>
      <strong>ARV Engine</strong>
      <span className="tagline">Adam Druck Group · Real Estate · Investment Analysis</span>
    </header>
  );
}

function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    try {
      if (mode === 'signup') await api.signup(email, password);
      else await api.login(email, password);
      onAuthed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  return (
    <main>
      <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
      <p>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />{' '}
        <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />{' '}
        <button onClick={submit}>{mode === 'login' ? 'Sign in' : 'Sign up'}</button>
      </p>
      <p>
        <a href="#" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </a>
      </p>
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function Results({ dealId, analysis, setAnalysis }: {
  dealId: number;
  analysis: AnalysisResult;
  setAnalysis: (a: AnalysisResult) => void;
}) {
  const a = analysis as any;
  const [mao, setMao] = useState<number>(a.knobs?.maoPercent ?? 0.7);

  async function recalcMao(next: number) {
    setMao(next);
    const { analysis: updated } = await api.recalc(dealId, { dealInputs: { maoPercent: next } });
    setAnalysis(updated);
  }

  return (
    <div>
      <h3>{a.subject?.standardizedAddress}</h3>
      <div>
        <div className="kpi"><div className="label">ARV</div><div className="value">{usd(a.valuation?.arv)}</div></div>
        <div className="kpi"><div className="label">As-Is</div><div className="value">{usd(a.valuation?.asIsValue)}</div></div>
        <div className="kpi"><div className="label">Repairs</div><div className="value">{usd(a.repairs?.total)}</div></div>
        <div className="kpi"><div className="label">Confidence</div><div className="value">{a.valuation?.confidence}</div></div>
      </div>
      <h4>Three-tier listing pricing</h4>
      <div>
        <div className="kpi"><div className="label">Quick Sale</div><div className="value">{usd(a.pricing?.quickSale)}</div></div>
        <div className="kpi"><div className="label">Market</div><div className="value">{usd(a.pricing?.marketList)}</div></div>
        <div className="kpi"><div className="label">Test Market</div><div className="value">{usd(a.pricing?.testTheMarket)}</div></div>
      </div>
      <h4>Wholesale — MAO {Math.round(mao * 100)}%</h4>
      <input type="range" min={0.5} max={0.85} step={0.01} value={mao} onChange={(e) => recalcMao(Number(e.target.value))} />
      <div>
        <div className="kpi"><div className="label">Buyer MAO</div><div className="value">{usd(a.deals?.wholesale?.buyerMAO)}</div></div>
        <div className="kpi"><div className="label">Offer to Seller</div><div className="value">{usd(a.deals?.wholesale?.offerToSeller)}</div></div>
      </div>
    </div>
  );
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dealId, setDealId] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  async function analyze() {
    setBusy(true);
    setError('');
    try {
      const { dealId: id, analysis: result } = await api.analyze(address);
      setDealId(id);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'analysis failed');
    } finally {
      setBusy(false);
    }
  }

  if (authed === null) return <Brandbar />;
  if (!authed) return (<><Brandbar /><Auth onAuthed={() => setAuthed(true)} /></>);

  return (
    <>
      <Brandbar />
      <main>
        <h2>Analyze an address</h2>
        <p>
          <input
            style={{ width: 360 }}
            placeholder="123 Main St, Town, ST 00000"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />{' '}
          <button onClick={analyze} disabled={busy || address.length < 3}>
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>{' '}
          <button onClick={() => api.logout().then(() => setAuthed(false))}>Sign out</button>
        </p>
        {error && <p className="error">{error}</p>}
        {dealId && analysis && <Results dealId={dealId} analysis={analysis} setAnalysis={setAnalysis} />}
      </main>
    </>
  );
}
