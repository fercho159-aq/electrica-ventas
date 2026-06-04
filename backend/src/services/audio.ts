import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Transcodifica un buffer de audio a AAC/M4A (audio/mp4) para WhatsApp Cloud API.
 *
 * Nota: se usó AAC en vez de OGG/Opus porque ffmpeg en el VPS (apt 6.1.1 y builds
 * estáticas 7.x/8.x) produce un ogg/opus que WhatsApp marca como "no disponible"
 * (el validador de Meta lo rechaza); el AAC/MP4 es portable y se reproduce siempre.
 * Requiere ffmpeg instalado. Devuelve un MP4/AAC mono.
 */
export async function transcodeAudioForWhatsApp(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'ev-audio-'));
  const inPath = join(dir, 'in');
  const outPath = join(dir, 'out.m4a');

  try {
    await writeFile(inPath, input);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(FFMPEG, [
        '-y',
        '-i', inPath,
        '-vn',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ar', '44100',
        '-ac', '1',
        '-movflags', '+faststart',
        '-f', 'mp4',
        outPath,
      ]);
      const errChunks: Buffer[] = [];
      ff.stderr.on('data', (d) => errChunks.push(d));
      ff.on('error', (e) => reject(new Error(`ffmpeg no disponible: ${e.message}`)));
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg falló (code ${code}): ${Buffer.concat(errChunks).toString().slice(-300)}`));
      });
    });

    return await readFile(outPath);
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
