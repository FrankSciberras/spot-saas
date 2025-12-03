'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { SessionUser } from '@/lib/types/database';
import styles from './Header.module.css';

interface HeaderProps {
  user: SessionUser;
  title?: string;
}

export default function Header({ user, title }: HeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {title && <h1 className={styles.title}>{title}</h1>}
      </div>

      <div className={styles.right}>
        <div className={styles.userInfo}>
          <span className={styles.greeting}>
            Hello, <strong>{user.full_name || user.email.split('@')[0]}</strong>
          </span>
          <span className={`badge ${user.role === 'admin' ? 'badge-info' : user.role === 'staff' ? 'badge-secondary' : 'badge-success'}`}>
            {user.role}
          </span>
        </div>
        <button onClick={handleLogout} className={`btn btn-outline ${styles.logoutBtn}`}>
          Logout
        </button>
      </div>
    </header>
  );
}
