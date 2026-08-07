import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/institucional',
        destination: '/suplementos',
        permanent: false,
      },
      {
        source: '/institucional/:path*',
        destination: '/suplementos',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
