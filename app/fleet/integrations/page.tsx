import { requireRole } from '@/lib/auth/session';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import { CORE_FEATURES } from '@/lib/modules/catalog';
import FleetShell from '@/components/fleet/FleetShell';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  INTEGRATION_CATEGORIES,
  REQUEST_INTEGRATION_MAILTO,
  notifyMailto,
  markFontSize,
} from '@/lib/integrations/catalog';
import ModuleToggles from './ModuleToggles';
import styles from './integrations.module.css';

/**
 * Modules & integrations for fleet operators.
 *
 * "Your modules" (top) is live — admins switch product features on/off for their
 * fleet, which hides/shows sidebar items and blocks/unblocks the matching pages.
 * "Third-party integrations" (below) is still the coming-soon marketplace: the
 * cards are presentational (a disabled Connect button + a "Notify me" mailto) so
 * operators can register interest before each one ships.
 */
export default async function FleetIntegrationsPage() {
  const user = await requireRole(['admin']);
  const enabledModules = await getEnabledModuleKeys(user.organization_id);

  return (
    <FleetShell user={user} title="Modules & integrations">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Admin / Modules &amp; integrations</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Modules &amp; integrations</h1>
            </div>
            <p className={styles.subtitle}>
              Switch features on or off to shape your workspace, and connect Rovora to the tools you
              already use.
            </p>
          </div>
        </div>

        {/* ── Your modules (live on/off) ── */}
        <section className={styles.category}>
          <div className={styles.categoryHead}>
            <h2 className={styles.categoryTitle}>Your modules</h2>
            <p className={styles.categoryBlurb}>
              Turn features on or off to suit how your fleet works. Turn off what you don&rsquo;t
              use to keep things focused &mdash; you can switch it back on any time, and nothing is
              lost.
            </p>
          </div>

          <div className={styles.coreRow}>
            <span className={styles.coreLabel}>Always included</span>
            {CORE_FEATURES.map((f) => (
              <span className={styles.coreChip} key={f.name}>
                <FleetIcon name={f.icon} size={14} stroke={1.7} />
                {f.name}
              </span>
            ))}
          </div>

          <ModuleToggles enabledKeys={Array.from(enabledModules)} />
        </section>

        {/* ── Third-party integrations (coming-soon marketplace) ── */}
        <section className={styles.category}>
          <div className={styles.categoryHead}>
            <h2 className={styles.categoryTitle}>Third-party integrations</h2>
            <p className={styles.categoryBlurb}>
              Connect Rovora to your trackers, ride-hail platforms, messaging and accounting tools.
            </p>
          </div>

          <div className={styles.intro}>
            <div className={styles.introIcon} aria-hidden>
              <FleetIcon name="plug" size={20} stroke={1.7} />
            </div>
            <div>
              <strong>A marketplace is on the way.</strong>
              <p>
                Every connection below is in active development. Tap <em>Notify me</em> on the ones
                you need and we&rsquo;ll email you the moment they go live &mdash; or{' '}
                <a href={REQUEST_INTEGRATION_MAILTO}>request one we haven&rsquo;t listed</a>.
              </p>
            </div>
          </div>

          {INTEGRATION_CATEGORIES.map((cat) => (
            <section className={styles.category} key={cat.key}>
              <div className={styles.categoryHead}>
                <h3 className={styles.categoryTitle}>{cat.title}</h3>
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
        </section>
      </div>
    </FleetShell>
  );
}
