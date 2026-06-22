/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // NOTE: static export (`output: 'export'`) is intentionally OFF — it disables
  // Next.js API routes, which the boardroom needs for persistence + seat calls.
  // Re-introduce a server (or a packaged-app strategy) when we package for
  // GitHub (section 14 TODO). Dev + the Electron dev shell load the live Next
  // server on :20020, so API routes work there.
  images: { unoptimized: true },
}

module.exports = nextConfig
