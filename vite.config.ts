import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import dns from 'node:dns'
import https from 'node:https'

const cfResolver = new dns.Resolver()
try {
  cfResolver.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1'])
} catch {}

const customDnsLookup = (hostname: string, options: any, callback: (err: any, address?: any, family?: any) => void) => {
  const cb = typeof options === 'function' ? options : callback
  const isAll = typeof options === 'object' && options?.all

  cfResolver.resolve4(hostname, (err, addrs) => {
    if (err || !addrs || addrs.length === 0) {
      return dns.lookup(hostname, options, cb)
    }
    if (isAll) {
      cb(null, addrs.map((a) => ({ address: a, family: 4 })))
    } else {
      cb(null, addrs[0], 4)
    }
  })
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/public/netflix_enriched_kb.json', '**/*.bin'],
    },
  },
  plugins: [
    {
      name: 'stream-large-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0]
          const staticFiles: Record<string, string> = {
            '/netflix_enriched_kb.json': 'application/json',
            '/netflix_knowledge_base.sqlite': 'application/x-sqlite3',
            '/netflix_database_export.csv': 'text/csv; charset=utf-8',
            '/netflix_knowledge_base.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '/netflix_india_all_titles.json': 'application/json',
            '/embeddings.bin': 'application/octet-stream',
            '/catalogue_metadata.json': 'application/json',
            '/netflix-my-list.json': 'application/json',
          }

          if (url && staticFiles[url]) {
            const filePath = path.join(__dirname, 'public', url.slice(1))
            if (fs.existsSync(filePath)) {
              const stat = fs.statSync(filePath)
              res.writeHead(200, {
                'Content-Type': staticFiles[url],
                'Content-Length': stat.size,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
              })
              if (req.method === 'HEAD') {
                res.end()
                return
              }
              fs.createReadStream(filePath).pipe(res)
              return
            }
          }
          // Anti-ISP Censorship TMDB Proxy (bypasses Indian ISP DNS blocking on api.themoviedb.org)
          if (req.url && req.url.startsWith('/api/tmdb/')) {
            const tmdbSubPath = req.url.replace('/api/tmdb', '')
            const targetUrl = `https://api.themoviedb.org${tmdbSubPath}`

            const proxyReq = https.request(
              targetUrl,
              {
                method: req.method || 'GET',
                headers: {
                  accept: 'application/json',
                  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
                lookup: customDnsLookup,
                timeout: 12000,
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 200, {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                })
                proxyRes.pipe(res)
              }
            )

            proxyReq.on('error', (err) => {
              res.writeHead(502, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'TMDB proxy error', message: err.message }))
            })

            if (req.method !== 'GET' && req.method !== 'HEAD') {
              req.pipe(proxyReq)
            } else {
              proxyReq.end()
            }
            return
          }

          if (url === '/api/git/status') {
            try {
              const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
              const statusRaw = execSync('git status --short').toString().trim()
              const changedCount = statusRaw ? statusRaw.split('\n').filter(Boolean).length : 0
              let remote = ''
              try {
                remote = execSync('git remote get-url origin').toString().trim()
              } catch {}
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, branch, remote, changedCount, statusRaw }))
            } catch (err: any) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: err.message }))
            }
            return
          }

          if (url === '/api/git/publish' && req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', () => {
              try {
                const parsed = body ? JSON.parse(body) : {}
                const commitMsg = parsed.commitMessage || 'chore(catalog): verified and published Netflix catalog update'

                execSync('git add .')
                let commitOut = ''
                try {
                  commitOut = execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`).toString()
                } catch (cErr: any) {
                  commitOut = cErr.stdout ? cErr.stdout.toString() : 'Working tree clean, nothing to commit.'
                }

                let pushOut = ''
                try {
                  pushOut = execSync('git push origin main').toString()
                } catch (pErr: any) {
                  pushOut = pErr.stderr ? pErr.stderr.toString() : (pErr.stdout ? pErr.stdout.toString() : pErr.message)
                }

                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: true, log: `${commitOut}\n${pushOut}`.trim() }))
              } catch (err: any) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: false, error: err.message }))
              }
            })
            return
          }

          next()
        })
      },
    },
    react(),
    tailwindcss(),
  ],
})


