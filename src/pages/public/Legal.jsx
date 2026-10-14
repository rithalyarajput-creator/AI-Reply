import { Link } from 'react-router-dom';

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL || '';

function Page({ title, inApp, children }) {
  return (
    <div className={inApp ? '' : 'site'}>
      {!inApp && (
        <header className="site-nav">
          <div className="site-wrap nav-in">
            <Link to="/" className="logo">AI Reply</Link>
            <nav><Link to="/login" className="btn small">Login</Link></nav>
          </div>
        </header>
      )}
      <div className="site-wrap narrow legal">
        <h1>{title}</h1>
        <p className="muted small">Last updated: 14 October 2026</p>
        {children}
        <p>
          Questions: {CONTACT ? <a href={`mailto:${CONTACT}`}>{CONTACT}</a> : 'use the contact form on our home page'}.
        </p>
      </div>
    </div>
  );
}

export function Privacy({ inApp }) {
  return (
    <Page title="Privacy Policy" inApp={inApp}>
      <p>
        AI Reply provides software that helps businesses ("clients") talk to their own customers on WhatsApp.
        This policy explains what information we handle and why.
      </p>
      <h3>Information we handle</h3>
      <ul>
        <li><b>Account information:</b> names, work email addresses, phone numbers and company details of our clients and their staff.</li>
        <li><b>Customer conversation data:</b> phone numbers, names, messages and delivery status that our clients' customers exchange with our clients through the platform.</li>
        <li><b>Technical data:</b> login activity, IP addresses and audit logs used to keep accounts secure.</li>
        <li><b>Website enquiries:</b> details you send us through the contact form.</li>
      </ul>
      <h3>How we use it</h3>
      <ul>
        <li>To provide, secure and support the service.</li>
        <li>To send and receive WhatsApp messages on behalf of our clients, through WhatsApp's official Business API.</li>
        <li>To bill our clients and to respond to enquiries.</li>
      </ul>
      <h3>Roles</h3>
      <p>
        For customer conversation data, our client decides why and how it is used and we process it on their behalf.
        Our clients are responsible for having the right to contact their customers, including obtaining consent
        (opt-in) and honouring opt-out requests.
      </p>
      <h3>Sharing</h3>
      <p>
        We share data only with service providers needed to run the platform (such as hosting, database and
        Meta's WhatsApp Business Platform) and where the law requires. We do not sell personal data.
      </p>
      <h3>Security and retention</h3>
      <p>
        Passwords are stored hashed, access tokens are stored encrypted, and access is limited by role.
        We keep data while an account is active and for a reasonable period afterwards unless the law requires otherwise.
      </p>
      <h3>Your choices</h3>
      <p>
        If you are a customer of one of our clients, contact that business to ask about, correct or delete your data,
        or reply STOP to opt out of messages. Clients and visitors can contact us to ask about their own data.
      </p>
    </Page>
  );
}

export function Terms({ inApp }) {
  return (
    <Page title="Terms of Service" inApp={inApp}>
      <p>By using AI Reply you agree to these terms.</p>
      <h3>The service</h3>
      <p>
        AI Reply provides a web platform for managing WhatsApp conversations, campaigns and automations through
        WhatsApp's official Business API. Availability of WhatsApp features depends on Meta and may change.
      </p>
      <h3>Your responsibilities</h3>
      <ul>
        <li>Keep your login details safe and use one login per person.</li>
        <li>Message only people who have agreed to receive your messages, and stop when they opt out.</li>
        <li>Follow WhatsApp's Business and Commerce policies and applicable law, including laws on spam and data protection.</li>
        <li>Do not send unlawful, misleading, abusive or prohibited content.</li>
      </ul>
      <h3>Payments</h3>
      <p>
        Messages are paid from a prepaid wallet at the rates of your plan. Platform fees are billed as agreed.
        Charges set by Meta may change; we will update rates accordingly.
      </p>
      <h3>Suspension</h3>
      <p>
        We may suspend an account that breaks these terms, puts the quality of shared systems at risk, or has unpaid dues.
      </p>
      <h3>Liability</h3>
      <p>
        The service is provided as available. To the extent the law allows, we are not liable for indirect losses, or for
        interruptions caused by Meta or other third parties.
      </p>
      <h3>Changes</h3>
      <p>We may update these terms. Continued use after a change means you accept the updated terms.</p>
    </Page>
  );
}
