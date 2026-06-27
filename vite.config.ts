import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'highscore-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/highscores' && req.method === 'GET') {
            const filePath = path.resolve(__dirname, 'highscores.json');
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/json');
              res.end(fs.readFileSync(filePath, 'utf-8'));
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({}));
            }
          } else if (req.url === '/api/highscores' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const filePath = path.resolve(__dirname, 'highscores.json');
                let highscores: Record<string, { name: string; score: number }> = {};
                if (fs.existsSync(filePath)) {
                  try {
                    highscores = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                  } catch (e) {
                    highscores = {};
                  }
                }
                
                const { game, name, score } = data;
                if (game && name !== undefined && score !== undefined) {
                  const current = highscores[game];
                  if (!current || score > current.score) {
                    highscores[game] = { name, score };
                    fs.writeFileSync(filePath, JSON.stringify(highscores, null, 2), 'utf-8');
                  }
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, highscores }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Failed to save highscore' }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
})

