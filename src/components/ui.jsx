import { useCallback, useEffect, useState } from 'react';

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Badge = ({ value }) => (
  <span className={`badge ${String(value).toLowerCase()}`}>{String(value).replace(/_/g, ' ')}</span>
);

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '-');
export const fmtMoney = (n) => `₹${Number(n || 0).toFixed(2)}`;

export function Credentials({ title = 'Login created', email, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Email: ${email}\nTemporary password: ${password}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { /* ignore */ }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">Share this with the user now. The password is shown only once and must be changed at first login.</p>
      <pre className="creds">{text}</pre>
      <div className="row">
        <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="btn ghost" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label]) => (
        <button key={k} className={`tab ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

export const PageHead = ({ title, sub, children }) => (
  <div className="head">
    <div>
      <h2>{title}</h2>
      {sub && <p className="muted">{sub}</p>}
    </div>
    <div className="row nomargin">{children}</div>
  </div>
);

export const Empty = ({ children }) => <div className="card empty">{children}</div>;

// Loads data from the API and exposes a reload function and an error.
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => {
    setError('');
    return fn().then(setData).catch((e) => setError(e.message));
  }, deps);
  useEffect(() => { load(); }, [load]);
  return [data, load, error, setData];
}

export function Err({ error }) {
  return error ? <div className="error">{error}</div> : null;
}

// Simple horizontal bar list used for funnels and counts.
export function Bars({ rows, max }) {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((r.value / top) * 100)}%`, background: r.color }} /></div>
          <span className="bar-val">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Daily columns chart (inline SVG, no library).
export function Columns({ data, keys }) {
  if (!data.length) return <p className="muted">No data yet.</p>;
  const max = Math.max(1, ...data.map((d) => Math.max(...keys.map((k) => d[k.key] || 0))));
  const w = 18; const gap = 6; const h = 120;
  const width = data.length * (w * keys.length + gap) + 10;
  return (
    <div className="chart-scroll">
      <svg width={width} height={h + 28} role="img" aria-label="Daily chart">
        {data.map((d, i) => {
          const x0 = 5 + i * (w * keys.length + gap);
          return (
            <g key={d.day}>
              {keys.map((k, j) => {
                const bh = Math.round(((d[k.key] || 0) / max) * h);
                return <rect key={k.key} x={x0 + j * w} y={h - bh} width={w - 2} height={bh} fill={k.color} rx="2"><title>{`${k.label}: ${d[k.key] || 0}`}</title></rect>;
              })}
              <text x={x0} y={h + 16} fontSize="9" fill="currentColor">{String(d.day).slice(5, 10)}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">{keys.map((k) => <span key={k.key}><i style={{ background: k.color }} />{k.label}</span>)}</div>
    </div>
  );
}
