import Link from 'next/link';
import RovoraThemeToggle from './RovoraThemeToggle';
import FeaturesMenu from './FeaturesMenu';
import { SIGN_IN, START_TRIAL } from './links';
import { getNavViewer } from '@/lib/auth/viewer';

/**
 * Shared marketing top nav. On the home page the section links are pure hashes
 * (so RovoraSmoothScroll animates the jump); on sub-pages they're `/#hash` so the
 * click navigates home first.
 *
 * When the visitor is signed in, the "Sign in / Start free trial" actions are
 * replaced by an avatar that links straight to their dashboard.
 */
export default async function MarketingNav({ onHome = false }: { onHome?: boolean }) {
  const h = (hash: string) => (onHome ? `#${hash}` : `/#${hash}`);
  const viewer = await getNavViewer();
  return (
    <header className="nav">
      <div className="container nav-inner">
        {onHome ? (
          <a className="logo" href="#top"><img src="/logo-full.png" alt="Rovora" /></a>
        ) : (
          <Link className="logo" href="/"><img src="/logo-full.png" alt="Rovora" /></Link>
        )}
        <nav className="nav-links">
          <FeaturesMenu sectionHref={h('features')} />
          <Link href="/integrations">Integrations</Link>
          <Link className="nav-ai" href="/ai">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              <path d="M19 3l.9 2.1L22 6l-2.1.9L19 9l-.9-2.1L16 6l2.1-.9L19 3Z" />
            </svg>
            Rovora AI
          </Link>
          <a href={h('pricing')}>Pricing</a>
          <a href={h('faq')}>FAQ</a>
          <Link href="/blog">Blog</Link>
        </nav>
        <div className="nav-actions">
          <RovoraThemeToggle />
          {viewer ? (
            <Link
              className="nav-avatar"
              href={viewer.dashboardHref}
              title="Go to your dashboard"
              aria-label={`Go to your dashboard${viewer.name ? ` — ${viewer.name}` : ''}`}
            >
              <span aria-hidden>{viewer.initials}</span>
            </Link>
          ) : (
            <>
              <Link className="signin" href={SIGN_IN}>Sign in</Link>
              <Link className="btn btn-primary" href={START_TRIAL}>Start free trial</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
