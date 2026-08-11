import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  // Evita o Next inferir a pasta pai (SISTEMA-SUPLEMENTOS) por causa de outro package-lock.
  turbopack: {
    root: path.join(__dirname),
  },
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
