#!/usr/bin/env node
/**
 * PickleStack — RTSP → MJPEG local proxy
 *
 * Run this on the Raspberry Pi (same network as your IP cameras):
 *   node scripts/rtsp-proxy.js
 *
 * Then set NEXT_PUBLIC_RTSP_PROXY=http://localhost:3001 in your
 * Vercel project environment variables and redeploy.
 *
 * Requires FFmpeg:
 *   sudo apt install ffmpeg
 *
 * Optional: run as a service so it starts on boot:
 *   sudo nano /etc/systemd/system/rtsp-proxy.service
 *   [Unit]
 *   Description=PickleStack RTSP Proxy
 *   After=network.target
 *   [Service]
 *   ExecStart=/usr/bin/node /home/pi/pickleball/scripts/rtsp-proxy.js
 *   Restart=always
 *   User=pi
 *   [Install]
 *   WantedBy=multi-user.target
 *
 *   sudo systemctl enable rtsp-proxy
 *   sudo systemctl start rtsp-proxy
 */

const http = require('http');
const { spawn } = require('child_process');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || process.argv[2] || '3001', 10);
const BOUNDARY = 'frameboundary';

const server = http.createServer((req, res) => {
  // Allow CORS so the Vercel-hosted page can fetch from localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  if (parsedUrl.pathname !== '/stream') {
    res.writeHead(404);
    res.end('Use /stream?url=rtsp://...');
    return;
  }

  const rtspUrl = parsedUrl.searchParams.get('url');
  if (!rtspUrl || !rtspUrl.startsWith('rtsp://')) {
    res.writeHead(400);
    res.end('Missing or invalid ?url= param (must start with rtsp://)');
    return;
  }

  console.log(`[+] Stream started: ${rtspUrl}`);

  res.writeHead(200, {
    'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
    'Cache-Control': 'no-cache, no-store',
    'Connection': 'keep-alive',
  });

  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',   // reliable over LAN; use 'udp' if tcp fails
    '-i', rtspUrl,
    '-f', 'mjpeg',
    '-q:v', '5',                // JPEG quality (2=best, 31=worst)
    '-vf', 'scale=1280:-1',     // max 1280px wide, keep aspect ratio
    '-r', '15',                 // 15 fps — reduce to 10 to save bandwidth
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stderr.on('data', (data) => {
    // Uncomment to debug FFmpeg output:
    // process.stderr.write(data);
  });

  ffmpeg.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('[!] FFmpeg not found. Install with: sudo apt install ffmpeg');
    } else {
      console.error('[!] FFmpeg error:', err.message);
    }
    if (!res.destroyed) res.end();
  });

  let buf = Buffer.alloc(0);

  ffmpeg.stdout.on('data', (chunk) => {
    if (res.destroyed) {
      ffmpeg.kill('SIGTERM');
      return;
    }

    buf = Buffer.concat([buf, chunk]);

    // Extract complete JPEG frames (SOI = FF D8 ... EOI = FF D9)
    while (buf.length > 4) {
      // Locate SOI
      let soi = -1;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0xff && buf[i + 1] === 0xd8) { soi = i; break; }
      }
      if (soi === -1) { buf = Buffer.alloc(0); break; }

      // Locate EOI after SOI
      let eoi = -1;
      for (let i = soi + 2; i < buf.length - 1; i++) {
        if (buf[i] === 0xff && buf[i + 1] === 0xd9) { eoi = i + 2; break; }
      }
      if (eoi === -1) break; // wait for more data

      const frame = buf.slice(soi, eoi);
      buf = buf.slice(eoi);

      try {
        res.write(`--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      } catch {
        ffmpeg.kill('SIGTERM');
        break;
      }
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`[-] Stream ended (exit ${code}): ${rtspUrl}`);
    if (!res.destroyed) res.end();
  });

  req.on('close', () => {
    console.log(`[-] Client disconnected: ${rtspUrl}`);
    ffmpeg.kill('SIGTERM');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PickleStack RTSP proxy listening on http://localhost:${PORT}`);
  console.log(`Stream URL format: http://localhost:${PORT}/stream?url=rtsp://192.168.x.x/...`);
  console.log(`Set NEXT_PUBLIC_RTSP_PROXY=http://localhost:${PORT} in Vercel env vars`);
});
