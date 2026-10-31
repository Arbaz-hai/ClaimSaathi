/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist (legacy build) is used for server-side PDF text extraction;
  // keep it external so the Node.js runtime can require it directly.
  serverExternalPackages: ['pdfjs-dist'],
  // Uploaded documents and the SQLite database live in local, persistent
  // storage (see docs). No serverless deployment assumptions here.
  poweredByHeader: false,
};

export default nextConfig;
