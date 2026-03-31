/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@cervello-visivo/shared"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
