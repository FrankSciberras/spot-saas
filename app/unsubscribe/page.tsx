import type { Metadata } from 'next';
import Link from 'next/link';
import { isUnsubscribed, verifyUnsubscribe } from '@/lib/email/unsubscribe';
import { resubscribeAction, unsubscribeAction } from './actions';
import styles from './unsubscribe.module.css';

export const metadata: Metadata = {
  title: 'Email preferences',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Where the "Unsubscribe" link in every campaign email lands. Opening the page
 * changes nothing — the person confirms with a button — so link scanners that
 * prefetch URLs in emails can't opt anyone out. (Mail providers' own one-click
 * buttons POST to /api/email/unsubscribe instead.)
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');
  const u = one(sp.u);
  const t = one(sp.t);
  const done = one(sp.done);
  const email = verifyUnsubscribe(u, t);

  if (!email) {
    return (
      <Card>
        <h1>This link doesn&rsquo;t look right</h1>
        <p>
          It may have been cut off by your email app. Try the link in the email again, or write to{' '}
          <a href="mailto:support@rovora.eu?subject=Unsubscribe">support@rovora.eu</a> and we&rsquo;ll take you off the list.
        </p>
      </Card>
    );
  }

  const unsubscribed = await isUnsubscribed(email);
  const hidden = (
    <>
      <input type="hidden" name="u" value={u} />
      <input type="hidden" name="t" value={t} />
    </>
  );

  if (unsubscribed) {
    return (
      <Card tick>
        <h1>You&rsquo;re unsubscribed</h1>
        <p>
          <strong className={styles.email}>{email}</strong> won&rsquo;t receive product updates or newsletters from Rovora any
          more. Essential account emails — like password resets and billing receipts — will still arrive.
        </p>
        <form action={resubscribeAction} className={styles.form}>
          {hidden}
          <span className={styles.hint}>Clicked by mistake?</span>
          <button type="submit" className={styles.btnGhost}>
            Resubscribe
          </button>
        </form>
      </Card>
    );
  }

  return (
    <Card>
      {done === 'resub' && <div className={styles.notice}>Welcome back — you&rsquo;re subscribed again.</div>}
      {done === 'error' && <div className={`${styles.notice} ${styles.noticeError}`}>Something went wrong. Please try again.</div>}
      <h1>Unsubscribe from Rovora emails?</h1>
      <p>
        We&rsquo;ll stop sending product updates and newsletters to <strong className={styles.email}>{email}</strong>. You&rsquo;ll
        still get essential account emails, like password resets and billing receipts.
      </p>
      <form action={unsubscribeAction} className={styles.form}>
        {hidden}
        <button type="submit" className={styles.btn}>
          Unsubscribe
        </button>
      </form>
    </Card>
  );
}

function Card({ children, tick = false }: { children: React.ReactNode; tick?: boolean }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link href="/" aria-label="Rovora home">
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo, same as /thank-you */}
          <img src="/logo-full.png" alt="Rovora" className={styles.logo} />
        </Link>
        {tick && (
          <div className={styles.tick} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {children}
      </div>
    </main>
  );
}
