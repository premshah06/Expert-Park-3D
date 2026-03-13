export async function getRuntimeConfig() {
  const response = await fetch("/api/config", {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Config request failed with ${response.status}`);
  }

  return response.json();
}

export async function askExpertQuestion(payload) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Chat request failed with ${response.status}`);
  }

  return data;
}
