import LeadForm from './LeadForm.jsx';
import { PageHero, SiteLayout } from './SiteLayout.jsx';

const EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';
const PHONE = import.meta.env.VITE_CONTACT_PHONE || '';

export default function Contact() {
  return (
    <SiteLayout>
      <PageHero eyebrow="Book a demo" title="Tell us about your business"
        text="We will show you how AI Reply would work for your team and answer your questions." />
      <section className="site-wrap section two-col top">
        <div>
          <LeadForm />
        </div>
        <div>
          <h3>What happens next</h3>
          <ol className="steps-list">
            <li>We read your message and get back to you.</li>
            <li>We show the platform with your use case in mind.</li>
            <li>If it fits, we set up your account and help you connect your number.</li>
          </ol>
          {(EMAIL || PHONE) && (
            <>
              <h3>Reach us directly</h3>
              {EMAIL && <p><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>}
              {PHONE && <p><a href={`tel:${PHONE.replace(/\s/g, '')}`}>{PHONE}</a></p>}
            </>
          )}
        </div>
      </section>
    </SiteLayout>
  );
}
