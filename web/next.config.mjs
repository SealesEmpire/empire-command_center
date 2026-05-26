/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static ships a binary that must not be bundled by webpack/turbopack.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
