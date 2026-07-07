# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Expert Park — a static, no-bundler 3D prototype (Three.js via CDN) of a first-person park where six expert residents stand around, expose their domain expertise through an inspector UI, and answer domain-specific questions via a Node HTTP server that proxies to Claude (primary) or OpenAI (fallback), with a local canned-response system when no API key is configured.

## Commands

```bash
npm run dev     # starts js server.mjs on http://127.0.0.1:4173 (reads .env / .env.local)
npm run check   # syntax-checks server.mjs, prompts/personas.js, js/api.js, js/experts.js, js/main.js via `node --check`
```

There is no build step, bundler, or test framework — `npm run check` (parse-only) is the only automated verification. Three.js is loaded from jsDelivr as an ES module, not installed locally.

Set `ANTHROPIC_API_KEY` (preferred) or `OPENAI_API_KEY` in `.env` to get live model answers; without either, the server falls back to canned local responses from each expert's `answerBank`.

## Architecture

**Server (`server.mjs`)** is a single dependency-light `http` server with no framework. It does three things:
- Serves static files, but renders `.html` files through a custom include preprocessor: `<!-- include: path.html -->` comments are recursively resolved relative to the including file (see `renderHtmlWithIncludes`). `index.html` includes `partials/hud.html`, which itself includes the other partials (`top-chrome`, `overview-drawer`, `resident-drawer`, `stack-drawer`, `inspector`, `bottom-bar`, `shortcuts-modal`, `lock-overlay`). Edit the partial, not a generated/merged file.
- Exposes `/api/config` (GET), `/api/chat` (POST, non-streaming), `/api/chat-stream` (POST, SSE) — the frontend prefers streaming.
- Picks provider via `getMode()`: `claudeKey` set → `"claude"`, else `openAiKey` set → `"openai"`, else `"local"`. Both chat handlers duplicate this branching for streaming vs. non-streaming — if you change provider logic, update both `handleChatStream`/`streamClaude`/`streamOpenAi` and `handleChat`.
- Scope-guards every question with `isQuestionInScope`/`isLikelyFollowUp` (`js/expert-response.js`) *before* calling any model, so off-topic questions never hit the API and instead get `buildOutOfScopeAnswer`.

**Persona/prompt system (`prompts/personas.js`)** builds the system prompt (`buildPersonaPrompt`) and user prompt (`buildUserPromptWithMemory`, last 6 turns of history) from an expert's data. `js/expert-response.js`'s `finalizeExpertAnswer` then post-processes raw model output: strips markdown/headings/preambles, collapses to ~2 short paragraphs or 1 paragraph + up to 3 bullets, and trims to a hard word limit — this keeps answers terse regardless of what the model returns. Changing the persona framework or answer shape means touching both files together.

**Expert data (`js/experts.js`)** is the single source of truth for all six residents: identity/appearance (for avatar generation), `bio`/`pros`/`bestFor` (for the inspector UI), `mission`/`knowledgePriorities`/`workflow`/`constraints` (for the system prompt), `answerBank` (keyword-matched local/fallback answers and scope detection), and `starterQuestions`/`ambientLines`. Adding a new expert means adding one object here — the scene, inspector, and prompt builder all read from this array.

**Frontend (`js/main.js`, ~2700+ lines, no framework)** owns the Three.js scene, first-person movement/collision, resident avatar construction and animation, and all HUD/inspector/chat DOM wiring in one file. Rough regions (see top-level function names): scene/world building (`buildScene`, `scatterTrees`, `addBenches`, etc.), chat flow (`handleExpertQuestion`, `createStreamingMessage`, `updateStreamText`), resident avatars (`createResidentAvatar`, `buildRobotArm`/`buildRobotLeg` — sleek robot characters whose leg chain is ground-true: boot soles land exactly at y=0), input/UI (`attachEvents`, drawer/inspector functions), and the render loop (`animate`, `updatePlayer`, `updateResidents`, `updateOverlayPositions`). `js/api.js` is the only bridge to the server (`getRuntimeConfig`, `askExpertQuestion`, `askExpertQuestionStream`).

**Frontend feature systems (all in `main.js`)**: day/night (`toggleNight`/`updateEnvironment` lerps every light/material registered in the module-level `environment` object; N key or the top-chrome Night button), minimap (`updateMinimap` redraws the `#minimap` canvas each frame), greeting waves (`resident.waveUntil` overrides the right-arm animation in `updateResidents`), and emoji emotes (`spawnEmote`/`updateEmotes`, canvas-texture sprites). Per-robot outfits come from each expert's `attire` key in `experts.js`, built by `addRobotAttire`. Note: module-level `const`s used by `animate()` must be declared before the `animate()` call near the top of the file (TDZ).

**Mobile handling**: `isTouchDevice` (matchMedia pointer check) in `main.js` switches the experience into an auto-tour camera mode instead of pointer-lock first-person controls, since Pointer Lock isn't usable on touch devices.

## Conventions

- Partials in `partials/*.html` are composed server-side only — there's no client-side templating; don't expect to find the merged HTML anywhere but in the server's response.
- The server explicitly blocks serving dotfiles and `server.mjs`/`package.json`/`README.md` directly (see `serveStatic`) — keep secrets and non-public files out of servable paths regardless.
- `.env` and `.env.local` are loaded manually via a hand-rolled parser (`loadEnvFile`) — no `dotenv` dependency.
