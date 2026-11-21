// A tiny static server for app/ (Node 22, standard library only), so the
// poster editor can be tried in a browser without any install:
//
//   node serve.ts
//   -> http://localhost:8080
//
// Serves only files under app/, never anything above it: a request path is
// resolved inside app/ and rejected when it would climb out. Directory
// requests fall back to index.html. Unknown extensions get a generic binary
// type; everything the editor needs (html, css, js, jpg) has a real one.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(join(fileURLToPath(import.meta.url), '..', 'app'));
const PORT = 8080;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** The file under app/ a URL path names, or null when it escapes app/. */
function safePath(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split('?')[0]!.split('#')[0]!);
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const full = resolve(join(APP_DIR, rel));
  if (full !== APP_DIR && !full.startsWith(APP_DIR + sep)) return null;
  return full;
}

const server = createServer(async (req, res) => {
  try {
    const target = safePath(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (target === null) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('forbidden\n');
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found\n');
  }
});

server.listen(PORT, () => {
  console.log(`Vice Poster editor at http://localhost:${PORT}`);
});
