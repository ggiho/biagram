/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@biagram/shared'],
  },
  transpilePackages: [
    '@biagram/shared',
    '@biagram/dbml-parser',
    '@biagram/diagram-engine',
    '@biagram/ddl-converter',
  ],
  webpack: (config) => {
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/sync',
    });

    config.experiments = {
      ...config.experiments,
      syncWebAssembly: true,
    };

    // Monaco Editor configuration for Next.js
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };

    return config;
  },
  images: {
    domains: ['localhost'],
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY || '',
  },
};

module.exports = nextConfig;