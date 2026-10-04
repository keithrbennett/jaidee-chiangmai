// API server. Dev: `npm run dev` runs this alongside Vite (which proxies /api here).
// Production: `npm run build && npm start` serves the built app and the API on one port.
import express from 'express'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Load .env if present. (Not using `node --env-file-if-exists` because it crashes `node --watch` when .env is missing.)
try {
  process.loadEnvFile()
} catch {
  // No .env file; rely on the real environment.
}

// Imported after .env is loaded: the database and auth modules read it at load time.
const { claude } = await import('./routes/claude.js')
const { command } = await import('./routes/command.js')
const { community } = await import('./routes/community.js')
const { data } = await import('./routes/data.js')
const { hazardRoutes } = await import('./routes/hazards.js')
const { startPush } = await import('./push.js')
const { bootstrapAdmin } = await import('./lib/auth.js')

const PORT = Number(process.env.PORT ?? 8787)

const app = express()
app.disable('x-powered-by')
// Behind a reverse proxy (nginx, Cloudflare …) set TRUST_PROXY so rate limits see the real client address.
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)
// Report and lost-and-found photos come as data URLs; everything else is small.
app.use('/api', express.json({ limit: '2mb' }))
app.use('/api', data, hazardRoutes, community, command, claude)
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

// Serve the production build if it exists (npm run build && npm start).
const dist = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: dist }))
}

bootstrapAdmin()
startPush()

app.listen(PORT, (err) => {
  // Express 5 passes listen errors (e.g. EADDRINUSE) here instead of throwing.
  if (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use. Is another copy of the server running? Stop it or set PORT.`
        : err,
    )
    process.exit(1)
  }
  console.log(`API listening on http://localhost:${PORT}`)
})
