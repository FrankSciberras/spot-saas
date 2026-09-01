/** @type {import('next').NextConfig} */

// Baseline security headers for every response. Kept deliberately conservative:
// no script-restricting CSP (Sentry tunnel, Supabase, Leaflet tiles, YouTube
// embed and Stripe redirects would each need allow-listing first); the
// frame-ancestors directive alone stops click-jacking. The Rovora Driver app
// loads the portal in a WebView, not an <iframe>, so framing rules don't
// affect it.
const securityHeaders = [
  // Browsers only ever talk to us over HTTPS for the next two years.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  // Never sniff a response into a different content type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy equivalent of frame-ancestors for older browsers.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  // Don't leak full URLs (which can contain ids) to third-party sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera (shift photos) and geolocation (driver "Share location") stay
  // first-party only; nothing on the site needs the microphone.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
];

const nextConfig = {
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    // Server Actions default to a 1 MB request body, which silently rejects
    // larger uploads (e.g. vehicle-model diagram SVGs/PNGs) before the action's
    // own 5 MB check runs. Raise it to comfortably fit those uploads + multipart
    // overhead. Keep the per-file cap in the action itself as the real limit.
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
  typescript: {
    ignoreBuildErrors: false
  }
};

module.exports = nextConfig;


// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "rovora-cabs",
  project: "rovora-dashboard",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Belt-and-braces with the dynamic Replay import in instrumentation-client.ts:
  // strip the Replay sub-features and debug strings we never use at build time,
  // so they cannot leak back into the shared client bundle.
  bundleSizeOptimizations: {
    excludeReplayShadowDom: true,
    excludeReplayIframe: true,
    excludeReplayWorker: true,
    excludeDebugStatements: true,
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
