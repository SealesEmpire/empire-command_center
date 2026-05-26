import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { downloadObject } from "./storage";

const ffmpegPath = (ffmpegStatic as unknown as string) || "ffmpeg";

function run(args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { cwd });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

/**
 * Download the given clip object keys (in order), concatenate them into a
 * single MP4, optionally lay an audio track over it, and return the buffer.
 *
 * Video concat uses the concat demuxer with stream copy (-c copy) since every
 * clip is produced by the same WAN config (identical codec/resolution/fps). If
 * an `audioObjectKey` is given, a second pass muxes the audio (encoded to AAC),
 * trimming to the shorter of the two streams.
 */
export async function assembleClips(
  objectKeys: string[],
  audioObjectKey?: string
): Promise<Buffer> {
  if (objectKeys.length === 0) {
    throw new Error("No clips to assemble.");
  }

  const dir = await mkdtemp(join(tmpdir(), "ecc-assemble-"));
  try {
    const localFiles: string[] = [];
    for (let i = 0; i < objectKeys.length; i++) {
      const buf = await downloadObject(objectKeys[i]);
      const file = join(dir, `clip_${String(i).padStart(4, "0")}.mp4`);
      await writeFile(file, buf);
      localFiles.push(file);
    }

    // concat demuxer list file
    const listPath = join(dir, "list.txt");
    const listBody = localFiles
      .map((f) => `file '${f.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await writeFile(listPath, listBody);

    const concatPath = join(dir, "concat.mp4");
    await run(
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy",
       "-movflags", "+faststart", concatPath],
      dir
    );

    if (!audioObjectKey) {
      return await readFile(concatPath);
    }

    // Mux audio over the concatenated video.
    const audioPath = join(dir, "audio.wav");
    await writeFile(audioPath, await downloadObject(audioObjectKey));
    const outPath = join(dir, "final.mp4");
    await run(
      ["-y", "-i", concatPath, "-i", audioPath,
       "-map", "0:v:0", "-map", "1:a:0",
       "-c:v", "copy", "-c:a", "aac", "-shortest",
       "-movflags", "+faststart", outPath],
      dir
    );
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
