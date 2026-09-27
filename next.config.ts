import type { NextConfig } from "next";
import path from "path";

const withNextIntl = require('next-intl/plugin')({
  defaultLocale: 'id',
  locales: ['en', 'id']
});

const nextConfig: NextConfig = {
  /* config options here */
  // Parent repo has an orphan C:\Laku\package-lock.json; without this, Turbopack
  // treats C:\Laku as the workspace root and fails to resolve Dashboard node_modules
  // (tailwindcss, @apollo/server, etc.).
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/id/landing',
        permanent: false
      },
      {
        source: '/marketing',
        destination: '/sales',
        permanent: false,
      },
      {
        source: '/marketing/campaigns',
        destination: '/sales',
        permanent: false,
      },
      {
        source: '/marketing/campaigns/:path*',
        destination: '/sales',
        permanent: false,
      },
      {
        source: '/marketing/:path*',
        destination: '/sales/:path*',
        permanent: false,
      },
      {
        source: '/:locale/landing/features/marketing',
        destination: '/:locale/landing/features/sales',
        permanent: false,
      },
      {
        source: '/sales/campaigns',
        destination: '/sales',
        permanent: false,
      },
      {
        source: '/sales/campaigns/:path*',
        destination: '/sales',
        permanent: false,
      },
      {
        source: '/campaigns',
        destination: '/sales',
        permanent: false,
      },
      {
        source: '/campaigns/:path*',
        destination: '/sales',
        permanent: false,
      },
    ];
  },
  // Allow external connections for mobile development
  serverExternalPackages: ['@prisma/client', 'winston', 'pino'],
  // Configure Cloudinary images and Google profile images
  images: {
    // Landing pages use custom quality values beyond the Next default (75).
    qualities: [55, 60, 65, 75, 85, 90, 92, 100],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
