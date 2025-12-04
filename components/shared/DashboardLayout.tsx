import type { SessionUser } from '@/lib/types/database';
import Sidebar from './Sidebar';
import Header from './Header';
import OnboardingGuide from './OnboardingGuide';
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
        <div className={styles.shell}>
          <Header user={user} title={title} />
          <main className={styles.content}>
            {children}
          </main>
        </div>
      </div>
      {user?.id && <OnboardingGuide userId={user.id} variant={variant} />}
    </div>
  );
}
