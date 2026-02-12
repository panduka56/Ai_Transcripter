import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import axios from "axios";
import ytdl from "@distube/ytdl-core";
import FormData from "form-data";
import OpenAI from "openai";

const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const OPENAI_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const TMP_DIR_NAME = "ai-transcripts";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function getMaxUploadBytes() {
  return MAX_UPLOAD_BYTES;
}

export function createTempFilename(originalName = "") {
  const extension = path.extname(originalName) || ".bin";
  return `${Date.now()}-${crypto.randomUUID()}${extension}`;
}

export function getTempDir() {
  return path.join(os.tmpdir(), TMP_DIR_NAME);
}

export async function ensureTempDir() {
  const dir = getTempDir();
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupFile(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch {
    // Ignore cleanup issues for temp files.
  }
}

export async function transcribeInput({ provider, apiKey, youtubeUrl, model, filePath, fileName }) {
  if (!provider || !["openai", "elevenlabs"].includes(provider)) {
    throw new HttpError(400, "Choose either OpenAI or ElevenLabs.");
  }

  if (!apiKey?.trim()) {
    throw new HttpError(400, "API key is required.");
  }

  if (!filePath && !youtubeUrl?.trim()) {
    throw new HttpError(400, "Upload a media file or provide a YouTube URL.");
  }

  let workingFilePath = filePath ?? null;
  let cleanupOwnedFile = false;
  const source =
    filePath != null
      ? { kind: "file", label: fileName || path.basename(filePath) }
      : { kind: "youtube", label: youtubeUrl.trim() };

  try {
    if (!workingFilePath && youtubeUrl?.trim()) {
      workingFilePath = await downloadYoutubeAudio(youtubeUrl.trim());
      cleanupOwnedFile = true;
    }

    const stats = await fsp.stat(workingFilePath);
    if (provider === "openai" && stats.size > OPENAI_MAX_UPLOAD_BYTES) {
      throw new HttpError(
        400,
        "OpenAI transcription supports files up to 25 MB. Use a shorter clip or switch to ElevenLabs."
      );
    }

    let transcript = "";
    let modelUsed = "";

    if (provider === "openai") {
      modelUsed = model?.trim() || "gpt-4o-mini-transcribe";
      transcript = await transcribeWithOpenAI({
        apiKey: apiKey.trim(),
        filePath: workingFilePath,
        model: modelUsed
      });
    } else {
      modelUsed = model?.trim() || "scribe_v1";
      transcript = await transcribeWithElevenLabs({
        apiKey: apiKey.trim(),
        filePath: workingFilePath,
        model: modelUsed
      });
    }

    if (!transcript?.trim()) {
      throw new HttpError(502, "Transcription API returned an empty result.");
    }

    return {
      transcript: transcript.trim(),
      provider,
      model: modelUsed,
      source
    };
  } finally {
    if (cleanupOwnedFile) {
      await cleanupFile(workingFilePath);
    }
  }
}

export function normalizeError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, message: error.message };
  }

  const status = Number(error?.status || error?.response?.status) || 500;
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    error?.message ||
    "Unexpected transcription error.";

  return {
    status: status >= 400 && status < 600 ? status : 500,
    message
  };
}

async function transcribeWithOpenAI({ apiKey, filePath, model }) {
  const client = new OpenAI({ apiKey });
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model
  });

  if (typeof response === "string") {
    return response;
  }

  return response?.text ?? "";
}

async function transcribeWithElevenLabs({ apiKey, filePath, model }) {
  const form = new FormData();
  form.append("model_id", model);
  form.append("file", fs.createReadStream(filePath));

  const response = await axios.post("https://api.elevenlabs.io/v1/speech-to-text", form, {
    headers: {
      ...form.getHeaders(),
      "xi-api-key": apiKey
    },
    maxBodyLength: Infinity
  });

  return response?.data?.text ?? "";
}

async function downloadYoutubeAudio(url) {
  if (!ytdl.validateURL(url)) {
    throw new HttpError(400, "Invalid YouTube URL.");
  }

  const tempDir = await ensureTempDir();
  const destination = path.join(tempDir, `${Date.now()}-${crypto.randomUUID()}.webm`);
  const stream = ytdl(url, {
    quality: "highestaudio",
    filter: "audioonly",
    highWaterMark: 1 << 25
  });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destination);
    stream.pipe(output);
    output.on("finish", resolve);
    output.on("error", reject);
    stream.on("error", reject);
  });

  return destination;
}
