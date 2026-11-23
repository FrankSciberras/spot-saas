import DeepPage from '@/components/marketing/deep/DeepPage';
import { MESSAGES } from '@/components/marketing/deep/content/messages';
import { marketingMetadata } from '@/lib/seo';

export const metadata = marketingMetadata({
  title: 'Driver Messaging App for Taxi & Ride-Hailing Fleets — Rovora',
  description:
    'Replace the fleet WhatsApp group: direct chats, groups and announcements with read receipts, photos and files. Drivers join and leave with the fleet.',
  path: MESSAGES.path,
  keywords: ['driver messaging app', 'fleet chat app for drivers', 'WhatsApp group alternative for fleets', 'taxi fleet communication software', 'driver announcements app', 'fleet team messaging'],
});

// The free-period length and plan prices are admin-set, so re-render hourly.
export const revalidate = 3600;

export default function MessagesFeaturePage() {
  return <DeepPage content={MESSAGES} />;
}
