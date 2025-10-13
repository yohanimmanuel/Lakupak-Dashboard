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
  serverExternalPackages: ['@prisma/client'],
  // Configure Cloudinary images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
