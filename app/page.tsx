import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

/**
 * Root page - redirects based on user role
 */
export default async function HomePage() {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  // Redirect based on role
  if (session.role === 'driver') {
    redirect('/driver');
  } else {
    redirect('/admin');
  }
}
