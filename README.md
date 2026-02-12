# Ai_Transcripter

Browser-based transcription app that supports:
- Audio/video file upload
- YouTube URL transcription
- Provider selection (`ElevenLabs` or `OpenAI`)
- One-click copy and Markdown download
- Polished split-panel UI with local showcase images (`/public/assets`)

## Local development

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

This repo is Vercel-ready with:
- Static frontend in `/public`
- Serverless API routes in `/api`

Deploy steps:

```bash
npm i -g vercel
vercel
vercel --prod
```

No environment variables are required because users provide API keys in the UI at request time.

## API routes

- `POST /api/transcribe`
- `GET /api/health`

## Notes

- API keys are used only per request and are not persisted.
- OpenAI transcription supports files up to 25 MB.
- YouTube audio is downloaded to temp storage and deleted after processing.
