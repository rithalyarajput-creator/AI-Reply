import { useState } from 'react';

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Badge = ({ value }) => <span className={`badge ${value}`}>{String(value).replace('_', ' ')}</span>;

export const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '-');

// Shows a generated login once, with copy support.
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

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
