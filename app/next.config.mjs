import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: '/Users/jonze/private_perps',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Polyfill node built-ins for the browser bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        os: false,
        path: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        process: require.resolve('process/browser'),
        vm: require.resolve('vm-browserify'),
        zlib: require.resolve('browserify-zlib'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        url: require.resolve('url'),
        assert: require.resolve('assert'),
        util: require.resolve('util'),
      };
    }

    // Redirect node: protocol imports to their plain counterparts
    config.resolve.alias = {
      ...config.resolve.alias,
      'node:crypto': 'crypto-browserify',
      'node:buffer': 'buffer',
      'node:stream': 'stream-browserify',
      'node:util': 'util',
      'node:path': 'path',
      'node:os': 'os',
      'node:fs': false,
      'node:net': false,
      'node:tls': false,
    };

    return config;
  },
};

export default nextConfig;
