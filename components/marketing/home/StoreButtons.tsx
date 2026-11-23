import Link from 'next/link';
import { Icon } from '../feature/icons';

export const PLAY_URL = 'https://play.google.com/store/apps/details?id=eu.rovora.driver&hl=en';

/** "Get it on Google Play" for Android drivers, "Sign in at rovora.eu" for iPhone. */
export default function StoreButtons() {
  return (
    <div className="store-row">
      <a className="store-btn" href={PLAY_URL} target="_blank" rel="noopener noreferrer">
        <Icon.download aria-hidden="true" />
        <span><small>Drivers on Android</small>Get it on Google Play</span>
      </a>
      <Link className="store-btn ghost" href="/login">
        <Icon.phone aria-hidden="true" />
        <span><small>Drivers on iPhone</small>Sign in at rovora.eu</span>
      </Link>
    </div>
  );
}
