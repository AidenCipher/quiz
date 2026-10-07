import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { site } from '../lib/site';
import { useGame } from '../lib/store';

/** Keyboard users can jump straight past the header on every page. */
export function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Skip to main content
    </a>
  );
}

export function Footer({ dark = false }: { dark?: boolean }) {
  return (
    <footer
      className={dark ? 'muted-on-dark' : undefined}
      style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: dark ? undefined : 'var(--ink-muted)' }}
    >
      <nav aria-label="Legal" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', justifyContent: 'center' }}>
        <Link to="/privacy">Privacy</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/trust">Trust &amp; safety</Link>
        <Link to="/refunds">Pricing &amp; refunds</Link>
        <Link to="/delete-data">Delete my data</Link>
        <Link to="/credits">Credits &amp; licences</Link>
        <Link to="/contact">Contact</Link>
      </nav>
    </footer>
  );
}

const NOTICE_KEY = 'qa:notice';
const noticeSeen = () => {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Quiz Arena sets no analytics, advertising or tracking storage, so there is nothing to opt into.
 * This is therefore an information notice with a single, ordinary "OK" button, not a fake choice.
 * It never covers a game in progress and is hidden on the projector views.
 */
export function StorageNotice() {
  const { pathname } = useLocation();
  const joined = useGame((s) => !!s.me);
  const [seen, setSeen] = useState(noticeSeen);
  const hidden =
    seen ||
    pathname.startsWith('/host/live') ||
    pathname.startsWith('/screen') ||
    (pathname.startsWith('/j/') && joined);
  if (hidden) return null;
  return (
    <div
      role="region"
      aria-label="Cookies and storage"
      style={{
        flex: 'none',
        background: '#fff',
        color: '#111827',
        borderTop: '1px solid var(--line)',
        padding: '12px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        justifyContent: 'center',
        boxShadow: '0 -2px 8px rgba(0,0,0,.12)',
      }}
    >
      <p style={{ margin: 0, maxWidth: 640, fontSize: 14 }}>
        Quiz Arena only stores what it needs to work on your device: a sign-in cookie for hosts and a seat token so a
        refresh keeps your place in a game. No analytics, advertising or tracking.{' '}
        <Link to="/cookies" style={{ color: '#3a2fc4', textDecoration: 'underline' }}>
          Cookie policy
        </Link>
      </p>
      <button
        className="btn btn-primary"
        onClick={() => {
          try {
            localStorage.setItem(NOTICE_KEY, '1');
          } catch {
            /* still dismiss for this visit */
          }
          setSeen(true);
        }}
      >
        OK
      </button>
    </div>
  );
}

/** Shared page frame for the policy pages. */
export function Page({ title, updated = true, children }: { title: string; updated?: boolean; children: ReactNode }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Quiz Arena`;
    return () => {
      document.title = prev;
    };
  }, [title]);
  return (
    <div className="wallpaper legal-wall">
      <SkipLink />
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 8px' }}>
        <Link to="/" className="chip legal-back">
          <span aria-hidden="true">←</span> Quiz Arena
        </Link>
        <main id="main" tabIndex={-1} className="prose-page legal-card">
          <h1 className="display">{title}</h1>
          {updated && <p className="legal-updated">Last updated: {site.policiesUpdated}</p>}
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
