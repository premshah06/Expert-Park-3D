# Expert Park

Expert Park is a static 3D prototype for the concept you described: a visually rich park where expert residents stand in-world, advertise their names above their heads, expose their domain expertise through expandable UI, and let users ask domain-specific questions.

## Project demo

<video src="./i.mp4" controls playsinline preload="metadata">
</video>

[Open the project demo video](./i.mp4)

## What is included

- A stylized 3D park scene built with Three.js loaded from a CDN
- Desktop first-person movement with mouse look, sprint, jump, and simple collision handling
- Six animated expert residents with floating labels and direct question flow
- An inspector panel that expands expertise, starter prompts, and a generated system prompt blueprint
- A local response system so the prototype can answer sample questions without a backend
- Mobile-safe auto-tour mode so the scene still renders and the UI remains usable on smaller devices

## Run it

1. Copy `.env.example` to `.env` if you want live OpenAI answers.
2. Put your API key into `OPENAI_API_KEY`.
3. Start the local server:

```bash
npm run dev
```

Then open `http://127.0.0.1:4173`.

## Files

- `index.html`: app shell and overlay markup
- `partials/*.html`: server-composed UI partials so the page structure is not kept in one large HTML file
- `styles.css`: visual direction, panel system, floating labels, responsive layout
- `server.mjs`: local HTTP server for static hosting and server-side OpenAI requests
- `js/experts.js`: expert definitions, prompt-building ingredients, local response bank
- `js/api.js`: browser-side API calls to the local server
- `js/main.js`: scene, movement, resident updates, overlays, and interactions
- `prompts/personas.js`: shared persona/prompt writing file that documents how each expert is personified

## Technologies used

- Three.js for the 3D scene, lighting, materials, geometry, and animation loop
- WebGL as the browser graphics layer underneath Three.js
- Vanilla JavaScript ES modules for scene logic, movement physics, resident behavior, and UI state
- HTML5 for the static app structure and canvas shell
- CSS3 for the premium interface styling, motion, and responsive layout
- Google Fonts for Fraunces and Sora typography
- jsDelivr CDN for loading the Three.js module without a bundler
- Pointer Lock API for desktop first-person camera control
- Clipboard API for copying prompt blueprints
- Fetch API for browser-to-localhost and localhost-to-OpenAI requests
- Node.js HTTP server for localhost hosting and OpenAI proxying
- `.env` files for OpenAI key, model, and port configuration
- Node.js and npm scripts for JavaScript validation

## Product direction

This prototype proves the core loop:

1. Enter a first-person 3D park.
2. Discover experts through labels and nearby visual guidance.
3. Inspect an expert profile.
4. Ask questions and reuse the generated prompt blueprint.

## Next upgrades

- Replace local answers with a real LLM backend per expert
- Add multiplayer networking so other users appear as live visitors
- Persist chat history and expert memory
- Add richer avatar animation and pathfinding
- Replace simple colliders with a real physics layer if you need more complex traversal
