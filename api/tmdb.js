// Vercel Serverless Function & Local Gateway: TMDB Reverse Proxy
// Bypasses Indian ISP DNS tampering & client-side CORS restrictions

import https from 'node:https';
import dns from 'node:dns';

const cfResolver = new dns.Resolver();
try {
  cfResolver.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1']);
} catch {}

const customDnsLookup = (hostname, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const isAll = typeof options === 'object' && options?.all;

  cfResolver.resolve4(hostname, (err, addrs) => {
    if (err || !addrs || addrs.length === 0) {
      return dns.lookup(hostname, options, cb);
    }
    if (isAll) {
      cb(null, addrs.map((a) => ({ address: a, family: 4 })));
    } else {
      cb(null, addrs[0], 4);
    }
  });
};

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const rawUrl = req.url || '';
    const parsed = new URL(rawUrl, 'http://localhost');

    // Extract target path: either from query param `_path` or from the URL path
    let targetPath = '';
    const pathParam = parsed.searchParams.get('_path');
    if (pathParam) {
      targetPath = '/' + pathParam.replace(/^\/+/, '');
      parsed.searchParams.delete('_path');
    } else {
      targetPath = parsed.pathname.replace(/^\/api\/tmdb\/?/, '/');
      if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
    }

    // Default to v3 API if no version prefix is present
    if (!targetPath.startsWith('/3') && !targetPath.startsWith('/4')) {
      targetPath = '/3' + targetPath;
    }

    const searchStr = parsed.searchParams.toString();
    const targetUrl = `https://api.themoviedb.org${targetPath}${searchStr ? '?' + searchStr : ''}`;

    const headers = {
      'accept': 'application/json',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    };

    if (req.headers && req.headers.authorization) {
      headers['authorization'] = req.headers.authorization;
    }

    const proxyReq = https.request(
      targetUrl,
      {
        method: req.method || 'GET',
        headers,
        lookup: customDnsLookup,
        timeout: 12000,
      },
      (proxyRes) => {
        const contentType = proxyRes.headers['content-type'] || 'application/json';
        res.setHeader('Content-Type', contentType);
        res.status(proxyRes.statusCode || 200);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('TMDB request timed out after 12s'));
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({
        error: 'TMDB Gateway Proxy Error',
        message: err.message || 'Failed connecting to TMDB upstream',
      });
    });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
  } catch (err) {
    res.status(502).json({
      error: 'TMDB Gateway Proxy Error',
      message: err.message || 'Failed parsing request for TMDB upstream',
    });
  }
}
