# Expert Park

Expert Park is a 3D world you walk through in first person. Six robot residents
live in a park, each with their own domain of expertise. Walk up to one, it
turns and waves, and you can ask it a question and get a real, in-character
answer streamed back to you, powered by Claude (or OpenAI, or a local
fallback if you don't have an API key).

There's no game engine and no frontend framework here. It's vanilla
JavaScript, Three.js loaded straight from a CDN, and a small hand-rolled Node
HTTP server. The point was to see how far you can get with the platform
itself before reaching for tools.

## Demo

<video src="./docs/media/expert-park-demo.mp4" controls playsinline muted width="100%">
  Your browser doesn't support inline video. <a href="./docs/media/expert-park-demo.mp4">Download the demo</a> instead.
</video>

*(GitHub renders this inline once it's pushed. If you're viewing this on a
mirror that doesn't support it, [open the video directly](./docs/media/expert-park-demo.mp4).)*

## What it actually does

- **Walk around in first person.** WASD movement, mouse look, sprint, jump,
  and collision against trees, benches, and the fountain.
- **Six robot residents**, each visually distinct (different outfits: a
  cape and crown, a beret and scarf, a hard hat, a mortarboard and glasses,
  and so on) and each an expert in one narrow domain.
- **Ask them questions.** Get near a resident, press `Q`, and type. If Claude
  or OpenAI is configured, the answer streams in token by token. If not, a
  local canned-response bank still answers reasonably.
- **They only know their own domain.** Ask the motion-physics robot about
  cooking and it will tell you, in character, that's not its lane.
- **Day and night cycle.** Press `N` and every light, the sky shader, the fog,
  and the tone mapping smoothly cross-fade between daylight and a starlit
  night with glowing lanterns.
- **A live minimap**, drawn on canvas every frame, showing your position and
  all six residents as colored dots.
- **Greeting behavior.** Get close to a robot and it stops wandering, turns
  to face you, and waves, with a floating emoji reaction.

## Why this exists

I wanted to answer two questions for myself: how do you make an LLM actually
stay in character and on-topic across an entire app with multiple personas,
and how far can you push vanilla three.js and CSS before you start missing a
framework. This repo is the answer to both.

## The prompt engineering

This is the part I spent the most time on, so here's the actual pipeline,
not just the marketing version.

### 1. Each expert is data, not a hardcoded prompt

Every resident is one object in [`js/experts.js`](js/experts.js) with fields
like `mission`, `knowledgePriorities`, `workflow`, `constraints`, `pros`, and
`bestFor`. There is no prompt text written by hand for each robot. Instead,
[`prompts/personas.js`](prompts/personas.js) has one function,
`buildPersonaPrompt(expert)`, that takes any expert object and compiles it
into a full system prompt: identity, mission, domain knowledge, a step-by-step
working method, hard constraints, and explicit response-style rules (answer
length, no markdown headings, no filler, stay in the expert's lane).

Adding a seventh expert to the park means adding one object to a data file.
The prompt-building logic never changes.

### 2. A scope guard runs before the model ever sees the question

Before any question reaches Claude or OpenAI,
[`isQuestionInScope`](js/expert-response.js) checks whether the question
actually belongs to that resident's declared domain, using the expert's own
knowledge-priority terms plus some follow-up detection (so "why?" or "what
about performance?" right after a relevant answer still counts as in-scope).

If a question is off-topic, `buildOutOfScopeAnswer` returns a short,
in-character redirect immediately, with zero tokens spent on the model. This
is both a UX choice (residents stay believable and don't wander off-topic)
and a cost/latency optimization.

### 3. Model output gets reshaped, not trusted as-is

LLMs don't reliably respect "keep it short" or "no markdown" instructions
under all conditions, so raw output never gets shown directly.
[`finalizeExpertAnswer`](js/expert-response.js) strips markdown and headings,
removes preambles like "As an AI..." or "Sure, here's...", collapses the
response to roughly two short paragraphs or one paragraph plus up to three
bullets, and enforces a hard word limit. Every resident sounds terse and
consistent regardless of what the underlying model actually returned.

### 4. Conversation memory, per resident

Each resident keeps a rolling window of its last 6 conversation turns
(`buildUserPromptWithMemory` in `prompts/personas.js`), so follow-up
questions like "how would that work with a smaller team?" resolve correctly
against what was already discussed, without carrying the entire chat history
forward on every request.

### 5. Provider fallback is decided once, cleanly

[`server.mjs`](server.mjs) picks a mode with one function, `getMode()`:
Claude if `ANTHROPIC_API_KEY` is set, otherwise OpenAI if `OPENAI_API_KEY` is
set, otherwise `local`, which answers from each expert's own `answerBank`
instead of calling any API. The whole app works with zero API keys
configured; it just gets smarter as you add them.

## The frontend engineering

- **Procedural robot characters.** Every resident is built from primitive
  Three.js geometry (capsules, spheres, torus joints) rather than an
  imported 3D model. Joints overlap deliberately so there's never a gap at
  the ankles, elbows, or knees, and each robot gets a small themed attire kit
  (cape, beret, hard hat, mortarboard, and so on) built from the same shared
  materials, keyed off an `attire` field per expert.
- **A believable walk cycle.** Counter-swinging arms and legs, a double-
  frequency body bounce, hip sway, and layered sine-wave idle head movement
  so residents never look like they're playing the exact same idle loop.
- **Day/night as one system.** A single `nightMix` value, eased toward a
  target, drives every light's intensity and color, the sky shader
  uniforms, fog color and density, tone-mapping exposure, lantern glow, and
  firefly opacity, all from one place ([`updateEnvironment`](js/main.js)).
- **A dark-glass HUD**, restyled from a light "paper" theme to a translucent,
  blurred, dark design system, including drawers, an inspector panel with
  tabs, streaming chat bubbles, and a keyboard shortcuts modal.
- **Canvas minimap** and **emoji sprite emotes**, both built directly on the
  Canvas 2D API and Three.js `Sprite`/`CanvasTexture`, no extra libraries.
- **No bundler, no build step.** `npm run check` just runs `node --check` on
  every JS file. Three.js is imported as an ES module straight from jsDelivr.

## Running it locally

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:4173`.

By default, with no API key configured, the app runs fully offline using
each expert's local answer bank. To get live streamed answers:

1. Copy `.env.example` to `.env`.
2. Add `ANTHROPIC_API_KEY` (preferred) or `OPENAI_API_KEY`.
3. Restart `npm run dev`.

## Project structure

- `server.mjs`: the whole backend. Static file serving with a custom
  `<!-- include: file.html -->` preprocessor for partials, plus
  `/api/config`, `/api/chat`, and `/api/chat-stream` (SSE).
- `js/experts.js`: the single source of truth for all six residents,
  identity, appearance, attire, prompt-building data, and local answers.
- `prompts/personas.js`: turns any expert object into a system prompt and a
  memory-aware user prompt.
- `js/expert-response.js`: the scope guard and the answer-shaping pipeline.
- `js/main.js`: the Three.js scene, movement, robot construction and
  animation, day/night system, minimap, emotes, and all HUD wiring.
- `js/api.js`: the only bridge between the browser and the server.
- `partials/*.html`: server-composed UI fragments, assembled by
  `server.mjs` at request time.

## Stack

Three.js, WebGL, vanilla JavaScript ES modules, HTML5, CSS3, and a
dependency-light Node `http` server. `@anthropic-ai/sdk` is the only real
npm dependency.
