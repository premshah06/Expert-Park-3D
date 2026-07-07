export async function getRuntimeConfig() {
  const response = await fetch("/api/config", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Config request failed with ${response.status}`);
  return response.json();
}

export async function askExpertQuestion(payload) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Chat request failed with ${response.status}`);
  return data;
}

export async function askExpertQuestionStream(payload, { onChunk, onDone, onError }) {
  let response;
  try {
    response = await fetch("/api/chat-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    onError(error instanceof Error ? error : new Error("Network error"));
    return;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    onError(new Error(data.error || `Stream failed with ${response.status}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const event = JSON.parse(json);
          if (event.type === "chunk" && event.text) {
            onChunk(event.text);
          } else if (event.type === "done") {
            onDone(event);
          } else if (event.type === "error") {
            onError(new Error(event.message || "Stream error"));
          }
        } catch {
          // ignore malformed SSE line
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error("Stream read error"));
  }
}
