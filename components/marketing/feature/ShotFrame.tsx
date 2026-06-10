import type { ReactNode } from 'react';

const Lock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

/**
 * A faux browser window used in place of product screenshots — the same visual
 * language as the landing-page mocks. `path` shows in the address bar; children
 * render inside the `.mock` body.
 */
export default function ShotFrame({
  path,
  children,
  tight = false,
}: {
  path: string;
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <div className={`shot${tight ? ' tight' : ''}`}>
      <div className="shot-bar">
        <div className="dots"><i /><i /><i /></div>
        <div className="shot-url">
          <Lock />
          app.rovora.eu/<b>{path}</b>
        </div>
      </div>
      <div className="mock">{children}</div>
    </div>
  );
}
