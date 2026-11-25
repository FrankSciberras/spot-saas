"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";
import { isReloadableNow, markRefreshed, recentlyRefreshed } from "@/lib/reloadable-errors";

/**
 * Last-resort boundary: catches what app/error.tsx can't, including a page
 * whose data stopped arriving part-way through (a dropped connection) when the
 * break lands in the root layout's part of the response. Those, and files from
 * a previous build that no longer exist, are fixed by loading the page again,
 * so do that once instead of leaving a blank "Application error" screen. See
 * lib/reloadable-errors.ts.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
    if (isReloadableNow(error) && !recentlyRefreshed()) {
      markRefreshed();
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
