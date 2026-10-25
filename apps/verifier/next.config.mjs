/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gateflow/shared-types', '@gateflow/merkle'],
};

export default nextConfig;
