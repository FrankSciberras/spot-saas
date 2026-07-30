import Link from 'next/link';
import styles from './FleetBackLink.module.css';

interface FleetBackLinkProps {
  /** Where "back" goes — always an explicit route, never history.back(). */
  href: string;
  /** Chip text. Keep it short and lower-case, e.g. "Back to drivers". */
  label?: string;
  /** Drop the bottom margin when the chip already sits inside a header row. */
  flush?: boolean;
}

/**
 * The one back-navigation control for fleet sub-pages: a chip that sits ABOVE
 * the page title, the same shape the driver and vehicle profiles use. Nested
 * pages used to drop "← Back" into the header action row, where a short title
 * left it stranded mid-header and reading like a primary action.
 */
export default function FleetBackLink({ href, label = 'Back', flush = false }: FleetBackLinkProps) {
  return (
    <div className={flush ? `${styles.row} ${styles.flush}` : styles.row}>
      <Link href={href} className={styles.link}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        {label}
      </Link>
    </div>
  );
}
