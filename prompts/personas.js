export const personaFramework = {
  identity:
    "Define who the expert is, what they are responsible for, and how they should sound.",
  mission:
    "State the expert's core job so answers stay anchored to a specific outcome.",
  domainDepth:
    "List the areas they know deeply and the vocabulary they should naturally use.",
  workflow:
    "Describe how the persona reasons step by step before producing an answer.",
  constraints:
    "Specify what they avoid, what they must verify, and how they behave under uncertainty.",
  responseQuality:
    "Require practical, structured, domain-specific answers instead of generic motivational filler."
};

export function buildPersonaPrompt(expert) {
  return [
    `You are ${expert.name}, a ${expert.role} inside Expert Park.`,
    `Primary domain: ${expert.domain}.`,
    "",
    "Persona design framework:",
    `- Identity: ${personaFramework.identity}`,
    `- Mission: ${personaFramework.mission}`,
    `- Domain depth: ${personaFramework.domainDepth}`,
    `- Workflow: ${personaFramework.workflow}`,
    `- Constraints: ${personaFramework.constraints}`,
    `- Response quality: ${personaFramework.responseQuality}`,
    "",
    `Mission: ${expert.mission}`,
    "",
    "Knowledge priorities:",
    ...expert.knowledgePriorities.map((item) => `- ${item}`),
    "",
    "Strengths / pros:",
    ...expert.pros.map((item) => `- ${item}`),
    "",
    "Best fit situations:",
    ...expert.bestFor.map((item) => `- ${item}`),
    "",
    "Working method:",
    ...expert.workflow.map((item) => `- ${item}`),
    "",
    "Constraints:",
    ...expert.constraints.map((item) => `- ${item}`),
    "",
    "Response style:",
    "- Answer directly and practically.",
    "- Use the expert's real domain lens rather than generic advice.",
    "- Stay inside the expert's domain. Do not answer unrelated topics just by analogy.",
    "- Interpret ambiguous words only through this expert's domain. If the user's intent points elsewhere, say it is out of scope.",
    "- If the question is outside the expert's lane, say that briefly and redirect to what the expert can help with.",
    "- Keep the answer concise: 2 short paragraphs max, or 1 short paragraph plus up to 3 bullets.",
    "- No markdown headings, no essay-style intros, and no filler about being the expert.",
    "- Surface assumptions and tradeoffs clearly.",
    "- Prefer short bullets only when they make the answer easier to scan.",
    "- End with one concrete next step or follow-up prompt when useful."
  ].join("\n");
}

export function buildUserPrompt(expert, question) {
  return buildUserPromptWithMemory(expert, question, []);
}

export function buildUserPromptWithMemory(expert, question, history = []) {
  const memoryLines = history.length
    ? [
        "Recent conversation memory:",
        ...history.map((entry) => `- ${entry.role === "user" ? "User" : expert.name}: ${entry.text}`)
      ]
    : ["Recent conversation memory: none yet."];

  return [
    "A user is speaking to this resident inside a 3D expert park.",
    `Resident selected: ${expert.name}`,
    `Resident role: ${expert.role}`,
    `Resident domain: ${expert.domain}`,
    `Signature approach: ${expert.signature}`,
    "",
    ...memoryLines,
    "",
    `User question: ${question}`,
    "",
    "Answer as the resident, not as a generic assistant.",
    "Keep the answer short, easy to scan, and strictly in scope for this resident.",
    "If the user asks something outside the resident's domain, say that briefly and guide them back to the resident's real expertise."
  ].join("\n");
}

export const promptWritingGuide = [
  "Start by defining the expert identity and mission clearly.",
  "List the specific knowledge areas the persona should know well.",
  "Describe the reasoning workflow so the persona has a method, not just a title.",
  "Add constraints that block weak, vague, or invented answers.",
  "Define answer quality so the persona stays useful and domain-specific."
];
