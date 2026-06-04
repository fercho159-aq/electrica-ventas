import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Transcodifica un buffer de audio a OGG/Opus (formato que acepta WhatsApp Cloud API
 * para notas de voz). Chrome graba en webm/opus, que Meta rechaza; esto lo convierte.
 *
 * IMPORTANTE: el webm de MediaRecorder no se puede leer de forma fiable por stdin
 * (matroska necesita seeking), así que escribimos el input a un archivo temporal.
 * Requiere ffmpeg instalado (apt install ffmpeg en el VPS).
 */
export async function transcodeToOggOpus(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'ev-audio-'));
  const inPath = join(dir, 'in');
  const outPath = join(dir, 'out.ogg');

  try {
    await writeFile(inPath, input);

    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y',
        '-i', inPath,
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-ar', '48000',
        '-ac', '1',
        '-f', 'ogg',
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
