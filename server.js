import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";
import {
  cleanupFile,
  createTempFilename,
  ensureTempDir,
  getMaxUploadBytes,
  normalizeError,
  transcribeInput
} from "./lib/transcription.js";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const tempDir = await ensureTempDir();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tempDir),
    filename: (_req, file, cb) => cb(null, createTempFilename(file.originalname))
  }),
  limits: {
    fileSize: getMaxUploadBytes()
  }
});

app.use(express.static(publicDir));

app.post("/api/transcribe", upload.single("media"), async (req, res) => {
  const { provider, apiKey, youtubeUrl, model } = req.body ?? {};

  try {
    const result = await transcribeInput({
      provider,
      apiKey,
      youtubeUrl,
      model,
      filePath: req.file?.path,
      fileName: req.file?.originalname
    });

    return res.json(result);
  } catch (error) {
    const { status, message } = normalizeError(error);
    return res.status(status).json({ error: message });
  } finally {
    await cleanupFile(req.file?.path);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`AI Transcripts running on http://localhost:${port}`);
});
