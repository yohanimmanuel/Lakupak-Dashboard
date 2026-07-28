import type { NextConfig } from "next";

const withNextIntl = require('next-intl/plugin')({
  defaultLocale: 'id',
  locales: ['en', 'id']
});

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        source: '/',
        destination: '/id/landing',
        permanent: false
      }
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
    ],
  },
};

export default withNextIntl(nextConfig);
