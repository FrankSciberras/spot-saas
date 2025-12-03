import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SPOT Dashboard - Cab Fleet Management',
  description: 'Manage your taxi fleet with ease - drivers, vehicles, shifts, and more.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
