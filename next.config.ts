import type { NextConfig } from "next";
import path from "path";

const withNextIntl = require('next-intl/plugin')({
  defaultLocale: 'id',
  locales: ['en', 'id']
});

const nextConfig: NextConfig = {
  /* config options here */
  eslint: { ignoreDuringBuilds: false },
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
  // Configure webpack (alias for @/generated/prisma)
  webpack: (config, { isServer }) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@/generated/prisma": path.resolve(process.cwd(), "src/generated/prisma"),
    };
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

const configWithIntl = withNextIntl(nextConfig);
const baseWebpack = configWithIntl.webpack?.bind(configWithIntl);
const prismaAlias = { "@/generated/prisma": path.resolve(process.cwd(), "src/generated/prisma") };
configWithIntl.webpack = (
  config: Parameters<NonNullable<NextConfig["webpack"]>>[0],
  options: Parameters<NonNullable<NextConfig["webpack"]>>[1]
) => {
  const c = baseWebpack ? baseWebpack(config, options) : config;
  c.resolve ??= {};
  c.resolve.alias = { ...c.resolve.alias, ...prismaAlias };
  return c;
};
export default configWithIntl;
