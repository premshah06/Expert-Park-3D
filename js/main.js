import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { askExpertQuestion, getRuntimeConfig } from "./api.js";
import { buildOutOfScopeAnswer, finalizeExpertAnswer, isQuestionInScope } from "./expert-response.js";
import { experts, technologyStack } from "./experts.js";
import { buildPersonaPrompt } from "../prompts/personas.js";

const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
const worldRadius = 29;
const playerRadius = 0.8;
const playerHeight = 1.72;
const gravity = 24;
const walkSpeed = 5.6;
const sprintSpeed = 9.1;
const groundAcceleration = 34;
const airAcceleration = 10;
const friction = 12;
const airDrag = 0.6;
const jumpVelocity = 8.1;
const jumpBufferDuration = 0.16;
const coyoteDuration = 0.12;
const interactionRadius = 4.1;
const bubbleVisibilityDistance = 18;
const obstacleCircles = [
  { x: -7.8, z: 4.6, radius: 4.4 },
  { x: 10.8, z: -7.4, radius: 3.2 },
  { x: 0, z: 0, radius: 3.1 }
];
const skyTopBase = new THREE.Color("#5f93c8");
const skyTopLift = new THREE.Color("#88b4d8");
const skyHorizonBase = new THREE.Color("#e8efe3");
const skyHorizonGlow = new THREE.Color("#fff0d2");
const skyGlowBase = new THREE.Color("#f3c78b");
const skyGlowLift = new THREE.Color("#ffd7a6");

const state = {
  pointerLocked: false,
  hasEnteredPark: false,
  openDrawer: null,
  yaw: Math.PI,
  pitch: 0,
  roll: 0,
  keys: new Set(),
  selectedId: null,
  nearbyId: null,
  inspectorTab: "info",
  residentQuery: "",
  residentSignal: "all",
  autoTourAngle: 0.1,
  currentTime: 0,
  chatHistory: new Map(),
  sky: {
    dome: null,
    material: null,
    clouds: []
  },
  runtime: {
    mode: "local",
    model: null
  },
  player: {
    position: new THREE.Vector3(0, 0, 18),
    velocity: new THREE.Vector3(),
    verticalVelocity: 0,
    grounded: true,
    walkCycle: 0,
    jumpBufferTime: 0,
    coyoteTime: coyoteDuration,
    landingImpact: 0
  }
};

const canvas = document.getElementById("scene");
const labelsLayer = document.getElementById("labels-layer");
const overviewDrawer = document.getElementById("overview-drawer");
const residentDrawer = document.getElementById("resident-drawer");
const stackDrawer = document.getElementById("stack-drawer");
const menuOverviewButton = document.getElementById("menu-overview");
const menuResidentsButton = document.getElementById("menu-residents");
const menuStackButton = document.getElementById("menu-stack");
const stackList = document.getElementById("stack-list");
const expertList = document.getElementById("expert-list");
const residentSearchInput = document.getElementById("resident-search");
const residentFilterChips = document.getElementById("resident-filter-chips");
const residentEmptyState = document.getElementById("resident-empty");
const focusName = document.getElementById("focus-name");
const focusDomain = document.getElementById("focus-domain");
const statusPill = document.getElementById("status-pill");
const instructionTail = document.getElementById("instruction-tail");
const shortcutsButton = document.getElementById("shortcuts-button");
const inspector = document.getElementById("inspector");
const inspectorEmblem = document.getElementById("inspector-emblem");
const inspectorDomain = document.getElementById("inspector-domain");
const inspectorName = document.getElementById("inspector-name");
const inspectorRole = document.getElementById("inspector-role");
const infoSignal = document.getElementById("info-signal");
const infoDomain = document.getElementById("info-domain");
const infoPrimarySkill = document.getElementById("info-primary-skill");
const profilePresence = document.getElementById("profile-presence");
const inspectorDistance = document.getElementById("inspector-distance");
const inspectorBio = document.getElementById("inspector-bio");
const prosGrid = document.getElementById("pros-grid");
const signatureLine = document.getElementById("signature-line");
const bestFit = document.getElementById("best-fit");
const expertiseChips = document.getElementById("expertise-chips");
const starterQuestions = document.getElementById("starter-questions");
const conversationFeed = document.getElementById("conversation-feed");
const runtimeStatus = document.getElementById("runtime-status");
const qaGuidance = document.getElementById("qa-guidance");
const promptPreview = document.getElementById("prompt-preview");
const copyPromptButton = document.getElementById("copy-prompt");
const panelCloseButton = document.getElementById("panel-close");
const focusChatButton = document.getElementById("focus-chat-button");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const unlockButton = document.getElementById("unlock-button");
const shortcutsModal = document.getElementById("shortcuts-modal");
const shortcutsBackdrop = document.getElementById("shortcuts-backdrop");
const shortcutsCloseButton = document.getElementById("shortcuts-close");
const lockOverlay = document.getElementById("lock-overlay");
const overlayButton = document.getElementById("overlay-button");
const inspectorTabs = Array.from(document.querySelectorAll("[data-inspector-tab]"));
const inspectorPanels = Array.from(document.querySelectorAll("[data-inspector-panel]"));

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#c8deea");
scene.fog = new THREE.Fog("#d9e7df", 22, 86);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 120);
camera.rotation.order = "YXZ";

const clock = new THREE.Clock();
const cameraForward = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const npcMap = new Map();

if (isTouchDevice) {
  lockOverlay.classList.add("hidden");
  unlockButton.textContent = "Auto-tour active";
  statusPill.textContent = "Mobile preview mode is active.";
  instructionTail.textContent = "Tap a resident marker to open the profile, then use the ask field for questions.";
  document.body.classList.remove("locked");
}

buildScene();
buildResidents();
buildResidentFilters();
buildTechnologyStack();
syncSelection(null);
attachEvents();
void loadRuntimeConfig();
animate();

function buildScene() {
  addSkyBackdrop();

  const hemiLight = new THREE.HemisphereLight("#f8ffe6", "#6e9875", 1.1);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight("#fff4d0", 2.5);
  sun.position.set(18, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.00025;
  scene.add(sun);

  const parkBase = new THREE.Mesh(
    new THREE.CylinderGeometry(worldRadius, worldRadius, 0.5, 80),
    new THREE.MeshStandardMaterial({ color: "#6f9f67", roughness: 0.95 })
  );
  parkBase.position.y = -0.3;
  parkBase.receiveShadow = true;
  scene.add(parkBase);

  const grassDisk = new THREE.Mesh(
    new THREE.CircleGeometry(worldRadius - 0.2, 80),
    new THREE.MeshStandardMaterial({ color: "#7faf76", roughness: 1 })
  );
  grassDisk.rotation.x = -Math.PI / 2;
  grassDisk.receiveShadow = true;
  scene.add(grassDisk);

  const ringPath = new THREE.Mesh(
    new THREE.RingGeometry(12, 16.4, 80),
    new THREE.MeshStandardMaterial({ color: "#d7c29a", roughness: 1, side: THREE.DoubleSide })
  );
  ringPath.rotation.x = -Math.PI / 2;
  ringPath.position.y = 0.01;
  scene.add(ringPath);

  addPathStrip(0, 0, 0, 22, 2.5);
  addPathStrip(0, 0, Math.PI / 2, 22, 2.4);
  addPathStrip(8.6, -8.4, Math.PI / 4, 12, 2.1);
  addPathStrip(-8.6, 8.4, Math.PI / 4, 12, 2.1);

  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 3.2, 0.85, 40),
    new THREE.MeshStandardMaterial({ color: "#efe5d2", roughness: 0.8 })
  );
  fountainBase.position.y = 0.42;
  fountainBase.castShadow = true;
  fountainBase.receiveShadow = true;
  scene.add(fountainBase);

  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.45, 0.24, 36),
    new THREE.MeshPhysicalMaterial({
      color: "#7fc4c5",
      roughness: 0.1,
      transmission: 0.25,
      clearcoat: 0.9
    })
  );
  fountainWater.position.y = 0.88;
  scene.add(fountainWater);

  const fountainGlow = new THREE.PointLight("#d9f9ff", 2.4, 12, 2.2);
  fountainGlow.position.set(0, 2.5, 0);
  scene.add(fountainGlow);

  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.6, 0.5, 42),
    new THREE.MeshStandardMaterial({ color: "#a8d8d5", roughness: 0.18, metalness: 0.04 })
  );
  pond.position.set(-7.8, 0.15, 4.6);
  pond.receiveShadow = true;
  scene.add(pond);

  const flowerBed = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.2, 0.35, 30),
    new THREE.MeshStandardMaterial({ color: "#c9977c", roughness: 0.95 })
  );
  flowerBed.position.set(10.8, 0.06, -7.4);
  flowerBed.receiveShadow = true;
  scene.add(flowerBed);

  scatterFlowers();
  scatterTrees();
  scatterShrubs();
  addBenches();
  addGardenChairs();
  addLanterns();
  addPergola();
  addFireflies();
}

function addSkyBackdrop() {
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color("#5f93c8") },
      horizonColor: { value: new THREE.Color("#e8efe3") },
      glowColor: { value: new THREE.Color("#f3c78b") }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 glowColor;
      varying vec3 vWorldPosition;

      void main() {
        float heightMix = normalize(vWorldPosition + vec3(0.0, 18.0, 0.0)).y * 0.5 + 0.5;
        vec3 sky = mix(horizonColor, topColor, smoothstep(0.04, 0.95, heightMix));
        float warmHalo = pow(1.0 - clamp(heightMix, 0.0, 1.0), 3.0);
        sky += glowColor * warmHalo * 0.42;
        gl_FragColor = vec4(sky, 1.0);
      }
    `
  });

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(110, 32, 24),
    skyMaterial
  );
  scene.add(skyDome);
  state.sky.dome = skyDome;
  state.sky.material = skyMaterial;

  const horizonGroup = new THREE.Group();
  const mountainMaterial = new THREE.MeshStandardMaterial({
    color: "#7b9790",
    roughness: 0.98,
    transparent: true,
    opacity: 0.92
  });

  for (let index = 0; index < 18; index += 1) {
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(2.8 + Math.random() * 3.2, 10 + Math.random() * 8, 6),
      mountainMaterial
    );
    const angle = (index / 18) * Math.PI * 2;
    const radius = 38 + Math.random() * 5;
    mountain.position.set(Math.cos(angle) * radius, 3.8, Math.sin(angle) * radius);
    mountain.rotation.y = Math.random() * Math.PI;
    horizonGroup.add(mountain);
  }

  scene.add(horizonGroup);

  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: "#f7f2eb",
    transparent: true,
    opacity: 0.26,
    roughness: 1,
    depthWrite: false
  });

  for (let index = 0; index < 11; index += 1) {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 2);
    for (let puffIndex = 0; puffIndex < puffCount; puffIndex += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 0.7, 10, 10),
        cloudMaterial
      );
      puff.position.set(
        (puffIndex - (puffCount - 1) / 2) * 1.3,
        Math.random() * 0.4,
        (Math.random() - 0.5) * 0.7
      );
      puff.scale.set(1.6, 0.72 + Math.random() * 0.12, 1);
      cloud.add(puff);
    }

    const anchor = {
      group: cloud,
      angle: Math.random() * Math.PI * 2,
      radius: 24 + Math.random() * 11,
      height: 16 + Math.random() * 8,
      speed: 0.02 + Math.random() * 0.035
    };
    state.sky.clouds.push(anchor);
    scene.add(cloud);
  }
}

function updateSkyBackdrop() {
  if (!state.sky.material) {
    return;
  }

  const topColor = state.sky.material.uniforms.topColor.value;
  const horizonColor = state.sky.material.uniforms.horizonColor.value;
  const glowColor = state.sky.material.uniforms.glowColor.value;
  const daylight = Math.sin(state.currentTime * 0.05) * 0.5 + 0.5;
  const horizonWarmth = Math.sin(state.currentTime * 0.08 + 0.9) * 0.5 + 0.5;

  topColor.copy(skyTopBase).lerp(skyTopLift, daylight * 0.58);
  horizonColor.copy(skyHorizonBase).lerp(skyHorizonGlow, horizonWarmth * 0.48);
  glowColor.copy(skyGlowBase).lerp(skyGlowLift, horizonWarmth * 0.4);

  if (state.sky.dome) {
    state.sky.dome.position.copy(state.player.position);
  }

  state.sky.clouds.forEach((cloud) => {
    const drift = state.currentTime * cloud.speed + cloud.angle;
    cloud.group.position.set(
      Math.cos(drift) * cloud.radius,
      cloud.height + Math.sin(drift * 1.7) * 0.4,
      Math.sin(drift) * cloud.radius
    );
    cloud.group.rotation.y = -drift;
  });
}

function addPathStrip(x, z, rotationY, length, width) {
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.06, length),
    new THREE.MeshStandardMaterial({ color: "#d7c29a", roughness: 1 })
  );
  strip.position.set(x, 0.03, z);
  strip.rotation.y = rotationY;
  strip.receiveShadow = true;
  scene.add(strip);
}

function scatterTrees() {
  const treePositions = [
    [-21, -6, 1.2],
    [-18, 13, 1.1],
    [21, 8, 1.18],
    [19, -15, 1.34],
    [3, -23, 1.1],
    [-4, 24, 1.26],
    [-24, 4, 1.08],
    [24, 1, 1.16],
    [-13, -21, 1.12],
    [14, 20, 1.15],
    [-18, -16, 1.08],
    [8, 24, 1.06]
  ];

  treePositions.forEach(([x, z, scale]) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38 * scale, 0.52 * scale, 3.8 * scale, 8),
      new THREE.MeshStandardMaterial({ color: "#7d5b3f", roughness: 1 })
    );
    trunk.position.y = 1.9 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    const leafColors = ["#93ba7f", "#7ea767", "#a5c77f"];
    [
      { y: 4.5, r: 1.8 },
      { y: 5.8, r: 1.5 },
      { y: 6.8, r: 1.1 }
    ].forEach((layer, index) => {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(layer.r * scale, 2.6 * scale, 7),
        new THREE.MeshStandardMaterial({ color: leafColors[index], roughness: 1 })
      );
      crown.position.y = layer.y * scale;
      tree.add(crown);
    });

    tree.position.set(x, 0, z);
    scene.add(tree);
  });
}

function scatterFlowers() {
  const patchGeometry = new THREE.BufferGeometry();
  const count = 320;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = ["#ffe28e", "#ff9e73", "#fff5cf", "#dda9b4", "#bcdb7b"];
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 4.5 + Math.random() * 21;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0.08;
    positions[index * 3 + 2] = Math.sin(angle) * radius;

    color.set(palette[index % palette.length]);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  patchGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  patchGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const petals = new THREE.Points(
    patchGeometry,
    new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.78 })
  );
  scene.add(petals);
}

function scatterShrubs() {
  const shrubPositions = [
    [-5.2, -18.2, 0.9],
    [6.4, -17.8, 1.1],
    [17.8, -3.8, 1],
    [-18.4, 2.5, 1.05],
    [15.5, 15.6, 0.9],
    [-15.7, 14.2, 1.1],
    [-21.2, -10.4, 0.95],
    [21.4, 10.2, 1]
  ];

  shrubPositions.forEach(([x, z, scale]) => {
    const shrub = new THREE.Group();
    const colors = ["#7ea767", "#93ba7f", "#6e965e"];

    colors.forEach((color, index) => {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry((0.55 - index * 0.08) * scale, 8, 8),
        new THREE.MeshStandardMaterial({ color, roughness: 1 })
      );
      blob.position.set((index - 1) * 0.38 * scale, 0.45 + index * 0.05, (Math.abs(index - 1) * 0.12) * scale);
      blob.scale.set(1.15, 0.9, 1);
      shrub.add(blob);
    });

    shrub.position.set(x, 0, z);
    scene.add(shrub);
  });
}

function addBenches() {
  const benchPositions = [
    [6.4, -12.8, Math.PI * 0.12],
    [-13.2, -4.5, -Math.PI / 2.2],
    [-7.4, 13.2, Math.PI * 0.64],
    [13.1, 5.8, Math.PI * 0.3]
  ];

  benchPositions.forEach(([x, z, rotationY]) => {
    const bench = new THREE.Group();

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.18, 0.75),
      new THREE.MeshStandardMaterial({ color: "#7e5f42", roughness: 0.8 })
    );
    seat.position.y = 0.7;
    seat.castShadow = true;
    bench.add(seat);

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.18, 0.7),
      new THREE.MeshStandardMaterial({ color: "#8b694a", roughness: 0.8 })
    );
    back.position.set(0, 1.2, -0.28);
    back.rotation.x = -0.22;
    back.castShadow = true;
    bench.add(back);

    [
      [-0.95, 0.32],
      [0.95, 0.32],
      [-0.95, -0.32],
      [0.95, -0.32]
    ].forEach(([px, pz]) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.7, 0.12),
        new THREE.MeshStandardMaterial({ color: "#4f4b46", roughness: 1 })
      );
      leg.position.set(px, 0.34, pz);
      leg.castShadow = true;
      bench.add(leg);
    });

    bench.position.set(x, 0, z);
    bench.rotation.y = rotationY;
    scene.add(bench);
  });
}

function addGardenChairs() {
  const chairSets = [
    { x: 5.8, z: 6.8, rotation: Math.PI * 0.2 },
    { x: -5.4, z: -7.2, rotation: -Math.PI * 0.24 },
    { x: 0, z: 10.8, rotation: Math.PI }
  ];

  chairSets.forEach(({ x, z, rotation }) => {
    const set = new THREE.Group();
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.72, 0.08, 18),
      new THREE.MeshStandardMaterial({ color: "#eadbc4", roughness: 0.74 })
    );
    table.position.y = 0.78;
    table.castShadow = true;
    set.add(table);

    const tableStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.74, 12),
      new THREE.MeshStandardMaterial({ color: "#6b655d", roughness: 0.92 })
    );
    tableStem.position.y = 0.4;
    tableStem.castShadow = true;
    set.add(tableStem);

    [
      { angle: Math.PI * 0.12, tilt: -0.18 },
      { angle: Math.PI * 1.08, tilt: 0.2 }
    ].forEach(({ angle, tilt }) => {
      const chair = new THREE.Group();

      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.08, 0.52),
        new THREE.MeshStandardMaterial({ color: "#8f6d4d", roughness: 0.84 })
      );
      seat.position.y = 0.46;
      seat.castShadow = true;
      chair.add(seat);

      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.5, 0.08),
        new THREE.MeshStandardMaterial({ color: "#9b7856", roughness: 0.84 })
      );
      back.position.set(0, 0.72, -0.22);
      back.rotation.x = tilt;
      back.castShadow = true;
      chair.add(back);

      [
        [-0.2, -0.2],
        [0.2, -0.2],
        [-0.2, 0.2],
        [0.2, 0.2]
      ].forEach(([px, pz]) => {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.04, 0.46, 8),
          new THREE.MeshStandardMaterial({ color: "#52473f", roughness: 1 })
        );
        leg.position.set(px, 0.21, pz);
        leg.castShadow = true;
        chair.add(leg);
      });

      chair.position.set(Math.cos(angle) * 1.18, 0, Math.sin(angle) * 1.18);
      chair.rotation.y = angle + Math.PI;
      set.add(chair);
    });

    set.position.set(x, 0, z);
    set.rotation.y = rotation;
    scene.add(set);
  });
}

function addLanterns() {
  const lanternPositions = [
    [4.5, -4.5],
    [-4.8, 4.8],
    [13.4, 12.2],
    [-15.6, -11.4]
  ];

  lanternPositions.forEach(([x, z]) => {
    const lantern = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.15, 4.4, 10),
      new THREE.MeshStandardMaterial({ color: "#4b4f4f", roughness: 0.9 })
    );
    pole.position.y = 2.2;
    pole.castShadow = true;
    lantern.add(pole);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 10),
      new THREE.MeshStandardMaterial({
        color: "#fff0c8",
        emissive: "#f8c56b",
        emissiveIntensity: 1.6
      })
    );
    bulb.position.y = 4.2;
    lantern.add(bulb);

    const glow = new THREE.PointLight("#ffd898", 1.4, 10, 2.4);
    glow.position.y = 4.2;
    lantern.add(glow);

    lantern.position.set(x, 0, z);
    scene.add(lantern);
  });
}

function addPergola() {
  const pergola = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6.2, 0.25, 40),
    new THREE.MeshStandardMaterial({ color: "#efe3cc", roughness: 0.9 })
  );
  floor.position.y = 0.12;
  floor.receiveShadow = true;
  pergola.add(floor);

  [
    [3.8, 3.8],
    [-3.8, 3.8],
    [3.8, -3.8],
    [-3.8, -3.8]
  ].forEach(([x, z]) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 3.4, 12),
      new THREE.MeshStandardMaterial({ color: "#c6ab86", roughness: 0.95 })
    );
    post.position.set(x, 1.7, z);
    post.castShadow = true;
    pergola.add(post);
  });

  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(4.8, 5.4, 0.35, 30),
    new THREE.MeshStandardMaterial({ color: "#b88d6f", roughness: 0.82 })
  );
  roof.position.y = 3.55;
  roof.castShadow = true;
  pergola.add(roof);

  scene.add(pergola);
}

function addFireflies() {
  const geometry = new THREE.BufferGeometry();
  const count = 110;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 3 + Math.random() * 26;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 0.9 + Math.random() * 5.6;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particleMap = createSoftParticleTexture();

  const sparks = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: "#fff4c7",
      size: 0.22,
      map: particleMap,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      alphaTest: 0.06,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(sparks);
}

function createSoftParticleTexture() {
  const canvasTextureSize = 64;
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = canvasTextureSize;
  textureCanvas.height = canvasTextureSize;
  const context2d = textureCanvas.getContext("2d");
  if (!context2d) {
    return null;
  }

  const gradient = context2d.createRadialGradient(
    canvasTextureSize * 0.5,
    canvasTextureSize * 0.5,
    4,
    canvasTextureSize * 0.5,
    canvasTextureSize * 0.5,
    canvasTextureSize * 0.5
  );
  gradient.addColorStop(0, "rgba(255, 248, 216, 0.95)");
  gradient.addColorStop(0.36, "rgba(255, 244, 190, 0.52)");
  gradient.addColorStop(1, "rgba(255, 244, 190, 0)");
  context2d.fillStyle = gradient;
  context2d.fillRect(0, 0, canvasTextureSize, canvasTextureSize);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.needsUpdate = true;
  return texture;
}

function buildTechnologyStack() {
  stackList.replaceChildren();
  technologyStack.forEach((item) => {
    const card = document.createElement("article");
    card.className = "stack-card";
    card.innerHTML = `
      <span class="stack-category">${item.category}</span>
      <strong class="stack-name">${item.name}</strong>
      <p class="stack-detail">${item.detail}</p>
    `;
    stackList.append(card);
  });
}

async function loadRuntimeConfig() {
  try {
    const config = await getRuntimeConfig();
    state.runtime.mode = config.mode;
    state.runtime.model = config.model ?? null;
  } catch (error) {
    state.runtime.mode = "local";
    state.runtime.model = null;
  }
  updateRuntimeBadge();
}

function updateRuntimeBadge() {
  runtimeStatus.textContent = state.runtime.mode === "openai" && state.runtime.model
    ? `OpenAI integrated · ${state.runtime.model}`
    : "Integrated local prototype";
}

function updateChatPlaceholder(expert) {
  if (!expert) {
    chatInput.placeholder = "Step near a resident and press Q to ask a question.";
    resizeChatInput();
    return;
  }

  const firstName = expert.name.split(" ")[0];
  chatInput.placeholder = `Ask ${firstName} a focused question about ${expert.domain.toLowerCase()}...`;
  resizeChatInput();
}

function updateQaGuidance(expert) {
  if (!expert) {
    qaGuidance.textContent = "Use a starter question or write a direct question below.";
    return;
  }

  const firstName = expert.name.split(" ")[0];
  qaGuidance.textContent = `${firstName} is strongest at ${expert.bestFor[0].toLowerCase()}. Ask about a problem, workflow, or decision you want help with.`;
}

function resizeChatInput() {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 132)}px`;
}

async function handleExpertQuestion(expert, question) {
  const memory = getConversationMemory(expert.id);
  pushChat(expert.id, "user", question);

  if (!isQuestionInScope(expert, question) && !(memory.length && looksLikeFollowUp(question))) {
    const answer = buildOutOfScopeAnswer(expert);
    pushChat(expert.id, "expert", `${expert.name}: ${answer}`);
    triggerBubble(expert.id, answer, 3.4);
    return;
  }

  if (state.runtime.mode !== "openai") {
    showThinkingIndicator(expert);
    window.setTimeout(() => {
      removeThinkingIndicator();
      const answer = generateResponse(expert, question, memory);
      pushChat(expert.id, "expert", answer);
      triggerBubble(expert.id, stripSpeakerPrefix(answer), 3.4);
    }, 600);
    return;
  }

  chatInput.disabled = true;
  chatInput.placeholder = `Thinking with ${expert.name.split(" ")[0]}...`;
  resizeChatInput();
  showThinkingIndicator(expert);

  try {
    const response = await askExpertQuestion({
      expertId: expert.id,
      question,
      history: memory
    });
    removeThinkingIndicator();
    pushChat(expert.id, "expert", `${expert.name}: ${response.answer}`);
    triggerBubble(expert.id, response.answer, 3.4);
  } catch (error) {
    removeThinkingIndicator();
    const answer = generateResponse(expert, question, memory);
    pushChat(
      expert.id,
      "expert",
      answer
    );
    triggerBubble(expert.id, stripSpeakerPrefix(answer), 3.4);
  } finally {
    chatInput.disabled = false;
    updateChatPlaceholder(state.selectedId === expert.id ? expert : getSelectedResident());
  }
}

function showThinkingIndicator(expert) {
  removeThinkingIndicator();
  const node = document.createElement("article");
  node.className = "conversation-message expert thinking-indicator";
  const meta = document.createElement("span");
  meta.className = "conversation-meta";
  meta.textContent = expert.name.split(" ")[0];
  const body = document.createElement("div");
  body.className = "conversation-body";
  const dots = document.createElement("p");
  dots.className = "conversation-line thinking-dots";
  dots.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  body.append(dots);
  node.append(meta, body);
  conversationFeed.append(node);
  conversationFeed.scrollTop = conversationFeed.scrollHeight;
}

function removeThinkingIndicator() {
  const indicator = conversationFeed.querySelector(".thinking-indicator");
  if (indicator) {
    indicator.remove();
  }
}

function buildResidents() {
  experts.forEach((expert, index) => {
    state.chatHistory.set(expert.id, [
      {
        role: "expert",
        text: `${expert.name}: ${expert.mission}`,
        seed: true
      }
    ]);

    const group = new THREE.Group();
    group.position.set(expert.position.x, 0, expert.position.z);
    group.userData.id = expert.id;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 24),
      new THREE.MeshBasicMaterial({ color: "#123521", transparent: true, opacity: 0.12 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    group.add(shadow);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 28),
      new THREE.MeshBasicMaterial({ color: expert.color, transparent: true, opacity: 0.16 })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    group.add(glow);

    const beacon = createResidentBeacon(expert.color);
    group.add(beacon.group);

    const avatar = createResidentAvatar(expert);
    group.add(avatar.root);

    const labelButton = document.createElement("button");
    labelButton.className = "resident-marker";
    labelButton.type = "button";
    labelButton.innerHTML = `
      <span class="marker-main">
        <span class="marker-dot"></span>
        <span class="marker-name">${expert.name.split(" ")[0]}</span>
      </span>
      <span class="marker-meta">${expert.signal}</span>
    `;
    labelButton.style.setProperty("--marker-accent", expert.color);
    labelButton.setAttribute("aria-label", `Open ${expert.name} profile`);
    labelButton.addEventListener("click", () => openResidentInfo(expert.id));
    labelsLayer.append(labelButton);

    const bubble = document.createElement("div");
    bubble.className = "speech-bubble";
    labelsLayer.append(bubble);

    const listButton = document.createElement("button");
    listButton.type = "button";
    listButton.innerHTML = `
      <span class="resident-name">${expert.name}</span>
      <span class="resident-role">${expert.role}</span>
      <span class="resident-tags">
        <span>${expert.signal}</span>
        <span>${expert.domain}</span>
      </span>
    `;
    listButton.dataset.search = [
      expert.name,
      expert.role,
      expert.domain,
      expert.signal,
      expert.bestFor.join(" "),
      expert.expertise.join(" ")
    ].join(" ").toLowerCase();
    listButton.dataset.signal = expert.signal;
    listButton.setAttribute("aria-label", `Open ${expert.name} details`);
    listButton.addEventListener("click", () => openResidentInfo(expert.id));
    expertList.append(listButton);

    scene.add(group);
    npcMap.set(expert.id, {
      expert,
      group,
      root: avatar.root,
      labelButton,
      bubble,
      listButton,
      home: new THREE.Vector3(expert.position.x, 0, expert.position.z),
      wanderTarget: new THREE.Vector3(expert.position.x, 0, expert.position.z),
      wanderDelay: 1 + index * 0.6,
      bubbleUntil: 0,
      walkCycle: Math.random() * Math.PI * 2,
      pulseOffset: Math.random() * Math.PI * 2,
      bodyPivot: avatar.bodyPivot,
      headPivot: avatar.headPivot,
      leftArmPivot: avatar.leftArmPivot,
      rightArmPivot: avatar.rightArmPivot,
      leftForearm: avatar.leftForearm,
      rightForearm: avatar.rightForearm,
      leftLegPivot: avatar.leftLegPivot,
      rightLegPivot: avatar.rightLegPivot,
      leftShin: avatar.leftShin,
      rightShin: avatar.rightShin,
      halo: avatar.halo,
      beaconColumn: beacon.column,
      beaconRing: beacon.ring,
      beaconCrown: beacon.crown
    });
  });
}

function buildResidentFilters() {
  residentFilterChips.replaceChildren();
  const uniqueSignals = [...new Set(experts.map((expert) => expert.signal))];

  [
    { value: "all", label: "All" },
    ...uniqueSignals.map((signal) => ({
      value: signal,
      label: signal
    }))
  ].forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-chip";
    button.textContent = filter.label;
    button.dataset.signal = filter.value;
    button.classList.toggle("active", filter.value === state.residentSignal);
    button.addEventListener("click", () => {
      state.residentSignal = filter.value;
      updateResidentDiscovery();
    });
    residentFilterChips.append(button);
  });

  updateResidentDiscovery();
}

function updateResidentDiscovery() {
  const query = state.residentQuery.trim().toLowerCase();
  let visibleCount = 0;

  residentFilterChips.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.signal === state.residentSignal);
  });

  npcMap.forEach((resident) => {
    const haystack = resident.listButton.dataset.search ?? "";
    const matchesQuery = !query || haystack.includes(query);
    const matchesSignal = state.residentSignal === "all" || resident.expert.signal === state.residentSignal;
    const visible = matchesQuery && matchesSignal;
    resident.listButton.hidden = !visible;
    if (visible) {
      visibleCount += 1;
    }
  });

  residentEmptyState.classList.toggle("hidden", visibleCount > 0);
}

function mixColor(source, target, amount) {
  return new THREE.Color(source).lerp(new THREE.Color(target), amount);
}

function createResidentAvatar(expert) {
  const appearance = expert.appearance;
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.93;
  root.add(bodyPivot);

  const skinColor = mixColor(appearance.skin, "#fff5eb", 0.16);
  const cheekColor = mixColor(appearance.skin, "#d98569", 0.14);
  const hairColor = mixColor(appearance.hair, "#141312", 0.12);
  const eyeColor = mixColor(appearance.eye, "#0f1418", 0.08);
  const jacketColor = mixColor(expert.color, "#f3f3ef", 0.18);
  const shirtColor = mixColor(expert.color, "#fbf7f0", 0.84);
  const trouserColor = mixColor(expert.color, "#23262d", 0.64);
  const trimColor = mixColor(appearance.hair, "#090b0d", 0.38);
  const shoeColor = mixColor(trouserColor, "#111215", 0.58);
  const accentColor = mixColor(expert.color, "#ffffff", 0.1);

  const skinMaterial = new THREE.MeshStandardMaterial({
    color: skinColor,
    roughness: 0.86,
    metalness: 0.02
  });
  const faceMaterial = new THREE.MeshStandardMaterial({
    color: mixColor(appearance.skin, "#fff7ee", 0.16),
    roughness: 0.82,
    metalness: 0.01
  });
  const cheekMaterial = new THREE.MeshStandardMaterial({
    color: cheekColor,
    roughness: 0.9,
    metalness: 0.01
  });
  const lipMaterial = new THREE.MeshStandardMaterial({
    color: mixColor(appearance.skin, "#9f6759", 0.34),
    roughness: 0.9,
    metalness: 0.01
  });
  const hairMaterial = new THREE.MeshStandardMaterial({
    color: hairColor,
    roughness: 0.96,
    metalness: 0.02
  });
  const eyeWhiteMaterial = new THREE.MeshStandardMaterial({
    color: "#fcfbf7",
    roughness: 0.36,
    metalness: 0
  });
  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: eyeColor,
    roughness: 0.22,
    metalness: 0.04
  });
  const jacketMaterial = new THREE.MeshStandardMaterial({
    color: jacketColor,
    roughness: 0.74,
    metalness: 0.04
  });
  const shirtMaterial = new THREE.MeshStandardMaterial({
    color: shirtColor,
    roughness: 0.84,
    metalness: 0.02
  });
  const trouserMaterial = new THREE.MeshStandardMaterial({
    color: trouserColor,
    roughness: 0.86,
    metalness: 0.03
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.9,
    metalness: 0.04
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.62,
    metalness: 0.08,
    emissive: expert.color,
    emissiveIntensity: 0.05
  });
  const shoeMaterial = new THREE.MeshStandardMaterial({
    color: shoeColor,
    roughness: 0.94,
    metalness: 0.02
  });

  const hips = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.19, 0.18, 4, 10),
    trouserMaterial
  );
  hips.scale.set(1.24, 1, 0.96);
  hips.position.y = 0;
  bodyPivot.add(hips);

  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.026, 8, 26),
    trimMaterial
  );
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.1;
  bodyPivot.add(belt);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.52, 6, 16),
    jacketMaterial
  );
  torso.scale.set(1.08, 1.14, 0.86);
  torso.position.y = 0.54;
  bodyPivot.add(torso);

  const shirtPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.54, 0.05),
    shirtMaterial
  );
  shirtPanel.position.set(0, 0.53, 0.24);
  bodyPivot.add(shirtPanel);

  [-0.11, 0.11].forEach((x) => {
    const lapel = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.28, 0.03),
      trimMaterial
    );
    lapel.position.set(x, 0.69, 0.23);
    lapel.rotation.z = x < 0 ? -0.28 : 0.28;
    bodyPivot.add(lapel);
  });

  const shoulderLine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.94, 12),
    jacketMaterial
  );
  shoulderLine.rotation.z = Math.PI / 2;
  shoulderLine.position.set(0, 0.89, 0.03);
  bodyPivot.add(shoulderLine);

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.024, 8, 24),
    trimMaterial
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.96, 0.02);
  bodyPivot.add(collar);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.1, 0.18, 10),
    skinMaterial
  );
  neck.position.set(0, 1.03, 0.01);
  bodyPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.01, 0.02);
  bodyPivot.add(headPivot);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 22, 18),
    skinMaterial
  );
  head.scale.set(0.94, 1.04, 0.90);
  head.position.y = 0.34;
  headPivot.add(head);

  const facePlane = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 18, 16),
    faceMaterial
  );
  facePlane.scale.set(0.84, 0.98, 0.44);
  facePlane.position.set(0, 0.30, 0.16);
  headPivot.add(facePlane);

  const jaw = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 16, 12),
    faceMaterial
  );
  jaw.scale.set(1.0, 0.56, 0.52);
  jaw.position.set(0, 0.19, 0.06);
  headPivot.add(jaw);

  [-0.11, 0.11].forEach((x) => {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      cheekMaterial
    );
    cheek.scale.set(1.0, 0.72, 0.38);
    cheek.position.set(x, 0.27, 0.19);
    headPivot.add(cheek);
  });

  [-0.26, 0.26].forEach((x) => {
    const ear = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 10),
      skinMaterial
    );
    ear.scale.set(0.66, 0.96, 0.54);
    ear.position.set(x, 0.34, 0.02);
    headPivot.add(ear);
  });

  [-0.09, 0.09].forEach((x) => {
    const eyeWhite = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 14, 12),
      eyeWhiteMaterial
    );
    eyeWhite.scale.set(1.1, 0.78, 0.36);
    eyeWhite.position.set(x, 0.365, 0.245);
    headPivot.add(eyeWhite);

    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 12, 10),
      eyeMaterial
    );
    iris.scale.set(1, 1, 0.44);
    iris.position.set(x, 0.364, 0.268);
    headPivot.add(iris);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.011, 10, 10),
      trimMaterial
    );
    pupil.scale.set(1, 1, 0.38);
    pupil.position.set(x, 0.364, 0.280);
    headPivot.add(pupil);

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.088, 0.016, 0.02),
      trimMaterial
    );
    brow.position.set(x, 0.425, 0.230);
    brow.rotation.z = x < 0 ? 0.14 : -0.14;
    headPivot.add(brow);
  });

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 14, 12),
    faceMaterial
  );
  nose.scale.set(0.68, 0.96, 0.52);
  nose.position.set(0, 0.29, 0.23);
  headPivot.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.01, 0.054, 4, 8),
    lipMaterial
  );
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, 0.215, 0.225);
  headPivot.add(mouth);

  const lowerLip = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 10, 10),
    lipMaterial
  );
  lowerLip.scale.set(1.22, 0.34, 0.30);
  lowerLip.position.set(0, 0.200, 0.218);
  headPivot.add(lowerLip);

  addHumanHair(headPivot, appearance.hairStyle, hairMaterial, accentMaterial);

  const leftArm = buildHumanArm(-1, jacketMaterial, skinMaterial, trimMaterial);
  const rightArm = buildHumanArm(1, jacketMaterial, skinMaterial, trimMaterial);
  bodyPivot.add(leftArm.pivot);
  bodyPivot.add(rightArm.pivot);

  const leftLeg = buildHumanLeg(-1, trouserMaterial, trimMaterial, shoeMaterial);
  const rightLeg = buildHumanLeg(1, trouserMaterial, trimMaterial, shoeMaterial);
  root.add(leftLeg.pivot);
  root.add(rightLeg.pivot);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.58, 42),
    new THREE.MeshStandardMaterial({
      color: expert.color,
      emissive: expert.color,
      emissiveIntensity: 0.24,
      transparent: true,
      opacity: 0.44,
      roughness: 0.5,
      metalness: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  halo.position.set(0, 0.63, -0.24);
  bodyPivot.add(halo);

  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = node !== halo;
      node.receiveShadow = node !== halo;
    }
  });

  return {
    root,
    bodyPivot,
    headPivot,
    leftArmPivot: leftArm.pivot,
    rightArmPivot: rightArm.pivot,
    leftForearm: leftArm.forearm,
    rightForearm: rightArm.forearm,
    leftLegPivot: leftLeg.pivot,
    rightLegPivot: rightLeg.pivot,
    leftShin: leftLeg.shin,
    rightShin: rightLeg.shin,
    halo
  };
}

function createResidentBeacon(color) {
  const group = new THREE.Group();

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.48, 5.6, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    })
  );
  column.position.y = 2.9;
  group.add(column);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.042, 8, 44),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);

  const crown = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.36, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  crown.rotation.x = -Math.PI / 2;
  crown.position.y = 5.66;
  group.add(crown);

  return { group, column, ring, crown };
}

function addHumanHair(headPivot, hairStyle, hairMaterial, accentMaterial) {
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMaterial
  );
  cap.scale.set(1.02, 0.92, 1.04);
  cap.position.set(0, 0.5, -0.01);
  headPivot.add(cap);

  if (hairStyle === "parted") {
    [-0.09, 0.09].forEach((x) => {
      const sweep = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 12, 10),
        hairMaterial
      );
      sweep.scale.set(1.4, 0.7, 1);
      sweep.position.set(x, 0.53, 0.16);
      sweep.rotation.z = x < 0 ? 0.28 : -0.28;
      headPivot.add(sweep);
    });
  }

  if (hairStyle === "waves") {
    [-0.18, 0.18].forEach((x) => {
      const wave = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 12, 10),
        hairMaterial
      );
      wave.scale.set(1.1, 1.2, 0.86);
      wave.position.set(x, 0.44, 0.12);
      headPivot.add(wave);
    });

    const fringe = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 10),
      hairMaterial
    );
    fringe.scale.set(1.5, 0.58, 0.82);
    fringe.position.set(0, 0.5, 0.18);
    headPivot.add(fringe);
  }

  if (hairStyle === "fade") {
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.07, 0.22),
      hairMaterial
    );
    top.position.set(0, 0.62, 0.03);
    headPivot.add(top);

    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.02, 0.04),
      accentMaterial
    );
    line.position.set(0.08, 0.51, 0.17);
    line.rotation.z = -0.24;
    headPivot.add(line);
  }

  if (hairStyle === "bun") {
    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      hairMaterial
    );
    bun.scale.set(1, 1, 0.9);
    bun.position.set(0, 0.47, -0.25);
    headPivot.add(bun);

    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.06, 0.01, 6, 14),
      accentMaterial
    );
    tie.rotation.x = Math.PI / 2;
    tie.position.set(0, 0.47, -0.245);
    headPivot.add(tie);
  }

  if (hairStyle === "long") {
    const backHair = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.38, 0.12),
      hairMaterial
    );
    backHair.position.set(0, 0.23, -0.12);
    headPivot.add(backHair);

    [-0.19, 0.19].forEach((x) => {
      const lock = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.04, 0.18, 4, 8),
        hairMaterial
      );
      lock.position.set(x, 0.24, 0.08);
      headPivot.add(lock);
    });
  }

  if (hairStyle === "soft") {
    [-0.13, 0, 0.13].forEach((x) => {
      const fringe = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 10),
        hairMaterial
      );
      fringe.scale.set(1.18, 0.72, 0.82);
      fringe.position.set(x, 0.51 - Math.abs(x) * 0.08, 0.18);
      headPivot.add(fringe);
    });
  }
}

function buildHumanArm(side, sleeveMaterial, skinMaterial, trimMaterial) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.48, 0.83, 0.02);
  pivot.rotation.z = side < 0 ? 0.14 : -0.14;

  const shoulder = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 10),
    sleeveMaterial
  );
  shoulder.scale.set(1.16, 1.02, 1);
  pivot.add(shoulder);

  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.078, 0.24, 4, 10),
    sleeveMaterial
  );
  upperArm.position.y = -0.34;
  pivot.add(upperArm);

  const elbow = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 10),
    trimMaterial
  );
  elbow.position.y = -0.67;
  pivot.add(elbow);

  const forearm = new THREE.Group();
  forearm.position.y = -0.72;
  pivot.add(forearm);

  const lowerArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.068, 0.2, 4, 10),
    sleeveMaterial
  );
  lowerArm.position.y = -0.24;
  forearm.add(lowerArm);

  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10),
    trimMaterial
  );
  cuff.position.y = -0.46;
  forearm.add(cuff);

  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 10),
    skinMaterial
  );
  hand.scale.set(0.82, 1.02, 0.72);
  hand.position.set(0, -0.57, 0.03);
  forearm.add(hand);

  return { pivot, forearm };
}

function buildHumanLeg(side, trouserMaterial, trimMaterial, shoeMaterial) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.18, 0.83, 0.01);

  const upperLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.096, 0.3, 4, 10),
    trouserMaterial
  );
  upperLeg.position.y = -0.42;
  pivot.add(upperLeg);

  const knee = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 10),
    trimMaterial
  );
  knee.position.y = -0.83;
  pivot.add(knee);

  const shin = new THREE.Group();
  shin.position.y = -0.88;
  pivot.add(shin);

  const lowerLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.078, 0.26, 4, 10),
    trouserMaterial
  );
  lowerLeg.position.y = -0.29;
  shin.add(lowerLeg);

  const ankle = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    trimMaterial
  );
  ankle.position.y = -0.59;
  shin.add(ankle);

  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.11, 0.38),
    shoeMaterial
  );
  foot.position.set(0, -0.69, 0.1);
  foot.rotation.x = -0.05;
  shin.add(foot);

  const toeCap = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.05, 0.16),
    trimMaterial
  );
  toeCap.position.set(0, -0.68, 0.18);
  shin.add(toeCap);

  return { pivot, shin };
}

function attachEvents() {
  window.addEventListener("resize", handleResize);
  document.addEventListener("pointerlockchange", handlePointerLockChange);
  document.addEventListener("mousemove", handleMouseMove);

  window.addEventListener("keydown", (event) => {
    const isTyping =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;

    if (isTyping && event.code !== "Escape") {
      return;
    }

    state.keys.add(event.code);
    if (event.code === "Space" && !event.repeat) {
      state.player.jumpBufferTime = jumpBufferDuration;
    }
    if (event.code === "KeyQ" && !event.repeat) {
      if (focusResidentChat()) {
        event.preventDefault();
      }
    }
    if (event.code === "KeyO" && !event.repeat) {
      if (openResidentInfo(getPriorityResidentId(), { releasePointer: true })) {
        event.preventDefault();
      }
    }
    if (event.code === "KeyR" && !event.repeat) {
      toggleResidentDirectory();
    }
    if (event.code === "KeyI" && !event.repeat) {
      toggleDrawer("overview");
    }
    if (event.code === "Escape" && shortcutsModal.classList.contains("hidden") === false) {
      closeShortcutsModal();
      event.preventDefault();
      return;
    }
    if (event.code === "Escape" && !state.pointerLocked) {
      closeDrawers();
      if (state.selectedId) {
        syncSelection(null);
      }
      chatInput.blur();
    }
  });

  window.addEventListener("keyup", (event) => {
    state.keys.delete(event.code);
  });

  canvas.addEventListener("click", requestEntry);
  unlockButton.addEventListener("click", requestEntry);
  shortcutsButton.addEventListener("click", () => {
    if (shortcutsModal.classList.contains("hidden")) {
      openShortcutsModal();
    } else {
      closeShortcutsModal();
    }
  });
  shortcutsBackdrop.addEventListener("click", closeShortcutsModal);
  shortcutsCloseButton.addEventListener("click", closeShortcutsModal);
  overlayButton.addEventListener("click", requestEntry);
  menuOverviewButton.addEventListener("click", () => toggleDrawer("overview"));
  menuResidentsButton.addEventListener("click", () => toggleResidentDirectory());
  menuStackButton.addEventListener("click", () => toggleDrawer("stack"));
  panelCloseButton.addEventListener("click", () => {
    chatInput.blur();
    syncSelection(null);
  });
  focusChatButton.addEventListener("click", () => {
    focusResidentChat();
  });
  residentSearchInput.addEventListener("input", () => {
    state.residentQuery = residentSearchInput.value;
    updateResidentDiscovery();
  });
  inspectorTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setInspectorTab(tab.dataset.inspectorTab ?? "info");
    });
  });

  copyPromptButton.addEventListener("click", async () => {
    const text = promptPreview.textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyPromptButton.textContent = "Copied";
      window.setTimeout(() => {
        copyPromptButton.textContent = "Copy";
      }, 1500);
    } catch (error) {
      copyPromptButton.textContent = "Failed";
      window.setTimeout(() => {
        copyPromptButton.textContent = "Copy";
      }, 1500);
    }
  });

  chatInput.addEventListener("input", () => {
    resizeChatInput();
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const expert = getSelectedResident();
    const question = chatInput.value.trim();
    if (!expert || !question) {
      return;
    }
    chatInput.value = "";
    resizeChatInput();
    void handleExpertQuestion(expert, question);
  });
}

function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function handlePointerLockChange() {
  state.pointerLocked = document.pointerLockElement === canvas;
  document.body.classList.toggle("locked", state.pointerLocked && !isTouchDevice);
  if (state.pointerLocked) {
    state.hasEnteredPark = true;
    lockOverlay.classList.add("hidden");
    unlockButton.textContent = "In Park";
    statusPill.textContent = "First-person mode active.";
  } else if (!isTouchDevice) {
    if (!state.hasEnteredPark) {
      lockOverlay.classList.remove("hidden");
    }
    unlockButton.textContent = "Enter Park";
    statusPill.textContent = state.nearbyId
      ? "Cursor released. Use O for profile, Q for chat, or Enter Park to move again."
      : "Click the scene to enter first-person mode.";
  }
}

function handleMouseMove(event) {
  if (!state.pointerLocked || isTouchDevice) {
    return;
  }
  state.yaw -= event.movementX * 0.0018;
  state.pitch -= event.movementY * 0.0015;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.18, 1.18);
}

function requestEntry() {
  if (isTouchDevice) {
    return;
  }
  if (document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
}

function applyDrawerState() {
  overviewDrawer.classList.toggle("hidden", state.openDrawer !== "overview");
  residentDrawer.classList.toggle("hidden", state.openDrawer !== "residents");
  stackDrawer.classList.toggle("hidden", state.openDrawer !== "stack");
  menuOverviewButton.classList.toggle("active", state.openDrawer === "overview");
  menuResidentsButton.classList.toggle("active", state.openDrawer === "residents");
  menuStackButton.classList.toggle("active", state.openDrawer === "stack");
}

function setDrawer(name) {
  state.openDrawer = name;
  applyDrawerState();
}

function toggleDrawer(name) {
  setDrawer(state.openDrawer === name ? null : name);
}

function closeDrawers() {
  setDrawer(null);
}

function openShortcutsModal() {
  shortcutsModal.classList.remove("hidden");
  shortcutsModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("shortcuts-open");
  window.setTimeout(() => {
    shortcutsCloseButton.focus();
  }, 20);
}

function closeShortcutsModal() {
  shortcutsModal.classList.add("hidden");
  shortcutsModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("shortcuts-open");
}

function toggleResidentDirectory() {
  toggleDrawer("residents");
  if (state.openDrawer === "residents" && !state.pointerLocked) {
    window.setTimeout(() => {
      residentSearchInput.focus();
      residentSearchInput.select();
    }, 20);
  }
}

function getPriorityResidentId() {
  return state.nearbyId ?? state.selectedId;
}

function setInspectorTab(name) {
  state.inspectorTab = name;
  inspectorTabs.forEach((tab) => {
    const active = tab.dataset.inspectorTab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  inspectorPanels.forEach((panel) => {
    const active = panel.dataset.inspectorPanel === name;
    panel.classList.toggle("active", active);
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });
}

function openResidentInfo(expertId = getPriorityResidentId(), options = {}) {
  if (!expertId) {
    return false;
  }

  const { releasePointer = false, tab = "info" } = options;
  if (releasePointer && state.pointerLocked && document.exitPointerLock) {
    document.exitPointerLock();
  }

  closeDrawers();
  setInspectorTab(tab);
  syncSelection(expertId);
  return true;
}

function focusResidentChat(expertId = getPriorityResidentId()) {
  const expert = expertId ? npcMap.get(expertId)?.expert ?? null : null;
  if (!expert) {
    return false;
  }

  openResidentInfo(expert.id, { releasePointer: true, tab: "qa" });
  window.setTimeout(() => {
    updateChatPlaceholder(expert);
    chatInput.focus();
    chatInput.select();
  }, 20);
  return true;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);
  state.currentTime += dt;

  updatePlayer(dt);
  updateSkyBackdrop();
  updateResidents(dt);
  updateNearbyResident();
  updateInspector();
  updateOverlayPositions();

  renderer.render(scene, camera);
}

function updatePlayer(dt) {
  if (isTouchDevice) {
    state.autoTourAngle += dt * 0.14;
    state.player.position.set(Math.sin(state.autoTourAngle) * 18, 0, Math.cos(state.autoTourAngle) * 18);
    state.yaw = Math.atan2(-state.player.position.x, -state.player.position.z);
    state.pitch = -0.08 + Math.sin(state.autoTourAngle * 1.7) * 0.04;
  } else {
    state.player.jumpBufferTime = Math.max(state.player.jumpBufferTime - dt, 0);
    state.player.coyoteTime = state.player.grounded
      ? coyoteDuration
      : Math.max(state.player.coyoteTime - dt, 0);

    const moveInput = new THREE.Vector2(
      Number(state.keys.has("KeyD")) - Number(state.keys.has("KeyA")),
      Number(state.keys.has("KeyS")) - Number(state.keys.has("KeyW"))
    );

    const hasInput = moveInput.lengthSq() > 0;
    if (hasInput) {
      moveInput.normalize();
    }

    const moveSpeed = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight") ? sprintSpeed : walkSpeed;
    tempDirection.set(0, 0, 0);
    const sinYaw = Math.sin(state.yaw);
    const cosYaw = Math.cos(state.yaw);
    tempDirection.x = moveInput.x * cosYaw + moveInput.y * sinYaw;
    tempDirection.z = moveInput.y * cosYaw - moveInput.x * sinYaw;

    if (hasInput) {
      const appliedAcceleration = state.player.grounded ? groundAcceleration : airAcceleration;
      state.player.velocity.x += tempDirection.x * appliedAcceleration * dt;
      state.player.velocity.z += tempDirection.z * appliedAcceleration * dt;
      const horizontalSpeed = Math.hypot(state.player.velocity.x, state.player.velocity.z);
      if (horizontalSpeed > moveSpeed) {
        const scale = moveSpeed / horizontalSpeed;
        state.player.velocity.x *= scale;
        state.player.velocity.z *= scale;
      }
    } else if (state.player.grounded) {
      const damping = Math.exp(-friction * dt);
      state.player.velocity.x *= damping;
      state.player.velocity.z *= damping;
    } else {
      const airDamping = Math.exp(-airDrag * dt);
      state.player.velocity.x *= airDamping;
      state.player.velocity.z *= airDamping;
    }

    if (state.player.jumpBufferTime > 0 && state.player.coyoteTime > 0) {
      state.player.verticalVelocity = jumpVelocity;
      state.player.grounded = false;
      state.player.coyoteTime = 0;
      state.player.jumpBufferTime = 0;
    }

    if (!state.player.grounded) {
      state.player.verticalVelocity -= gravity * dt;
    }

    const wasGrounded = state.player.grounded;
    state.player.position.x += state.player.velocity.x * dt;
    state.player.position.z += state.player.velocity.z * dt;
    resolveWorldCollisions(state.player.position);

    if (!state.player.grounded || state.player.verticalVelocity !== 0) {
      const nextY = state.player.position.y + state.player.verticalVelocity * dt;
      if (nextY <= 0) {
        state.player.position.y = 0;
        if (!wasGrounded && state.player.verticalVelocity < -3.4) {
          state.player.landingImpact = Math.min(Math.abs(state.player.verticalVelocity) * 0.012, 0.16);
        }
        state.player.verticalVelocity = 0;
        state.player.grounded = true;
      } else {
        state.player.position.y = nextY;
        state.player.grounded = false;
      }
    }
  }

  const speed = Math.hypot(state.player.velocity.x, state.player.velocity.z);
  state.player.walkCycle += dt * Math.min(speed, sprintSpeed) * 1.55;
  state.player.landingImpact = THREE.MathUtils.lerp(state.player.landingImpact, 0, dt * 8);
  const landingBob = -state.player.landingImpact;
  const bobAmount = isTouchDevice
    ? 0.02
    : Math.sin(state.player.walkCycle * 7.4) * Math.min(speed / 7, 1) * 0.055 + landingBob;
  const rollTarget = isTouchDevice ? 0 : (Number(state.keys.has("KeyD")) - Number(state.keys.has("KeyA"))) * -0.03;
  state.roll = THREE.MathUtils.lerp(state.roll, rollTarget, dt * 6);

  camera.position.set(
    state.player.position.x,
    playerHeight + state.player.position.y + bobAmount,
    state.player.position.z
  );
  camera.rotation.set(state.pitch, state.yaw, state.roll, "YXZ");
}

function resolveWorldCollisions(position) {
  const radialDistance = Math.hypot(position.x, position.z);
  const maxDistance = worldRadius - playerRadius;
  if (radialDistance > maxDistance) {
    const scale = maxDistance / radialDistance;
    position.x *= scale;
    position.z *= scale;
  }

  obstacleCircles.forEach((obstacle) => {
    const dx = position.x - obstacle.x;
    const dz = position.z - obstacle.z;
    const distance = Math.hypot(dx, dz);
    const minimumDistance = obstacle.radius + playerRadius;
    if (distance < minimumDistance) {
      const safeDistance = minimumDistance / Math.max(distance, 0.0001);
      position.x = obstacle.x + dx * safeDistance;
      position.z = obstacle.z + dz * safeDistance;
    }
  });
}

function updateResidents(dt) {
  npcMap.forEach((resident) => {
    resident.wanderDelay -= dt;
    if (resident.wanderDelay <= 0) {
      resident.wanderDelay = 3 + Math.random() * 4;
      resident.wanderTarget.set(
        resident.home.x + (Math.random() - 0.5) * 2.8,
        0,
        resident.home.z + (Math.random() - 0.5) * 2.8
      );
    }

    tempVector.copy(resident.wanderTarget).sub(resident.group.position);
    const distance = tempVector.length();
    if (distance > 0.2) {
      tempVector.normalize();
      resident.group.position.addScaledVector(tempVector, dt * 0.72);
      resident.group.rotation.y = THREE.MathUtils.lerp(
        resident.group.rotation.y,
        Math.atan2(tempVector.x, tempVector.z),
        dt * 4
      );
    }

    const moving = distance > 0.2 ? 1 : 0;
    resident.walkCycle += dt * (moving ? 6.8 : 1.8);
    const stride = Math.sin(resident.walkCycle);
    const armSwing = stride * moving * 0.5;
    const legSwing = stride * moving * 0.5;
    const leftForearmBend = 0.14 + Math.max(0, armSwing) * 0.18;
    const rightForearmBend = 0.14 + Math.max(0, -armSwing) * 0.18;
    const leftShinBend = Math.max(0, -legSwing) * 0.72;
    const rightShinBend = Math.max(0, legSwing) * 0.72;
    const idleLift = moving
      ? Math.abs(Math.sin(resident.walkCycle * 2)) * 0.026
      : Math.sin(state.currentTime * 1.4 + resident.pulseOffset) * 0.008;
    const bodyShift = moving
      ? Math.sin(resident.walkCycle) * 0.03
      : Math.sin(state.currentTime * 0.8 + resident.pulseOffset) * 0.006;
    const bodyTilt = moving ? -Math.sin(resident.walkCycle) * 0.042 : 0;
    const bodyTurn = moving ? Math.sin(resident.walkCycle + Math.PI / 2) * 0.04 : 0;

    resident.root.position.y = idleLift;
    resident.bodyPivot.position.x = THREE.MathUtils.lerp(resident.bodyPivot.position.x, bodyShift, dt * 6);
    resident.bodyPivot.rotation.z = THREE.MathUtils.lerp(resident.bodyPivot.rotation.z, bodyTilt, dt * 6);
    resident.bodyPivot.rotation.y = THREE.MathUtils.lerp(resident.bodyPivot.rotation.y, bodyTurn, dt * 4.5);
    resident.leftArmPivot.rotation.x = THREE.MathUtils.lerp(resident.leftArmPivot.rotation.x, -armSwing - 0.12, dt * 8);
    resident.rightArmPivot.rotation.x = THREE.MathUtils.lerp(resident.rightArmPivot.rotation.x, armSwing - 0.12, dt * 8);
    resident.leftForearm.rotation.x = THREE.MathUtils.lerp(resident.leftForearm.rotation.x, leftForearmBend, dt * 8);
    resident.rightForearm.rotation.x = THREE.MathUtils.lerp(resident.rightForearm.rotation.x, rightForearmBend, dt * 8);
    resident.leftLegPivot.rotation.x = THREE.MathUtils.lerp(resident.leftLegPivot.rotation.x, legSwing, dt * 8);
    resident.rightLegPivot.rotation.x = THREE.MathUtils.lerp(resident.rightLegPivot.rotation.x, -legSwing, dt * 8);
    resident.leftShin.rotation.x = THREE.MathUtils.lerp(resident.leftShin.rotation.x, leftShinBend, dt * 8);
    resident.rightShin.rotation.x = THREE.MathUtils.lerp(resident.rightShin.rotation.x, rightShinBend, dt * 8);
    resident.halo.rotation.z += dt * 0.11;
    resident.halo.scale.setScalar(1 + Math.sin(state.currentTime * 1.4 + resident.pulseOffset) * 0.014);
    const beaconStrength = resident.expert.id === state.selectedId ? 1 : (resident.expert.id === state.nearbyId ? 0.58 : 0);
    const beaconPulse = Math.sin(state.currentTime * 2.6 + resident.pulseOffset) * 0.5 + 0.5;
    resident.beaconColumn.material.opacity = THREE.MathUtils.lerp(
      resident.beaconColumn.material.opacity,
      beaconStrength * 0.12,
      dt * 7
    );
    resident.beaconColumn.scale.y = THREE.MathUtils.lerp(
      resident.beaconColumn.scale.y,
      0.94 + beaconStrength * 0.16 + beaconPulse * 0.06,
      dt * 6
    );
    resident.beaconRing.material.opacity = THREE.MathUtils.lerp(
      resident.beaconRing.material.opacity,
      beaconStrength * 0.58,
      dt * 8
    );
    resident.beaconRing.scale.setScalar(1 + beaconStrength * 0.22 + beaconPulse * 0.1);
    resident.beaconCrown.material.opacity = THREE.MathUtils.lerp(
      resident.beaconCrown.material.opacity,
      beaconStrength * 0.44,
      dt * 8
    );
    resident.beaconCrown.scale.setScalar(1 + beaconStrength * 0.1 + beaconPulse * 0.08);

    const toPlayer = tempDirection.copy(state.player.position).sub(resident.group.position);
    const desiredHeadYaw = THREE.MathUtils.clamp(
      Math.atan2(toPlayer.x, toPlayer.z) - resident.group.rotation.y,
      -0.72,
      0.72
    );
    const horizontalDistance = Math.max(Math.hypot(toPlayer.x, toPlayer.z), 0.001);
    const desiredHeadPitch = THREE.MathUtils.clamp(
      Math.atan2(
        state.player.position.y + playerHeight - (resident.group.position.y + 2.18),
        horizontalDistance
      ),
      -0.2,
      0.24
    );
    const headWeight = toPlayer.length() < 9 || resident.expert.id === state.selectedId ? 1 : 0.25;
    resident.headPivot.rotation.y = THREE.MathUtils.lerp(
      resident.headPivot.rotation.y,
      desiredHeadYaw * headWeight,
      dt * 4.6
    );
    resident.headPivot.rotation.x = THREE.MathUtils.lerp(
      resident.headPivot.rotation.x,
      desiredHeadPitch * headWeight,
      dt * 4.6
    );
  });
}

function updateNearbyResident() {
  let nearest = null;
  let bestDistance = Infinity;

  npcMap.forEach((resident) => {
    const distance = resident.group.position.distanceTo(state.player.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = resident;
    }
  });

  const newNearbyId = nearest && bestDistance <= interactionRadius ? nearest.expert.id : null;
  if (newNearbyId !== state.nearbyId) {
    state.nearbyId = newNearbyId;
    refreshResidentStates();
  }

  if (state.selectedId && !npcMap.has(state.selectedId)) {
    syncSelection(null);
  }

  if (state.nearbyId) {
    const resident = npcMap.get(state.nearbyId).expert;
    if (!state.selectedId) {
      focusName.textContent = resident.name;
    }
    focusDomain.textContent = resident.domain;
    statusPill.textContent = state.pointerLocked || isTouchDevice
      ? `Near ${resident.name}. Q ask, O profile, R residents.`
      : `Near ${resident.name}. O opens the profile and Q jumps into chat.`;
  } else if (!state.selectedId) {
    focusName.textContent = "Free roam";
    focusDomain.textContent = "Scan the park";
    statusPill.textContent = state.pointerLocked || isTouchDevice
      ? "S forward, W back, A left, D right. O info, Q chat."
      : "Click the scene to enter first-person mode.";
  }
}

function syncSelection(id) {
  state.selectedId = id;
  refreshResidentStates();

  if (!id) {
    inspector.classList.add("hidden");
    inspector.style.removeProperty("--expert-accent");
    inspector.style.removeProperty("--expert-accent-soft");
    setInspectorTab("info");
    focusChatButton.disabled = true;
    focusChatButton.textContent = "Ask This Expert";
    updateChatPlaceholder(null);
    updateQaGuidance(null);
    focusName.textContent = "Free roam";
    if (!state.nearbyId) {
      focusDomain.textContent = "Scan the park";
    } else {
      const nearbyResident = npcMap.get(state.nearbyId)?.expert;
      if (nearbyResident) {
        focusName.textContent = nearbyResident.name;
        focusDomain.textContent = nearbyResident.domain;
      }
    }
    return;
  }

  const resident = npcMap.get(id)?.expert;
  if (!resident) {
    return;
  }

  inspector.classList.remove("hidden");
  focusChatButton.disabled = false;
  focusChatButton.textContent = `Ask ${resident.name.split(" ")[0]}`;
  focusName.textContent = resident.name;
  focusDomain.textContent = resident.domain;
  updateChatPlaceholder(resident);
  updateQaGuidance(resident);
  renderInspector(resident);
}

function refreshResidentStates() {
  npcMap.forEach((resident) => {
    const selected = resident.expert.id === state.selectedId;
    const nearby = resident.expert.id === state.nearbyId;
    const passive = !selected && !nearby;
    resident.labelButton.classList.toggle("selected", selected);
    resident.labelButton.classList.toggle("nearby", nearby);
    resident.labelButton.classList.toggle("passive", passive);
    resident.listButton.classList.toggle("active", selected);
    resident.listButton.classList.toggle("nearby", nearby);
  });
}

function renderInspector(expert) {
  const resident = npcMap.get(expert.id);
  const distance = resident ? resident.group.position.distanceTo(state.player.position) : 0;
  const initials = expert.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  inspector.style.setProperty("--expert-accent", expert.color);
  inspector.style.setProperty("--expert-accent-soft", hexToRgba(expert.color, 0.16));
  inspectorEmblem.textContent = initials;
  inspectorDomain.textContent = expert.domain;
  inspectorName.textContent = expert.name;
  inspectorRole.textContent = expert.role;
  inspectorDistance.textContent = `${distance.toFixed(1)} m away`;
  inspectorBio.textContent = expert.bio;
  infoSignal.textContent = expert.signal;
  infoDomain.textContent = expert.domain;
  infoPrimarySkill.textContent = expert.expertise[0];

  profilePresence.replaceChildren();
  [expert.signal, expert.bestFor[0]].forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "presence-chip";
    chip.textContent = item;
    profilePresence.append(chip);
  });

  prosGrid.replaceChildren();
  expert.pros.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "pro-card";
    card.innerHTML = `
      <span class="pro-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="pro-copy">${item}</span>
    `;
    prosGrid.append(card);
  });

  signatureLine.textContent = expert.signature;

  bestFit.replaceChildren();
  expert.bestFor.forEach((item) => {
    const chip = document.createElement("span");
    chip.textContent = item;
    bestFit.append(chip);
  });

  expertiseChips.replaceChildren();
  expert.expertise.forEach((item) => {
    const chip = document.createElement("span");
    chip.textContent = item;
    expertiseChips.append(chip);
  });

  starterQuestions.replaceChildren();
  expert.starterQuestions.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question;
    button.addEventListener("click", () => {
      void handleExpertQuestion(expert, question);
    });
    starterQuestions.append(button);
  });

  promptPreview.textContent = buildPersonaPrompt(expert);
  renderConversation(expert.id);
}

function updateInspector() {
  const expert = getSelectedResident();
  if (!expert) {
    return;
  }
  const resident = npcMap.get(expert.id);
  if (resident) {
    const distance = resident.group.position.distanceTo(state.player.position);
    inspectorDistance.textContent = `${distance.toFixed(1)} m away`;
  }
}

function getSelectedResident() {
  return state.selectedId ? npcMap.get(state.selectedId)?.expert ?? null : null;
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function renderConversation(expertId) {
  const expert = npcMap.get(expertId)?.expert ?? null;
  const history = state.chatHistory.get(expertId) ?? [];
  conversationFeed.replaceChildren();

  const liveHistory = history.filter((message) => !message.seed).slice(-6);
  if (liveHistory.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "conversation-empty";

    const title = document.createElement("strong");
    title.textContent = expert ? `${expert.name.split(" ")[0]} is ready.` : "Ready for a question.";

    const copy = document.createElement("p");
    copy.textContent = expert
      ? `Ask about ${expert.domain.toLowerCase()}, their workflow, or a challenge you want help solving.`
      : "Ask a focused question to start the conversation.";

    emptyState.append(title, copy);
    conversationFeed.append(emptyState);
    return;
  }

  liveHistory.forEach((message) => {
    const node = document.createElement("article");
    node.className = `conversation-message ${message.role}`;

    const meta = document.createElement("span");
    meta.className = "conversation-meta";
    meta.textContent = message.role === "user"
      ? "You"
      : (expert ? expert.name.split(" ")[0] : "Expert");

    const body = document.createElement("div");
    body.className = "conversation-body";
    renderConversationBody(
      body,
      message.role === "expert" ? stripSpeakerPrefix(message.text) : message.text
    );

    node.append(meta, body);
    conversationFeed.append(node);
  });

  conversationFeed.scrollTop = conversationFeed.scrollHeight;
}

function pushChat(expertId, role, text) {
  const history = state.chatHistory.get(expertId) ?? [];
  const expert = npcMap.get(expertId)?.expert ?? null;
  const formattedText = role === "expert" && expert
    ? `${expert.name}: ${finalizeExpertAnswer(stripSpeakerPrefix(text), expert)}`
    : text;
  history.push({ role, text: formattedText });
  state.chatHistory.set(expertId, trimConversationHistory(history));
  if (state.selectedId === expertId) {
    renderConversation(expertId);
  }
}

function trimConversationHistory(history) {
  const seedMessages = history.filter((message) => message.seed);
  const liveMessages = history.filter((message) => !message.seed);
  return [...seedMessages, ...liveMessages.slice(-12)];
}

function getConversationMemory(expertId) {
  const history = state.chatHistory.get(expertId) ?? [];
  return history
    .filter((message) => !message.seed)
    .slice(-6)
    .map((message) => ({
      role: message.role,
      text: message.text
    }));
}

function generateResponse(expert, question, memory = []) {
  const query = question.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;
  const memoryLead = buildMemoryLead(question, memory);

  expert.answerBank.forEach((entry) => {
    const score = entry.keywords.reduce((sum, keyword) => sum + Number(query.includes(keyword)), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  });

  if (bestMatch) {
    return `${expert.name}: ${finalizeExpertAnswer(`${memoryLead}${bestMatch.answer}`, expert)}`;
  }

  return `${expert.name}: ${buildOutOfScopeAnswer(expert)}`;
}

function renderConversationBody(container, text) {
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const item = document.createElement("p");
      item.className = `conversation-line${line.startsWith("- ") ? " bullet" : ""}`;
      item.textContent = line.startsWith("- ") ? line.slice(2) : line;
      container.append(item);
    });
}

function buildMemoryLead(question, memory) {
  if (!looksLikeFollowUp(question)) {
    return "";
  }

  const lastUserMessage = [...memory].reverse().find((message) => message.role === "user");
  if (!lastUserMessage) {
    return "";
  }

  const previousTopic = lastUserMessage.text.length > 70
    ? `${lastUserMessage.text.slice(0, 67).trim()}...`
    : lastUserMessage.text;

  return `Following up on your earlier point about "${previousTopic}", `;
}

function looksLikeFollowUp(question) {
  return /^(and|also|what about|how about|then|so|now|okay|can you|could you|why|tell me more)/i.test(
    question.trim()
  );
}

function updateOverlayPositions() {
  camera.getWorldDirection(cameraForward);
  npcMap.forEach((resident) => {
    const worldPosition = resident.group.position;
    const distance = worldPosition.distanceTo(camera.position);
    const emphasized =
      resident.expert.id === state.selectedId || resident.expert.id === state.nearbyId;
    const maxVisibleDistance = emphasized ? 34 : 25;

    tempDirection.copy(worldPosition).sub(camera.position).normalize();
    const visible = cameraForward.dot(tempDirection) > 0.1;
    tempVector.set(worldPosition.x, worldPosition.y + 3.1, worldPosition.z).project(camera);
    const withinViewport =
      tempVector.z > -1 &&
      tempVector.z < 1 &&
      Math.abs(tempVector.x) < 1.08 &&
      Math.abs(tempVector.y) < 1.08;
    const screenBias = tempVector.x;

    if (!visible || distance > maxVisibleDistance || !withinViewport) {
      resident.labelButton.style.opacity = "0";
      resident.labelButton.style.pointerEvents = "none";
      resident.bubble.classList.remove("visible");
      return;
    }

    projectToScreen(
      worldPosition.x,
      worldPosition.y + 3.1,
      worldPosition.z,
      resident.labelButton,
      distance,
      emphasized ? 1.02 : 0.82,
      emphasized ? 1 : 0.72
    );
    resident.labelButton.style.pointerEvents = "auto";

    const bubbleVisible = state.currentTime < resident.bubbleUntil && (emphasized || distance <= bubbleVisibilityDistance);
    if (bubbleVisible) {
      const bubbleOffsetX = screenBias < -0.14 ? 36 : (screenBias > 0.14 ? -36 : 0);
      projectToScreen(
        worldPosition.x,
        worldPosition.y + 5.15,
        worldPosition.z,
        resident.bubble,
        distance,
        0.86,
        0.9,
        bubbleOffsetX,
        -18
      );
      resident.bubble.classList.add("visible");
    } else {
      resident.bubble.classList.remove("visible");
    }
  });
}

function projectToScreen(x, y, z, element, distance, scaleBoost, opacityFactor = 1, offsetX = 0, offsetY = 0) {
  tempVector.set(x, y, z).project(camera);
  const screenX = (tempVector.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-tempVector.y * 0.5 + 0.5) * window.innerHeight;
  const scale = THREE.MathUtils.clamp(0.96 + (scaleBoost * 0.02) / Math.max(distance / 10, 1), 0.95, 0.99);
  const opacity = THREE.MathUtils.clamp((1.04 - distance / 88) * opacityFactor, 0.28, 1);
  element.style.transform = `translate(-50%, -50%) translate(${screenX + offsetX}px, ${screenY + offsetY}px) scale(${scale})`;
  element.style.opacity = `${opacity}`;
}

function triggerBubble(id, text, duration) {
  const resident = npcMap.get(id);
  if (!resident) {
    return;
  }
  resident.bubble.textContent = formatBubbleText(text);
  resident.bubbleUntil = state.currentTime + duration;
}

function stripSpeakerPrefix(text) {
  return text.replace(/^[^:]{1,48}:\s*/, "").trim();
}

function formatBubbleText(text, limit = 74) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }

  const slice = compact.slice(0, limit - 1);
  const safeBreak = slice.lastIndexOf(" ");
  const clipped = safeBreak > 40 ? slice.slice(0, safeBreak) : slice;
  return `${clipped.trim()}…`;
}
