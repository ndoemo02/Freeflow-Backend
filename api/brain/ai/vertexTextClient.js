import { VertexAI } from "@google-cloud/vertexai";

const DEFAULT_TEXT_MODEL =
  process.env.GEMINI_TEXT_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash";

let vertexClient = null;
const modelCache = new Map();

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`vertex_timeout_${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeJsonText(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return "";
  // Handle fenced JSON blocks
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() || raw;
}

function extractTextFromVertexResponse(result) {
  const parts = result?.response?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  return text || null;
}

export function getVertexProjectId() {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT ||
    ""
  );
}

export function getVertexLocation() {
  return (
    process.env.GCP_LOCATION ||
    process.env.GOOGLE_VERTEX_LOCATION ||
    process.env.GCLOUD_LOCATION ||
    process.env.GOOGLE_CLOUD_LOCATION ||
    process.env.GEMINI_LOCATION ||
    "global"
  );
}

export function isVertexTextConfigured() {
  return Boolean(getVertexProjectId());
}

function getVertexClient() {
  if (vertexClient) return vertexClient;
  const project = getVertexProjectId();
  const location = getVertexLocation();

  if (!project) {
    throw new Error(
      "Missing Vertex project id (set GCP_PROJECT_ID or GOOGLE_PROJECT_ID)"
    );
  }

  vertexClient = new VertexAI({ project, location });
  return vertexClient;
}

function getVertexModel(modelName = DEFAULT_TEXT_MODEL) {
  const project = getVertexProjectId();
  const location = getVertexLocation();
  const key = `${project}:${location}:${modelName}`;
  if (modelCache.has(key)) return modelCache.get(key);

  const client = getVertexClient();
  const usePreview =
    process.env.VERTEX_USE_PREVIEW === "true" &&
    typeof client?.preview?.getGenerativeModel === "function";

  const model = usePreview
    ? client.preview.getGenerativeModel({ model: modelName })
    : client.getGenerativeModel({ model: modelName });

  modelCache.set(key, model);
  return model;
}

async function runVertexGenerate({
  systemPrompt,
  userPrompt,
  model,
  temperature = 0.1,
  responseMimeType,
  timeoutMs = 15000,
}) {
  const request = {
    contents: [{ role: "user", parts: [{ text: String(userPrompt || "") }] }],
    generationConfig: {
      temperature,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
    ...(systemPrompt
      ? { systemInstruction: { parts: [{ text: String(systemPrompt) }] } }
      : {}),
  };

  const result = await withTimeout(
    getVertexModel(model).generateContent(request),
    timeoutMs
  );
  return extractTextFromVertexResponse(result);
}

export async function generateTextWithVertex({
  systemPrompt,
  userPrompt,
  model = DEFAULT_TEXT_MODEL,
  temperature = 0.2,
  timeoutMs = 15000,
}) {
  return runVertexGenerate({
    systemPrompt,
    userPrompt,
    model,
    temperature,
    timeoutMs,
  });
}

export async function generateJsonWithVertex({
  systemPrompt,
  userPrompt,
  model = DEFAULT_TEXT_MODEL,
  temperature = 0.1,
  timeoutMs = 15000,
}) {
  const raw = await runVertexGenerate({
    systemPrompt,
    userPrompt,
    model,
    temperature,
    responseMimeType: "application/json",
    timeoutMs,
  });

  if (!raw) return null;

  try {
    return JSON.parse(normalizeJsonText(raw));
  } catch {
    return null;
  }
}

