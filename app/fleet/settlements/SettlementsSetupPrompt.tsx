import Link from 'next/link';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './settlements-setup-prompt.module.css';

/**
 * Shown on the Settlements page when the fleet has no settlement presets yet —
 * i.e. they've never configured how drivers are paid. Instead of dropping them
 * into an empty workspace, we invite them into the guided pay interview.
 * Staff (who can't configure settlements) get a gentle "not set up yet" note.
 */
export default function SettlementsSetupPrompt({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden>
          <FleetIcon name="euro" size={26} stroke={1.5} />
        </div>
        <h2 className={styles.title}>Let&rsquo;s set up how you pay your drivers</h2>
        <p className={styles.desc}>
          Before you run your first settlement, tell Rovora how your drivers are paid — a share of
          earnings, an hourly or fixed wage, or a mix. It takes about two minutes and we&rsquo;ll do the
          maths for you from then on.
        </p>

        <ul className={styles.points}>
          <li className={styles.point}>
            <span className={styles.pointIco} aria-hidden>1</span>
            <span>Answer a few plain-English questions about your pay deal</span>
          </li>
          <li className={styles.point}>
            <span className={styles.pointIco} aria-hidden>2</span>
            <span>See a live example payslip so you know the numbers are right</span>
          </li>
          <li className={styles.point}>
            <span className={styles.pointIco} aria-hidden>3</span>
            <span>We apply it to every driver — change it any time</span>
          </li>
        </ul>

        {isAdmin ? (
          <div className={styles.actions}>
            <Link
              href="/fleet/settlements/setup"
              className="btn btn-primary btn-lg"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              Set up how I pay drivers
              <FleetIcon name="arrow-right" size={16} />
            </Link>
            <Link href="/fleet/settlements/settings" className={styles.secondaryLink}>
              I&rsquo;ll set it up manually
            </Link>
          </div>
        ) : (
          <div className={styles.staffNote}>
            Your fleet&rsquo;s pay rules haven&rsquo;t been set up yet. Ask an admin to complete the quick
            settlement setup.
          </div>
        )}
      </div>
    </div>
  );
}
