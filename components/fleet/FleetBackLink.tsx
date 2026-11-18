import Link from 'next/link';
import styles from './FleetBackLink.module.css';

interface FleetBackLinkProps {
  /** Where "back" goes — always an explicit route, never history.back(). */
  href: string;
  /** What the arrow means, e.g. "Back to drivers". Read out and shown on hover — not printed. */
  label?: string;
}

/**
 * The one back-navigation control for fleet sub-pages: an arrow-only button
 * that sits INLINE, right before the page title — wrap the two in
 * `<div className="fleetTitleRow">`. It used to be a full "← Back to …" chip
 * on its own row above the title, which cost a whole line of height on a phone
 * for something the arrow already says.
 */
export default function FleetBackLink({ href, label = 'Back' }: FleetBackLinkProps) {
  return (
    <Link href={href} className={styles.link} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
