import Icon from '../../components/Icon.jsx';
import LeadForm from './LeadForm.jsx';
import { PageHero, SiteLayout } from './SiteLayout.jsx';

const BENEFITS = [
  ['building', 'One agency panel', 'Create and manage all your client accounts from a single login.'],
  ['wallet', 'Separate wallets', 'Each client has its own prepaid wallet, rates and invoices.'],
  ['shield', 'Your clients stay separate', 'Every client sees only their own data, with their own team logins.'],
  ['list', 'Full audit trail', 'Every login, status change and support access is recorded.'],
];

export default function Partners() {
  return (
    <SiteLayout>
      <PageHero eyebrow="Partners" title="Run WhatsApp for your clients"
        text="Agencies and consultants can onboard and manage many client businesses from one place." />
      <section className="site-wrap section">
        <div className="feature-grid">
          {BENEFITS.map(([icon, t, d]) => (
            <div className="feature" key={t}><span className="f-icon"><Icon name={icon} size={22} /></span><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>
      <section className="alt section">
        <div className="site-wrap narrow">
          <h2>Become a partner</h2>
          <p className="muted">Tell us about your agency and the clients you work with. We will get back with how the partner arrangement works.</p>
          <LeadForm cta="Talk to us about partnering" prefix="[Partner enquiry] " placeholder="About your agency and clients" />
        </div>
      </section>
    </SiteLayout>
  );
}
