import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';
const PHONE = import.meta.env.VITE_CONTACT_PHONE || '';
const WA = String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');

export function SiteLayout({ children }) {
  const [open, setOpen] = useState(false);
  const { pathname, hash } = useLocation();
  const close = () => setOpen(false);
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return (
    <div className="site">
      {(EMAIL || PHONE) && (
        <div className="site-strip">
          <div className="site-wrap strip-in">
            <Link to="/contact">Get started now</Link>
            <span className="sep">|</span>
            <span>Contact us:</span>
            {PHONE && <a href={`tel:${PHONE.replace(/\s/g, '')}`}>{PHONE}</a>}
            {EMAIL && <a href={`mailto:${EMAIL}`}>{EMAIL}</a>}
          </div>
        </div>
      )}
      <header className="site-nav">
        <div className="site-wrap nav-in">
          <Link to="/" className="logo" onClick={close}><span className="logo-mark">AR</span> AI Reply</Link>
          <button className="nav-toggle" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>Menu</button>
          <nav className={open ? 'open' : ''} onClick={close}>
            <div className="dd">
              <NavLink to="/platform">Platform</NavLink>
              <div className="dd-panel">
                <Link to="/platform#inbox">Team inbox</Link>
                <Link to="/platform#campaigns">Campaigns</Link>
                <Link to="/platform#automation">Automations</Link>
                <Link to="/platform#ai">AI assistant</Link>
                <Link to="/platform#api">API and webhooks</Link>
              </div>
            </div>
            <div className="dd">
              <NavLink to="/solutions">Solutions</NavLink>
              <div className="dd-panel">
                <Link to="/solutions#retail">E-commerce and retail</Link>
                <Link to="/solutions#finance">Finance and collections</Link>
                <Link to="/solutions#education">Education</Link>
                <Link to="/solutions#healthcare">Healthcare</Link>
                <Link to="/solutions#realestate">Real estate</Link>
              </div>
            </div>
            <NavLink to="/pricing">Pricing</NavLink>
            <NavLink to="/partners">Partners</NavLink>
            <NavLink to="/resources">Resources</NavLink>
            <div className="dd">
              <NavLink to="/about">Company</NavLink>
              <div className="dd-panel">
                <Link to="/about">About us</Link>
                <Link to="/contact">Contact</Link>
                <Link to="/privacy">Privacy policy</Link>
                <Link to="/terms">Terms of service</Link>
              </div>
            </div>
            <Link to="/login" className="nav-login">Login</Link>
            <Link to="/contact" className="btn small">Book a demo</Link>
          </nav>
        </div>
      </header>

      {children}

      <footer className="site-foot">
        <div className="site-wrap foot-grid">
          <div>
            <div className="logo"><span className="logo-mark">AR</span> AI Reply</div>
            <p className="muted small">WhatsApp team inbox, campaigns and automation on the official WhatsApp Business API.</p>
          </div>
          <div>
            <b>Product</b>
            <Link to="/platform">Platform</Link>
            <Link to="/solutions">Solutions</Link>
            <Link to="/pricing">Pricing</Link>
          </div>
          <div>
            <b>Company</b>
            <Link to="/about">About</Link>
            <Link to="/partners">Partners</Link>
            <Link to="/resources">Resources</Link>
            <Link to="/contact">Contact</Link>
          </div>
          <div>
            <b>Legal</b>
            <Link to="/privacy">Privacy policy</Link>
            <Link to="/terms">Terms of service</Link>
            <Link to="/login">Client login</Link>
          </div>
        </div>
        <div className="site-wrap foot-base muted small">AI Reply. All rights reserved.</div>
      </footer>

      {WA && (
        <a className="wa-float" href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer" aria-label="Chat with us on WhatsApp">
          Chat on WhatsApp
        </a>
      )}
    </div>
  );
}

export function PageHero({ eyebrow, title, text, children }) {
  return (
    <section className="page-hero">
      <div className="site-wrap">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {text && <p className="lead">{text}</p>}
        {children}
      </div>
    </section>
  );
}

export function CtaBand({ title = 'Ready to talk to your customers on WhatsApp?', text = 'Tell us about your business and we will show you how it would work for you.' }) {
  return (
    <section className="cta-band">
      <div className="site-wrap cta-in">
        <div><h2>{title}</h2><p>{text}</p></div>
        <Link to="/contact" className="btn big-btn light">Book a demo</Link>
      </div>
    </section>
  );
}
