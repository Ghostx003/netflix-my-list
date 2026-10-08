import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
          if (url === '/netflix_enriched_kb.json') {
            const filePath = path.join(__dirname, 'public', 'netflix_enriched_kb.json')
            if (fs.existsSync(filePath)) {
              const stat = fs.statSync(filePath)
              res.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': stat.size,
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
          next()
        })
      },
    },
    react(),
    tailwindcss(),
  ],
})


