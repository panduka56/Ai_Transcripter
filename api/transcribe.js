import multer from "multer";

import {
  cleanupFile,
  createTempFilename,
  ensureTempDir,
  getMaxUploadBytes,
  normalizeError,
  transcribeInput
} from "../lib/transcription.js";

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

function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (result) => {
      if (result instanceof Error) {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    await runMiddleware(req, res, upload.single("media"));
    const { provider, apiKey, youtubeUrl, model } = req.body ?? {};

    const result = await transcribeInput({
      provider,
      apiKey,
      youtubeUrl,
      model,
      filePath: req.file?.path,
      fileName: req.file?.originalname
    });

    return res.status(200).json(result);
  } catch (error) {
    const { status, message } = normalizeError(error);
    return res.status(status).json({ error: message });
  } finally {
    await cleanupFile(req.file?.path);
  }
}
