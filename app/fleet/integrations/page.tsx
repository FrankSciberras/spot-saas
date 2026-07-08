import { requireRole } from '@/lib/auth/session';
import FleetShell from '@/components/fleet/FleetShell';
import {
  INTEGRATION_CATEGORIES,
  REQUEST_INTEGRATION_MAILTO,
  notifyMailto,
  markFontSize,
} from '@/lib/integrations/catalog';
import styles from './integrations.module.css';

/**
 * Integrations marketplace for fleet operators. Every connection is currently
 * "coming soon" — the cards are presentational (a disabled Connect button plus a
 * "Notify me" mailto) so operators can register interest before we ship each one.
 */
export default async function FleetIntegrationsPage() {
  const user = await requireRole(['admin']);

  return (
    <FleetShell user={user} title="Integrations">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Admin / Integrations</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Integrations</h1>
            </div>
            <p className={styles.subtitle}>
              Connect Rovora to your trackers, ride-hail platforms, messaging and accounting tools.
            </p>
          </div>
        </div>

        <div className={styles.intro}>
          <div className={styles.introIcon} aria-hidden>🔌</div>
          <div>
            <strong>A marketplace is on the way.</strong>
            <p>
              Every connection below is in active development. Tap <em>Notify me</em> on the ones you
              need and we&rsquo;ll email you the moment they go live — or{' '}
              <a href={REQUEST_INTEGRATION_MAILTO}>request one we haven&rsquo;t listed</a>.
            </p>
          </div>
        </div>

        {INTEGRATION_CATEGORIES.map((cat) => (
          <section className={styles.category} key={cat.key}>
            <div className={styles.categoryHead}>
              <h2 className={styles.categoryTitle}>{cat.title}</h2>
              <p className={styles.categoryBlurb}>{cat.blurb}</p>
            </div>
            <div className={styles.grid}>
              {cat.items.map((it) => (
                <div className={styles.card} key={it.name}>
                  <div className={styles.cardTop}>
                    <div
                      className={styles.logo}
                      style={{ background: it.bg, color: it.fg, fontSize: markFontSize(it.mark) }}
                      aria-hidden
                    >
                      {it.mark}
                    </div>
                    <span className={styles.soon}>Coming soon</span>
                  </div>
                  <div className={styles.name}>{it.name}</div>
                  <p className={styles.desc}>{it.desc}</p>
                  <div className={styles.actions}>
                    <button className={styles.connectBtn} type="button" disabled>
                      Connect
                    </button>
                    <a className={styles.notify} href={notifyMailto(it.name)}>
                      Notify me
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </FleetShell>
  );
}
