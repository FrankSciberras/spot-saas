'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import styles from './account-archived.module.css';

export default function AccountArchivedClient() {
  // Whatever session is left is no use to them — end it so the next visit
  // starts cleanly at the sign-in page.
  useEffect(() => {
    createClient().auth.signOut().catch(() => {});
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>
          <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none" aria-hidden="true">
            <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <h1>Your access has been archived</h1>
        <p>
          Your fleet has archived your driver account, so you can&apos;t sign in any more. If you think
          this is a mistake, please contact your fleet manager — they can restore your access.
        </p>
        <Link href="/login" className={styles.homeBtn}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
