/** @type {import('next').NextConfig} */

// Startup guard — fail the build immediately if NEXT_PUBLIC_APP_URL is missing or points at localhost.
// This prevents broken links from ever reaching production silently.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!appUrl) {
  throw new Error(
    '[StudyCore] NEXT_PUBLIC_APP_URL is not set. ' +
    'Set it to the production URL (e.g. https://studycore-eight.vercel.app) before building.'
  );
}
if (appUrl.includes('localhost') || appUrl.includes('127.0.0.1')) {
  // Allow localhost only when explicitly building for local dev (NODE_ENV=development).
  // CI / Vercel builds run with NODE_ENV=production — this will hard-fail there.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[StudyCore] NEXT_PUBLIC_APP_URL contains "localhost" in a production build: "${appUrl}". ` +
      'Set it to the production URL before deploying.'
    );
  }
}

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
  transpilePackages: [
    '@fullcalendar/react',
    '@fullcalendar/core',
    '@fullcalendar/daygrid',
    '@fullcalendar/timegrid',
    '@fullcalendar/interaction',
    '@fullcalendar/resource-timegrid',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
