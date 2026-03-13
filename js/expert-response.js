const STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "are",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "me",
  "my",
  "of",
  "on",
  "or",
  "our",
  "should",
  "so",
  "that",
  "the",
  "their",
  "them",
  "this",
  "to",
  "use",
  "what",
  "when",
  "where",
  "which",
  "with",
  "you",
  "your"
]);

export function isQuestionInScope(expert, question) {
  const normalizedQuestion = String(question || "").toLowerCase();
  const questionTokens = tokenize(normalizedQuestion);
  if (!questionTokens.length) {
    return true;
  }

  let score = 0;
  expert.answerBank.forEach((entry) => {
    entry.keywords.forEach((keyword) => {
      if (normalizedQuestion.includes(keyword.toLowerCase())) {
        score += 3;
      }
    });
  });

  const scopeTerms = collectScopeTerms(expert);
  questionTokens.forEach((token) => {
    if (scopeTerms.has(token)) {
      score += 1;
    }
  });

  return score > 0;
}

export function buildOutOfScopeAnswer(expert) {
  const topics = [...new Set([...expert.bestFor, ...expert.expertise])]
    .slice(0, 3)
    .map((item) => item.toLowerCase());

  return [
    "That is outside my core lane.",
    `Ask me about ${joinNaturalLanguage(topics)} instead.`,
    `If you want, reframe it through ${expert.domain.toLowerCase()} and I will keep it practical.`
  ].join(" ");
}

export function finalizeExpertAnswer(rawText, expert) {
  let text = String(rawText || "")
    .replace(/\r/g, "")
    .trim();

  if (!text) {
    return buildOutOfScopeAnswer(expert);
  }

  text = text
    .replace(/^As [^:]{0,220}:\s*/i, "")
    .replace(/^As [^.?!]{0,220}[.?!]\s*/i, "")
    .replace(/^Here(?:'s| is) (?:a )?(?:concise )?(?:answer|approach)[^:]*:\s*/i, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\d+\.\s+/gm, "- ")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\s+/g, " "))
    .map((line) => normalizeGuideLine(line))
    .filter(Boolean);

  if (!lines.length) {
    return buildOutOfScopeAnswer(expert);
  }

  const paragraphs = lines.filter((line) => !line.startsWith("- "));
  const bullets = lines.filter((line) => line.startsWith("- "));
  const finalLines = [];

  if (paragraphs.length) {
    finalLines.push(limitSentenceCount(paragraphs[0], 2));
  }

  bullets.slice(0, 3).forEach((line) => {
    finalLines.push(limitSentenceCount(line, 1));
  });

  if (paragraphs.length > 1 && finalLines.length < 4) {
    finalLines.push(limitSentenceCount(paragraphs[1], 1));
  }

  const compact = trimToWordLimit(finalLines.join("\n"), 110);
  return compact || buildOutOfScopeAnswer(expert);
}

function collectScopeTerms(expert) {
  const terms = new Set();
  [
    expert.name,
    expert.role,
    expert.domain,
    expert.signal,
    ...expert.bestFor,
    ...expert.expertise,
    ...expert.knowledgePriorities,
    ...expert.answerBank.flatMap((entry) => entry.keywords)
  ].forEach((value) => {
    tokenize(value).forEach((token) => {
      terms.add(token);
    });
  });
  return terms;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? [];
}

function joinNaturalLanguage(items) {
  if (items.length <= 1) {
    return items[0] || "my main topics";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function normalizeGuideLine(line) {
  const plain = line.replace(/^-\s*/, "").trim().toLowerCase();
  if (
    /^(steps?|key steps?|next steps?|assumptions?( and tradeoffs?)?|tradeoffs?|follow-?up|short answer)$/i.test(
      plain
    )
  ) {
    return "";
  }

  return line;
}

function limitSentenceCount(text, maxSentences) {
  if (maxSentences < 1) {
    return "";
  }

  const bulletPrefix = text.startsWith("- ") ? "- " : "";
  const content = bulletPrefix ? text.slice(2) : text;
  const sentences = content.match(/[^.!?]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (!sentences.length) {
    return text;
  }

  return `${bulletPrefix}${sentences.slice(0, maxSentences).join(" ").trim()}`;
}

function trimToWordLimit(text, maxWords) {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) {
    return text.trim();
  }

  const shortened = words.slice(0, maxWords).join(" ");
  return `${shortened.replace(/[,:;.-]+$/, "").trim()}…`;
}
