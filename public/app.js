const SETTINGS_KEY = "ai-transcripts.settings.v1";
const SHOWCASE_INTERVAL_MS = 6500;

const form = document.getElementById("transcribe-form");
const providerInput = document.getElementById("provider");
const apiKeyInput = document.getElementById("apiKey");
const apiKeyLabel = document.getElementById("api-key-label");
const modelInput = document.getElementById("model");
const mediaInput = document.getElementById("media");
const youtubeUrlInput = document.getElementById("youtubeUrl");
const filePickerBtn = document.getElementById("filePickerBtn");
const fileMeta = document.getElementById("fileMeta");
const fileSourceBlock = document.getElementById("fileSourceBlock");
const youtubeSourceBlock = document.getElementById("youtubeSourceBlock");
const sourceModeInputs = document.querySelectorAll('input[name="sourceMode"]');
const toggleKeyBtn = document.getElementById("toggleKeyBtn");
const transcriptInput = document.getElementById("transcript");
const metaLine = document.getElementById("metaLine");
const wordCount = document.getElementById("wordCount");
const charCount = document.getElementById("charCount");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const abortBtn = document.getElementById("abortBtn");
const copyBtn = document.getElementById("copyBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");
const showcaseImage = document.getElementById("showcaseImage");
const showcaseKicker = document.getElementById("showcaseKicker");
const showcaseTitle = document.getElementById("showcaseTitle");
const showcaseText = document.getElementById("showcaseText");
const showcaseDots = Array.from(document.querySelectorAll(".visual-dot"));
const providerBadge = document.getElementById("providerBadge");
const sourceBadge = document.getElementById("sourceBadge");
const readinessBadge = document.getElementById("readinessBadge");
const stepKey = document.getElementById("stepKey");
const stepSource = document.getElementById("stepSource");
const stepOutput = document.getElementById("stepOutput");

let inFlightController = null;
let lastResult = null;
let showcaseIndex = 0;
let showcaseTimer = null;

const showcaseSlides = [
  {
    image: "/assets/hero-1.jpg",
    kicker: "Studio Capture",
    title: "Turn long-form audio into clean, production-ready transcript drafts.",
    description: "Use your own request-scoped key with OpenAI or ElevenLabs and keep control over models."
  },
  {
    image: "/assets/hero-2.jpg",
    kicker: "Fast Delivery",
    title: "Move from rough media to copyable text and markdown in one workspace.",
    description: "Built for publishing teams, podcasts, research notes, and knowledge operations."
  },
  {
    image: "/assets/hero-3.jpg",
    kicker: "Source Flexibility",
    title: "Run uploads and YouTube links without switching tools or tabs.",
    description: "One workflow for ingestion, transcription, and export-ready handoff."
  }
];

loadSettings();
syncProviderState();
syncSourceMode();
updateFileMeta();
updateStats();
updateOutputActions();
updateSessionSignals();
initShowcase();

providerInput.addEventListener("change", () => {
  syncProviderState();
  persistSettings();
});

modelInput.addEventListener("change", persistSettings);
apiKeyInput.addEventListener("input", updateSessionSignals);
youtubeUrlInput.addEventListener("input", updateSessionSignals);
sourceModeInputs.forEach((input) => input.addEventListener("change", onSourceModeChange));

filePickerBtn.addEventListener("click", () => mediaInput.click());
mediaInput.addEventListener("change", () => {
  if (getSourceMode() !== "file") {
    setSourceMode("file");
  }
  updateFileMeta();
});

["dragenter", "dragover"].forEach((eventName) => {
  filePickerBtn.addEventListener(eventName, (event) => {
    event.preventDefault();
    filePickerBtn.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  filePickerBtn.addEventListener(eventName, (event) => {
    event.preventDefault();
    filePickerBtn.classList.remove("dragover");
  });
});

filePickerBtn.addEventListener("drop", (event) => {
  const dropped = event.dataTransfer?.files;
  if (!dropped || dropped.length === 0) {
    return;
  }

  mediaInput.files = dropped;
  if (getSourceMode() !== "file") {
    setSourceMode("file");
  }
  updateFileMeta();
});

toggleKeyBtn.addEventListener("click", () => {
  const hidden = apiKeyInput.type === "password";
  apiKeyInput.type = hidden ? "text" : "password";
  toggleKeyBtn.textContent = hidden ? "Hide" : "Show";
});

form.addEventListener("submit", onSubmit);
abortBtn.addEventListener("click", abortCurrentRequest);
copyBtn.addEventListener("click", copyTranscript);
downloadBtn.addEventListener("click", downloadMarkdown);
clearBtn.addEventListener("click", clearTranscript);

showcaseDots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    setShowcaseSlide(index);
    restartShowcaseTimer();
  });
});

function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed.provider === "openai" || parsed.provider === "elevenlabs") {
      providerInput.value = parsed.provider;
    }

    if (typeof parsed.model === "string") {
      modelInput.value = parsed.model;
    }

    if (parsed.sourceMode === "file" || parsed.sourceMode === "youtube") {
      setSourceMode(parsed.sourceMode);
    }
  } catch {
    // Ignore localStorage parsing errors.
  }
}

function persistSettings() {
  const payload = {
    provider: providerInput.value,
    model: modelInput.value,
    sourceMode: getSourceMode()
  };

  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
}

function syncProviderState() {
  const provider = providerInput.value;
  const isOpenAI = provider === "openai";
  apiKeyLabel.textContent = isOpenAI ? "OpenAI API Key" : "ElevenLabs API Key";
  modelInput.placeholder = isOpenAI ? "gpt-4o-mini-transcribe" : "scribe_v1";
  updateSessionSignals();
}

function onSourceModeChange() {
  syncSourceMode();
  persistSettings();
}

function syncSourceMode() {
  const mode = getSourceMode();
  fileSourceBlock.classList.toggle("hidden", mode !== "file");
  youtubeSourceBlock.classList.toggle("hidden", mode !== "youtube");
  updateSessionSignals();
}

function getSourceMode() {
  const selected = document.querySelector('input[name="sourceMode"]:checked');
  return selected?.value || "file";
}

function setSourceMode(mode) {
  sourceModeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
  syncSourceMode();
  persistSettings();
}

function updateFileMeta() {
  const file = mediaInput.files?.[0];
  if (!file) {
    fileMeta.textContent = "No file selected.";
    updateSessionSignals();
    return;
  }

  fileMeta.textContent = `${file.name} (${formatBytes(file.size)})`;
  updateSessionSignals();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
}

async function onSubmit(event) {
  event.preventDefault();

  const sourceMode = getSourceMode();
  const provider = providerInput.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  const youtubeUrl = youtubeUrlInput.value.trim();
  const file = mediaInput.files?.[0] || null;

  if (!apiKey) {
    setStatus("API key is required.", "error");
    return;
  }

  if (sourceMode === "file" && !file) {
    setStatus("Choose a media file before creating a transcript.", "error");
    return;
  }

  if (sourceMode === "youtube" && !youtubeUrl) {
    setStatus("Paste a YouTube URL before creating a transcript.", "error");
    return;
  }

  const body = new FormData();
  body.append("provider", provider);
  body.append("apiKey", apiKey);
  if (model) {
    body.append("model", model);
  }

  if (sourceMode === "file") {
    body.append("media", file);
  } else {
    body.append("youtubeUrl", youtubeUrl);
  }

  inFlightController = new AbortController();
  setBusyState(true);
  setStatus("Processing media and generating transcript...", "busy");

  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body,
      signal: inFlightController.signal
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new Error(payload.error || "Transcription failed.");
    }

    transcriptInput.value = payload.transcript || "";
    lastResult = payload;
    updateOutputMeta();
    updateStats();
    updateOutputActions();
    updateSessionSignals();
    setStatus("Transcript ready.", "ok");
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("Transcription canceled.", "error");
    } else {
      setStatus(error.message || "Transcription failed.", "error");
    }
  } finally {
    setBusyState(false);
    inFlightController = null;
  }
}

function abortCurrentRequest() {
  if (!inFlightController) {
    return;
  }
  inFlightController.abort();
}

async function copyTranscript() {
  const text = transcriptInput.value.trim();
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Transcript copied to clipboard.", "ok");
  } catch {
    setStatus("Copy failed. Clipboard permission may be blocked.", "error");
  }
}

function clearTranscript() {
  transcriptInput.value = "";
  lastResult = null;
  updateOutputMeta();
  updateStats();
  updateOutputActions();
  updateSessionSignals();
  setStatus("Transcript cleared.", "ok");
}

function downloadMarkdown() {
  const transcript = transcriptInput.value.trim();
  if (!transcript) {
    return;
  }

  const now = new Date();
  const provider = lastResult?.provider || providerInput.value;
  const model = lastResult?.model || modelInput.value || "(default)";
  const source = lastResult?.source?.label || (getSourceMode() === "file" ? "uploaded file" : youtubeUrlInput.value.trim());

  const markdown = [
    "# Transcript",
    "",
    `- Generated: ${now.toLocaleString()}`,
    `- Provider: ${provider}`,
    `- Model: ${model}`,
    `- Source: ${source}`,
    "",
    transcript,
    ""
  ].join("\n");

  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = now.toISOString().replace(/[:.]/g, "-");

  link.href = url;
  link.download = `transcript-${stamp}.md`;
  link.click();

  URL.revokeObjectURL(url);
  setStatus("Markdown downloaded.", "ok");
}

function setBusyState(isBusy) {
  submitBtn.disabled = isBusy;
  abortBtn.disabled = !isBusy;
  providerInput.disabled = isBusy;
  apiKeyInput.disabled = isBusy;
  modelInput.disabled = isBusy;
  mediaInput.disabled = isBusy;
  youtubeUrlInput.disabled = isBusy;
  sourceModeInputs.forEach((input) => {
    input.disabled = isBusy;
  });
  updateSessionSignals();
}

function updateOutputMeta() {
  if (!lastResult) {
    metaLine.textContent = "Waiting for input.";
    return;
  }

  const provider = lastResult.provider === "openai" ? "OpenAI" : "ElevenLabs";
  const sourceType = lastResult.source?.kind === "youtube" ? "YouTube" : "Upload";
  const model = lastResult.model || "default model";
  metaLine.textContent = `${provider} • ${model} • ${sourceType}`;
}

function updateStats() {
  const text = transcriptInput.value.trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = text.length;

  wordCount.textContent = `${words.toLocaleString()} words`;
  charCount.textContent = `${chars.toLocaleString()} chars`;
}

function updateOutputActions() {
  const hasText = transcriptInput.value.trim().length > 0;
  copyBtn.disabled = !hasText;
  downloadBtn.disabled = !hasText;
  clearBtn.disabled = !hasText;
}

function setStatus(message, mode = "") {
  statusEl.textContent = message;
  statusEl.classList.remove("busy", "ok", "error");
  if (mode) {
    statusEl.classList.add(mode);
  }
}

async function parseResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function initShowcase() {
  setShowcaseSlide(0);
  showcaseTimer = window.setInterval(() => {
    const nextIndex = (showcaseIndex + 1) % showcaseSlides.length;
    setShowcaseSlide(nextIndex);
  }, SHOWCASE_INTERVAL_MS);
}

function restartShowcaseTimer() {
  if (showcaseTimer) {
    window.clearInterval(showcaseTimer);
  }
  showcaseTimer = window.setInterval(() => {
    const nextIndex = (showcaseIndex + 1) % showcaseSlides.length;
    setShowcaseSlide(nextIndex);
  }, SHOWCASE_INTERVAL_MS);
}

function setShowcaseSlide(index) {
  const slide = showcaseSlides[index];
  if (!slide) {
    return;
  }

  showcaseIndex = index;
  showcaseImage.src = slide.image;
  showcaseKicker.textContent = slide.kicker;
  showcaseTitle.textContent = slide.title;
  showcaseText.textContent = slide.description;

  showcaseDots.forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === index);
    dot.setAttribute("aria-current", dotIndex === index ? "true" : "false");
  });
}

function updateSessionSignals() {
  const provider = providerInput.value === "openai" ? "OpenAI" : "ElevenLabs";
  const sourceMode = getSourceMode();
  const source = sourceMode === "youtube" ? "YouTube URL" : "File Upload";
  const hasKey = apiKeyInput.value.trim().length > 0;
  const hasSource = sourceMode === "youtube" ? youtubeUrlInput.value.trim().length > 0 : Boolean(mediaInput.files?.[0]);
  const hasOutput = transcriptInput.value.trim().length > 0;

  if (providerBadge) {
    providerBadge.textContent = provider;
  }
  if (sourceBadge) {
    sourceBadge.textContent = source;
  }

  if (readinessBadge) {
    if (inFlightController) {
      readinessBadge.textContent = "Processing";
    } else if (!hasKey) {
      readinessBadge.textContent = "Awaiting API key";
    } else if (!hasSource) {
      readinessBadge.textContent = "Awaiting source";
    } else {
      readinessBadge.textContent = "Ready to transcribe";
    }
  }

  if (stepKey) {
    stepKey.classList.toggle("is-done", hasKey);
  }
  if (stepSource) {
    stepSource.classList.toggle("is-done", hasSource);
  }
  if (stepOutput) {
    stepOutput.classList.toggle("is-done", hasOutput);
  }
}
