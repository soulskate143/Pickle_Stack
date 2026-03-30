import { spawn } from 'child_process';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * RTSP → MJPEG proxy.
 *
 * Usage: GET /api/stream?url=rtsp://192.168.1.x/stream
 *
 * Spawns FFmpeg on the server to transcode the RTSP feed into a
 * multipart/x-mixed-replace MJPEG stream that browsers can display
 * via a plain <img> tag.  Requires FFmpeg installed on the host
 * (sudo apt install ffmpeg on Raspberry Pi).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return new Response('Missing ?url= param', { status: 400 });
  }

  const boundary = 'frameboundary';
  let ffmpegProcess: ReturnType<typeof spawn> | null = null;

  const readable = new ReadableStream({
    start(controller) {
      ffmpegProcess = spawn(
        'ffmpeg',
        [
          '-rtsp_transport', 'tcp',   // more reliable than UDP over LAN
          '-i', url,
          '-f', 'mjpeg',              // output raw JPEG frames
          '-q:v', '5',                // quality 2-31, lower = better
          '-vf', 'scale=1280:-1',     // cap width, keep aspect ratio
          '-r', '15',                 // 15 fps
          'pipe:1',                   // stdout
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );

      let buf = Buffer.alloc(0);

      ffmpegProcess.stdout!.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk]);

        // Parse complete JPEG frames: SOI = FF D8, EOI = FF D9
        while (buf.length > 4) {
          // Find SOI marker
          let soi = -1;
          for (let i = 0; i < buf.length - 1; i++) {
            if (buf[i] === 0xff && buf[i + 1] === 0xd8) {
              soi = i;
              break;
            }
          }
          if (soi === -1) { buf = Buffer.alloc(0); break; }

          // Find EOI marker after SOI
          let eoi = -1;
          for (let i = soi + 2; i < buf.length - 1; i++) {
            if (buf[i] === 0xff && buf[i + 1] === 0xd9) {
              eoi = i + 2;
              break;
            }
          }
          if (eoi === -1) break; // incomplete frame, wait for more data

          const frame = buf.slice(soi, eoi);
          buf = buf.slice(eoi);

          const header =
            `--${boundary}\r\n` +
            `Content-Type: image/jpeg\r\n` +
            `Content-Length: ${frame.length}\r\n\r\n`;

          try {
            controller.enqueue(Buffer.from(header, 'ascii'));
            controller.enqueue(frame);
            controller.enqueue(Buffer.from('\r\n', 'ascii'));
          } catch {
            ffmpegProcess?.kill('SIGTERM');
            break;
          }
        }
      });

      ffmpegProcess.on('error', (err) => {
        const msg =
          err.message.includes('ENOENT')
            ? 'FFmpeg not found. Install it with: sudo apt install ffmpeg'
            : `FFmpeg error: ${err.message}`;
        try {
          controller.enqueue(Buffer.from(msg));
          controller.close();
        } catch {}
      });

      ffmpegProcess.on('close', () => {
        try { controller.close(); } catch {}
      });

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        ffmpegProcess?.kill('SIGTERM');
      });
    },

    cancel() {
      ffmpegProcess?.kill('SIGTERM');
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
