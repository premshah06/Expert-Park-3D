import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildOutOfScopeAnswer, finalizeExpertAnswer, isQuestionInScope } from "./js/expert-response.js";
import { experts } from "./js/experts.js";
import { buildPersonaPrompt, buildUserPromptWithMemory } from "./prompts/personas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;

loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));

const port = Number(process.env.PORT || 4173);
const openAiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const openAiKey = process.env.OPENAI_API_KEY || "";
const openAiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/api/config" && request.method === "GET") {
      return sendJson(response, 200, {
        mode: openAiKey ? "openai" : "local",
        model: openAiKey ? openAiModel : null
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      const body = await readJsonBody(request);
      return handleChat(body, response);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    return serveStatic(url.pathname, response, request.method === "HEAD");
  } catch (error) {
    return sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Expert Park server running on http://127.0.0.1:${port}`);
});

async function handleChat(body, response) {
  const expert = experts.find((item) => item.id === body?.expertId);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const history = Array.isArray(body?.history) ? body.history : [];

  if (!expert) {
    return sendJson(response, 404, { error: "Expert not found." });
  }

  if (!question) {
    return sendJson(response, 400, { error: "Question is required." });
  }

  if (!isQuestionInScope(expert, question) && !isLikelyFollowUp(question, history)) {
    return sendJson(response, 200, {
      answer: buildOutOfScopeAnswer(expert),
      model: openAiKey ? openAiModel : null,
      mode: openAiKey ? "openai" : "local"
    });
  }

  if (!openAiKey) {
    return sendJson(response, 503, {
      error: "OPENAI_API_KEY is not configured. Add it to .env or .env.local."
    });
  }

  const apiResponse = await fetch(`${openAiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: openAiModel,
      instructions: buildPersonaPrompt(expert),
      input: buildUserPromptWithMemory(expert, question, normalizeHistory(history)),
      max_output_tokens: 220
    })
  });

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    const errorMessage =
      payload?.error?.message || payload?.error || "OpenAI request failed.";
    return sendJson(response, apiResponse.status, { error: errorMessage });
  }

  const answer = finalizeExpertAnswer(extractOutputText(payload), expert);
  return sendJson(response, 200, {
    answer: answer || "No answer text returned by the model.",
    model: openAiModel,
    mode: "openai"
  });
}

async function serveStatic(urlPath, response, isHeadRequest) {
  const pathname = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const segments = safePath.split(path.sep).filter(Boolean);
  const blockedRootFiles = new Set(["server.mjs", "package.json", "README.md"]);

  if (segments.some((segment) => segment.startsWith(".")) || blockedRootFiles.has(segments[0])) {
    return sendJson(response, 404, { error: "File not found." });
  }

  let filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    return sendJson(response, 403, { error: "Forbidden." });
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    return sendJson(response, 404, { error: "File not found." });
  }

  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") {
    const html = renderHtmlWithIncludes(filePath);
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    if (isHeadRequest) {
      response.end();
      return;
    }

    response.end(html);
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) || "application/octet-stream"
  });

  if (isHeadRequest) {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) {
    return "";
  }

  const parts = [];
  payload.output.forEach((item) => {
    if (!Array.isArray(item?.content)) {
      return;
    }

    item.content.forEach((contentItem) => {
      if (typeof contentItem?.text === "string") {
        parts.push(contentItem.text);
      }
    });
  });

  return parts.join("\n").trim();
}

function renderHtmlWithIncludes(filePath, seen = new Set()) {
  if (seen.has(filePath)) {
    throw new Error(`Circular HTML include detected for ${filePath}`);
  }

  const nextSeen = new Set(seen);
  nextSeen.add(filePath);
  const source = readFileSync(filePath, "utf8");

  return source.replace(/<!--\s*include:\s*([^\s]+)\s*-->/g, (_, includePath) => {
    const resolvedPath = path.resolve(path.dirname(filePath), includePath);
    if (!resolvedPath.startsWith(rootDir) || !existsSync(resolvedPath)) {
      throw new Error(`Include file not found: ${includePath}`);
    }
    return renderHtmlWithIncludes(resolvedPath, nextSeen);
  });
}

function normalizeHistory(history) {
  return history
    .filter((entry) => entry && (entry.role === "user" || entry.role === "expert"))
    .map((entry) => ({
      role: entry.role,
      text: String(entry.text || "").trim()
    }))
    .filter((entry) => entry.text)
    .slice(-6);
}

function isLikelyFollowUp(question, history) {
  if (!history.length) {
    return false;
  }

  return /^(and|also|what about|how about|then|so|now|okay|can you|could you|why|tell me more|expand|go deeper)/i.test(
    question.trim()
  );
}
