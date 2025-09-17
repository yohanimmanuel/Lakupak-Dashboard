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
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client']
  }
};

export default withNextIntl(nextConfig);
