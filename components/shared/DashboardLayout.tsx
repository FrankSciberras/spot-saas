import type { SessionUser } from '@/lib/types/database';
import Sidebar from './Sidebar';
import Header from './Header';
import styles from './DashboardLayout.module.css';

interface DashboardLayoutProps {
  user: SessionUser;
  variant: 'admin' | 'driver';
  title?: string;
  children: React.ReactNode;
}

export default function DashboardLayout({
  user,
  variant,
  title,
  children,
}: DashboardLayoutProps) {
  return (
    <div className={styles.layout}>
      <Sidebar user={user} variant={variant} />
      <div className={styles.main}>
        <Header user={user} title={title} />
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
