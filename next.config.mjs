/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Exclude native modules from standalone bundle — they're provided
  // by electron-builder's node_modules bundling (rebuilt for Electron ABI)
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
