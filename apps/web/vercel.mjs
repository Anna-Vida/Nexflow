// Set NEXFLOW_API_ORIGIN to the public origin of the separately hosted API.
// Browser requests stay on the Vercel origin so session cookies remain same-origin.
const configuredOrigin = process.env.NEXFLOW_API_ORIGIN
const apiUrl = configuredOrigin ? new URL(configuredOrigin) : null

if (!apiUrl || apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password || apiUrl.pathname !== '/' || apiUrl.search || apiUrl.hash) {
  throw new Error('NEXFLOW_API_ORIGIN must be the HTTPS origin of the NexFlow API.')
}

const apiOrigin = apiUrl.origin

export const config = {
  framework: 'vite',
  buildCommand: 'npm run build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: `${apiOrigin}/api/:path*` },
    { source: '/socket.io/:path*', destination: `${apiOrigin}/socket.io/:path*` },
    { source: '/(.*)', destination: '/index.html' },
  ],
}
