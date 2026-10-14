import { useState } from 'react';

export default function LeadForm({ cta = 'Request a demo', placeholder = 'What would you like to do with WhatsApp?', prefix = '' }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', message: '', website: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, done: false, error: '' });
    try {
      const res = await fetch('/api/public/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, message: `${prefix}${f.message}` }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not send. Please try again.');
      setState({ busy: false, done: true, error: '' });
    } catch (err) { setState({ busy: false, done: false, error: err.message }); }
  };
  if (state.done) return <div className="ok">Thank you. We will contact you shortly.</div>;
  return (
    <form className="site-form" onSubmit={submit}>
      <input aria-label="Name" placeholder="Your name" value={f.name} onChange={set('name')} required />
      <input aria-label="Email" type="email" placeholder="Email" value={f.email} onChange={set('email')} />
      <input aria-label="Phone" placeholder="Phone / WhatsApp number" value={f.phone} onChange={set('phone')} />
      <input aria-label="Company" placeholder="Company" value={f.company} onChange={set('company')} />
      <textarea aria-label="Message" rows="4" placeholder={placeholder} value={f.message} onChange={set('message')} />
      <input className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" name="website" value={f.website} onChange={set('website')} />
      {state.error && <div className="error">{state.error}</div>}
      <button className="btn big-btn" disabled={state.busy}>{state.busy ? 'Sending...' : cta}</button>
      <p className="muted small">Share an email or a phone number so we can reach you.</p>
    </form>
  );
}
