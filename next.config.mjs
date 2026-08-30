/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
      {
        protocol: "https",
        hostname: "scannables.scdn.co",
      },
      {
        protocol: "https",
        hostname: "*.mzstatic.com",
      },
    ],
  },
};

export default nextConfig;
