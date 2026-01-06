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
  // Configure Cloudinary images and Google profile images
  images: {
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
  // Configure webpack to ignore optional logging dependencies
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark winston and pino as externals so Next.js doesn't try to bundle them
      // These are optional dependencies that may not be installed
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('winston', 'pino');
      } else if (typeof config.externals === 'object') {
        config.externals.winston = 'commonjs winston';
        config.externals.pino = 'commonjs pino';
      }
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
