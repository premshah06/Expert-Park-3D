import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { askExpertQuestionStream, getRuntimeConfig } from "./api.js";
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

// Night palette — everything lerps toward these as state.nightMix approaches 1
const skyTopNight = new THREE.Color("#0b1424");
const skyHorizonNight = new THREE.Color("#1a2740");
const skyGlowNight = new THREE.Color("#3d517e");
const fogDayColor = new THREE.Color("#cce0d8");
const fogNightColor = new THREE.Color("#0e1826");
const hemiSkyDay = new THREE.Color("#edf8e0");
const hemiSkyNight = new THREE.Color("#26344e");
const hemiGroundDay = new THREE.Color("#7aaa82");
const hemiGroundNight = new THREE.Color("#131c2c");
const sunDayColor = new THREE.Color("#fff6d6");
const moonColor = new THREE.Color("#b7c8ee");

// Scene handles the day/night system needs to reach every frame
const environment = {
  hemi: null,
  sun: null,
  fill: null,
  lanternBulbs: [],
  lanternGlows: [],
  firefliesMaterial: null,
  cloudMaterial: null,
  starsMaterial: null,
  stars: null
};

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
  nightMix: 0,
  nightTarget: 0,
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
const qaTitle = document.getElementById("qa-title");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendButton = document.getElementById("send-button");
const unlockButton = document.getElementById("unlock-button");
const shortcutsModal = document.getElementById("shortcuts-modal");
const shortcutsBackdrop = document.getElementById("shortcuts-backdrop");
const shortcutsCloseButton = document.getElementById("shortcuts-close");
const lockOverlay = document.getElementById("lock-overlay");
const overlayButton = document.getElementById("overlay-button");
const inspectorTabs = Array.from(document.querySelectorAll("[data-inspector-tab]"));
const inspectorPanels = Array.from(document.querySelectorAll("[data-inspector-panel]"));
const nightButton = document.getElementById("menu-night");
const minimapCanvas = document.getElementById("minimap");
const minimapContext = minimapCanvas ? minimapCanvas.getContext("2d") : null;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#b8d4e6");
scene.fog = new THREE.FogExp2("#cce0d8", 0.016);

const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 120);
camera.rotation.order = "YXZ";

const clock = new THREE.Clock();
const cameraForward = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const tempDirection = new THREE.Vector3();
const npcMap = new Map();
// Declared before the first animate() call — updateEmotes runs every frame
const activeEmotes = [];
const emoteTextureCache = new Map();

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

// Dev-only hook for automated screenshots/debugging (harmless in production)
window.__park = { state, camera, npcMap };

// Pulse the Enter Park button 3 times on first load to draw attention
if (!isTouchDevice && unlockButton) {
  unlockButton.classList.add("pulse");
  unlockButton.addEventListener("animationend", () => {
    unlockButton.classList.remove("pulse");
  }, { once: true });
}

function buildScene() {
  addSkyBackdrop();

  const hemiLight = new THREE.HemisphereLight("#edf8e0", "#7aaa82", 1.4);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);
  environment.hemi = hemiLight;

  const fillLight = new THREE.DirectionalLight("#c8e8f0", 0.55);
  fillLight.position.set(-12, 14, -8);
  scene.add(fillLight);
  environment.fill = fillLight;

  const sun = new THREE.DirectionalLight("#fff6d6", 2.2);
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
  environment.sun = sun;

  const parkBase = new THREE.Mesh(
    new THREE.CylinderGeometry(worldRadius, worldRadius + 0.3, 0.5, 96),
    new THREE.MeshStandardMaterial({ color: "#5e9458", roughness: 0.98 })
  );
  parkBase.position.y = -0.3;
  parkBase.receiveShadow = true;
  scene.add(parkBase);

  const grassDisk = new THREE.Mesh(
    new THREE.CircleGeometry(worldRadius - 0.2, 96),
    new THREE.MeshStandardMaterial({ color: "#79a96e", roughness: 0.98 })
  );
  grassDisk.rotation.x = -Math.PI / 2;
  grassDisk.receiveShadow = true;
  scene.add(grassDisk);

  // Inner grass ring — slightly lighter to create depth
  const innerGrass = new THREE.Mesh(
    new THREE.RingGeometry(0, 10, 72),
    new THREE.MeshStandardMaterial({ color: "#87b87b", roughness: 0.96, side: THREE.DoubleSide })
  );
  innerGrass.rotation.x = -Math.PI / 2;
  innerGrass.position.y = 0.005;
  scene.add(innerGrass);

  const ringPath = new THREE.Mesh(
    new THREE.RingGeometry(12, 16.4, 96),
    new THREE.MeshStandardMaterial({ color: "#cdb888", roughness: 0.92, side: THREE.DoubleSide })
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
    new THREE.CylinderGeometry(2.35, 2.45, 0.24, 52),
    new THREE.MeshPhysicalMaterial({
      color: "#5bbfbc",
      roughness: 0.04,
      metalness: 0.06,
      transmission: 0.48,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.88
    })
  );
  fountainWater.position.y = 0.88;
  scene.add(fountainWater);

  const fountainGlow = new THREE.PointLight("#d9f9ff", 2.4, 12, 2.2);
  fountainGlow.position.set(0, 2.5, 0);
  scene.add(fountainGlow);

  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(4.2, 4.6, 0.5, 52),
    new THREE.MeshPhysicalMaterial({
      color: "#5bbfbc",
      roughness: 0.04,
      metalness: 0.06,
      transmission: 0.38,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.82
    })
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
  addStars();
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
      new THREE.ConeGeometry(2.8 + Math.random() * 3.2, 10 + Math.random() * 8, 16),
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
  environment.cloudMaterial = cloudMaterial;

  for (let index = 0; index < 11; index += 1) {
    const cloud = new THREE.Group();
    const puffCount = 3 + Math.floor(Math.random() * 2);
    for (let puffIndex = 0; puffIndex < puffCount; puffIndex += 1) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 0.7, 18, 16),
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

  // Night overrides the daytime drift entirely as nightMix approaches 1
  topColor.lerp(skyTopNight, state.nightMix);
  horizonColor.lerp(skyHorizonNight, state.nightMix);
  glowColor.lerp(skyGlowNight, state.nightMix);

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
    new THREE.MeshStandardMaterial({ color: "#cdb888", roughness: 0.9 })
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
      new THREE.CylinderGeometry(0.28 * scale, 0.46 * scale, 3.6 * scale, 14),
      new THREE.MeshStandardMaterial({ color: "#7d5b3f", roughness: 0.98 })
    );
    trunk.position.y = 1.8 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    const leafPalette = ["#8ab872", "#7ea767", "#a5c77f", "#93ba7f", "#6fa05c"];
    const clusters = [
      { y: 4.2, r: 1.9, ox: 0,    oz: 0 },
      { y: 5.0, r: 1.65, ox: 0.4,  oz: -0.2 },
      { y: 4.8, r: 1.55, ox: -0.45, oz: 0.3 },
      { y: 5.8, r: 1.4, ox: 0.2,  oz: 0.25 },
      { y: 6.4, r: 1.2, ox: -0.15, oz: -0.1 },
      { y: 7.0, r: 0.9, ox: 0.1,  oz: 0.1 }
    ];
    clusters.forEach((c, i) => {
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(c.r * scale, 14, 12),
        new THREE.MeshStandardMaterial({ color: leafPalette[i % leafPalette.length], roughness: 0.98 })
      );
      crown.scale.set(1, 0.82 + Math.random() * 0.14, 1);
      crown.position.set(c.ox * scale, c.y * scale, c.oz * scale);
      crown.castShadow = true;
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
        new THREE.SphereGeometry((0.55 - index * 0.08) * scale, 16, 14),
        new THREE.MeshStandardMaterial({ color, roughness: 0.96 })
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

    const seatMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 1.66, 6, 14),
      new THREE.MeshStandardMaterial({ color: "#7e5f42", roughness: 0.8 })
    );
    seatMesh.rotation.z = Math.PI / 2;
    seatMesh.scale.set(1, 0.24, 1.05);
    const seatGroup = new THREE.Group();
    seatGroup.position.y = 0.7;
    seatGroup.castShadow = true;
    seatGroup.add(seatMesh);
    bench.add(seatGroup);

    const backMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 1.66, 6, 14),
      new THREE.MeshStandardMaterial({ color: "#8b694a", roughness: 0.8 })
    );
    backMesh.rotation.z = Math.PI / 2;
    backMesh.scale.set(1, 0.22, 0.9);
    const backGroup = new THREE.Group();
    backGroup.position.set(0, 1.2, -0.28);
    backGroup.rotation.x = -0.22;
    backGroup.add(backMesh);
    bench.add(backGroup);

    [
      [-0.95, 0.32],
      [0.95, 0.32],
      [-0.95, -0.32],
      [0.95, -0.32]
    ].forEach(([px, pz]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.065, 0.7, 10),
        new THREE.MeshStandardMaterial({ color: "#4f4b46", roughness: 0.92 })
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

      const seatPad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.29, 0.3, 0.08, 20),
        new THREE.MeshStandardMaterial({ color: "#8f6d4d", roughness: 0.84 })
      );
      seatPad.position.y = 0.46;
      seatPad.castShadow = true;
      chair.add(seatPad);

      const backMesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 0.34, 6, 14),
        new THREE.MeshStandardMaterial({ color: "#9b7856", roughness: 0.84 })
      );
      backMesh.scale.set(1, 1, 0.16);
      const backGroup = new THREE.Group();
      backGroup.position.set(0, 0.72, -0.22);
      backGroup.rotation.x = tilt;
      backGroup.add(backMesh);
      chair.add(backGroup);

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
    [-15.6, -11.4],
    [13.8, 1.8],
    [-13.8, -1.8],
    [1.8, -13.8],
    [-1.8, 13.8]
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

    environment.lanternBulbs.push(bulb.material);
    environment.lanternGlows.push(glow);

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
  environment.firefliesMaterial = sparks.material;
}

function addStars() {
  const geometry = new THREE.BufferGeometry();
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    // Random points on the upper hemisphere of a large dome
    const azimuth = Math.random() * Math.PI * 2;
    const elevation = Math.asin(Math.random() * 0.92 + 0.08);
    const radius = 92;
    positions[index * 3] = Math.cos(azimuth) * Math.cos(elevation) * radius;
    positions[index * 3 + 1] = Math.sin(elevation) * radius;
    positions[index * 3 + 2] = Math.sin(azimuth) * Math.cos(elevation) * radius;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: "#e8f0ff",
      size: 0.9,
      map: createSoftParticleTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  scene.add(stars);
  environment.stars = stars;
  environment.starsMaterial = stars.material;
}

// Smoothly blends every registered light/material between day and night.
// Runs every frame; nightMix eases toward nightTarget (set by the HUD toggle).
function updateEnvironment(dt) {
  state.nightMix = THREE.MathUtils.lerp(state.nightMix, state.nightTarget, dt * 1.6);
  const n = state.nightMix;

  if (environment.hemi) {
    environment.hemi.intensity = THREE.MathUtils.lerp(1.4, 0.5, n);
    environment.hemi.color.copy(hemiSkyDay).lerp(hemiSkyNight, n);
    environment.hemi.groundColor.copy(hemiGroundDay).lerp(hemiGroundNight, n);
  }
  if (environment.sun) {
    environment.sun.intensity = THREE.MathUtils.lerp(2.2, 0.4, n);
    environment.sun.color.copy(sunDayColor).lerp(moonColor, n);
  }
  if (environment.fill) {
    environment.fill.intensity = THREE.MathUtils.lerp(0.55, 0.16, n);
  }

  scene.fog.color.copy(fogDayColor).lerp(fogNightColor, n);
  scene.fog.density = THREE.MathUtils.lerp(0.016, 0.021, n);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.22, 1.04, n);

  const lanternStrength = THREE.MathUtils.lerp(0.5, 2.8, n);
  environment.lanternBulbs.forEach((material) => {
    material.emissiveIntensity = lanternStrength;
  });
  environment.lanternGlows.forEach((glow) => {
    glow.intensity = THREE.MathUtils.lerp(0.55, 2.6, n);
  });

  if (environment.firefliesMaterial) {
    environment.firefliesMaterial.opacity = THREE.MathUtils.lerp(0.22, 0.85, n);
  }
  if (environment.cloudMaterial) {
    environment.cloudMaterial.opacity = THREE.MathUtils.lerp(0.26, 0.06, n);
  }
  if (environment.starsMaterial) {
    environment.starsMaterial.opacity = n * 0.9;
  }
  if (environment.stars) {
    environment.stars.position.copy(state.player.position);
  }
}

function toggleNight() {
  state.nightTarget = state.nightTarget === 1 ? 0 : 1;
  const isNight = state.nightTarget === 1;
  if (nightButton) {
    nightButton.classList.toggle("active", isNight);
    nightButton.setAttribute("aria-pressed", String(isNight));
  }
}

// ── Emotes: short-lived emoji sprites that float up from a resident ─────────
function getEmoteTexture(emoji) {
  if (emoteTextureCache.has(emoji)) {
    return emoteTextureCache.get(emoji);
  }
  const size = 128;
  const emoteCanvas = document.createElement("canvas");
  emoteCanvas.width = size;
  emoteCanvas.height = size;
  const context2d = emoteCanvas.getContext("2d");
  context2d.font = "96px serif";
  context2d.textAlign = "center";
  context2d.textBaseline = "middle";
  context2d.fillText(emoji, size / 2, size / 2 + 6);
  const texture = new THREE.CanvasTexture(emoteCanvas);
  emoteTextureCache.set(emoji, texture);
  return texture;
}

function spawnEmote(npc, emoji) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getEmoteTexture(emoji),
      transparent: true,
      depthWrite: false
    })
  );
  sprite.scale.setScalar(0.62);
  sprite.position.copy(npc.group.position);
  sprite.position.y += 2.75;
  scene.add(sprite);
  activeEmotes.push({ sprite, npc, born: state.currentTime });
}

function emoteFor(expertId, emoji) {
  const npc = npcMap.get(expertId);
  if (npc) {
    spawnEmote(npc, emoji);
  }
}

function updateEmotes() {
  const lifetime = 1.5;
  for (let index = activeEmotes.length - 1; index >= 0; index -= 1) {
    const emote = activeEmotes[index];
    const age = state.currentTime - emote.born;
    if (age >= lifetime) {
      scene.remove(emote.sprite);
      emote.sprite.material.dispose(); // texture stays cached for reuse
      activeEmotes.splice(index, 1);
      continue;
    }
    emote.sprite.position.x = emote.npc.group.position.x;
    emote.sprite.position.z = emote.npc.group.position.z;
    emote.sprite.position.y = emote.npc.group.position.y + 2.75 + age * 0.55;
    emote.sprite.material.opacity =
      age < 0.2 ? age / 0.2 : 1 - Math.max(0, (age - 0.9) / (lifetime - 0.9));
  }
}

// ── Minimap: top-down park map drawn on a 2D canvas every frame ─────────────
function updateMinimap() {
  if (!minimapContext) {
    return;
  }
  const size = minimapCanvas.width;
  const half = size / 2;
  const scale = (half - 10) / worldRadius;
  const ctx = minimapContext;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, half - 2, 0, Math.PI * 2);
  ctx.clip();

  // Ground: darkens with the night mix so the map matches the scene mood
  const n = state.nightMix;
  ctx.fillStyle = `rgba(${Math.round(58 - 40 * n)}, ${Math.round(96 - 70 * n)}, ${Math.round(64 - 38 * n)}, 0.9)`;
  ctx.fillRect(0, 0, size, size);

  // Ring path (annulus 12..16.4 in world units) and the two crossing paths
  ctx.strokeStyle = "rgba(205, 184, 136, 0.55)";
  ctx.lineWidth = 4.4 * scale;
  ctx.beginPath();
  ctx.arc(half, half, 14.2 * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 2.4 * scale;
  ctx.beginPath();
  ctx.moveTo(half, half - 11 * scale);
  ctx.lineTo(half, half + 11 * scale);
  ctx.moveTo(half - 11 * scale, half);
  ctx.lineTo(half + 11 * scale, half);
  ctx.stroke();

  // Fountain + pond landmarks
  ctx.fillStyle = "rgba(91, 191, 188, 0.85)";
  ctx.beginPath();
  ctx.arc(half, half, 3.1 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(half + -7.8 * scale, half + 4.6 * scale, 4.2 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Residents: accent dots, ringed when nearby/selected
  npcMap.forEach((resident) => {
    const x = half + resident.group.position.x * scale;
    const y = half + resident.group.position.z * scale;
    const active =
      resident.expert.id === state.nearbyId || resident.expert.id === state.selectedId;
    ctx.fillStyle = resident.expert.color;
    ctx.beginPath();
    ctx.arc(x, y, active ? 4.6 : 3.4, 0, Math.PI * 2);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  });

  // Player: white arrow rotated to the camera yaw (yaw 0 faces -z = map up)
  ctx.save();
  ctx.translate(
    half + state.player.position.x * scale,
    half + state.player.position.z * scale
  );
  ctx.rotate(-state.yaw);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3.2);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // Rim
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(half, half, half - 2, 0, Math.PI * 2);
  ctx.stroke();
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
  const { mode, model } = state.runtime;
  runtimeStatus.classList.remove("claude-active", "openai-active");
  if (mode === "claude" && model) {
    runtimeStatus.textContent = `Claude · ${model}`;
    runtimeStatus.classList.add("claude-active");
  } else if (mode === "openai" && model) {
    runtimeStatus.textContent = `OpenAI · ${model}`;
    runtimeStatus.classList.add("openai-active");
  } else {
    runtimeStatus.textContent = "Local prototype mode";
  }
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

  // Add user message to history and render immediately
  pushChatUser(expert.id, question);

  // Scope check — out-of-scope gets an instant local reply
  if (!isQuestionInScope(expert, question) && !(memory.length && looksLikeFollowUp(question))) {
    const answer = buildOutOfScopeAnswer(expert);
    pushChatExpert(expert.id, expert, answer);
    triggerBubble(expert.id, answer, 3.4);
    emoteFor(expert.id, "🤔");
    return;
  }

  // Local-only mode: simulate delay then reply from answer bank
  if (state.runtime.mode === "local") {
    showThinkingIndicator(expert);
    window.setTimeout(() => {
      removeThinkingIndicator();
      const answer = generateResponse(expert, question, memory);
      const clean = stripSpeakerPrefix(answer);
      pushChatExpert(expert.id, expert, clean);
      triggerBubble(expert.id, clean, 3.4);
      emoteFor(expert.id, "💡");
    }, 700);
    return;
  }

  // Streaming mode (claude or openai)
  lockChatInput(expert);

  let fullRawText = "";
  let streamNode = null;
  let streamBody = null;
  let streamTextEl = null;

  askExpertQuestionStream(
    { expertId: expert.id, question, history: memory },
    {
      onChunk(text) {
        fullRawText += text;
        if (!streamNode) {
          removeThinkingIndicator();
          const created = createStreamingMessage(expert);
          streamNode = created.node;
          streamBody = created.body;
          streamTextEl = created.textEl;
          conversationFeed.append(streamNode);
        }
        updateStreamText(streamTextEl, fullRawText);
        conversationFeed.scrollTop = conversationFeed.scrollHeight;
      },
      onDone({ answer }) {
        const finalAnswer = answer || finalizeExpertAnswer(fullRawText, expert);
        if (streamBody) {
          streamNode.classList.remove("streaming");
          finalizeStreamNode(streamBody, finalAnswer);
        } else {
          removeThinkingIndicator();
        }
        storeChatExpert(expert.id, expert, finalAnswer);
        triggerBubble(expert.id, finalAnswer, 3.4);
        emoteFor(expert.id, "✨");
        unlockChatInput(expert);
      },
      onError() {
        removeThinkingIndicator();
        if (streamNode) streamNode.remove();
        const answer = generateResponse(expert, question, memory);
        const clean = stripSpeakerPrefix(answer);
        pushChatExpert(expert.id, expert, clean);
        triggerBubble(expert.id, clean, 3.4);
        unlockChatInput(expert);
      }
    }
  );
}

function lockChatInput(expert) {
  chatInput.disabled = true;
  chatInput.placeholder = `${expert.name.split(" ")[0]} is thinking…`;
  sendButton.disabled = true;
  sendButton.classList.add("loading");
  resizeChatInput();
  showThinkingIndicator(expert);
}

function unlockChatInput(expert) {
  chatInput.disabled = false;
  sendButton.disabled = false;
  sendButton.classList.remove("loading");
  updateChatPlaceholder(state.selectedId === expert.id ? expert : getSelectedResident());
}

function createStreamingMessage(expert) {
  const node = document.createElement("article");
  node.className = "conversation-message expert streaming";

  const meta = document.createElement("span");
  meta.className = "conversation-meta";
  meta.textContent = expert.name.split(" ")[0];

  const body = document.createElement("div");
  body.className = "conversation-body";

  const textEl = document.createElement("p");
  textEl.className = "conversation-line";

  const cursor = document.createElement("span");
  cursor.className = "streaming-cursor";
  textEl.append(cursor);

  body.append(textEl);
  node.append(meta, body);
  return { node, body, textEl };
}

function updateStreamText(textEl, fullText) {
  const cursor = textEl.querySelector(".streaming-cursor");
  textEl.textContent = fullText;
  if (cursor) textEl.append(cursor);
}

function finalizeStreamNode(bodyEl, finalText) {
  bodyEl.replaceChildren();
  renderConversationBody(bodyEl, finalText);
}

// Pushes a user message to history and re-renders the conversation feed
function pushChatUser(expertId, text) {
  const history = state.chatHistory.get(expertId) ?? [];
  history.push({ role: "user", text });
  state.chatHistory.set(expertId, trimConversationHistory(history));
  if (state.selectedId === expertId) renderConversation(expertId);
}

// Pushes a finalized expert message to history and re-renders
function pushChatExpert(expertId, expert, finalText) {
  const history = state.chatHistory.get(expertId) ?? [];
  history.push({ role: "expert", text: `${expert.name}: ${finalText}` });
  state.chatHistory.set(expertId, trimConversationHistory(history));
  if (state.selectedId === expertId) renderConversation(expertId);
}

// Pushes expert message to history WITHOUT re-rendering (streaming node already in DOM)
function storeChatExpert(expertId, expert, finalText) {
  const history = state.chatHistory.get(expertId) ?? [];
  history.push({ role: "expert", text: `${expert.name}: ${finalText}` });
  state.chatHistory.set(expertId, trimConversationHistory(history));
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
      waveUntil: 0,
      walkCycle: Math.random() * Math.PI * 2,
      pulseOffset: Math.random() * Math.PI * 2,
      // Per-NPC personality (0–1) drives walk speed, swing amplitude, idle style
      personality: Math.random(),
      // Layered noise seeds for non-repeating idle head movement
      idleSeed1: Math.random() * 100,
      idleSeed2: Math.random() * 100,
      idleSeed3: Math.random() * 100,
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
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  bodyPivot.position.y = 0.93;
  root.add(bodyPivot);

  const shellColor = mixColor("#eef0f4", expert.color, 0.07);
  const underColor = mixColor("#2a2e36", expert.color, 0.10);
  const jointColor = "#1c1f26";

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: shellColor,
    roughness: 0.32,
    metalness: 0.18
  });
  const underMaterial = new THREE.MeshStandardMaterial({
    color: underColor,
    roughness: 0.55,
    metalness: 0.35
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: jointColor,
    roughness: 0.45,
    metalness: 0.5
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: expert.color,
    roughness: 0.35,
    metalness: 0.25,
    emissive: expert.color,
    emissiveIntensity: 0.35
  });
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: mixColor(expert.color, "#ffffff", 0.45),
    roughness: 0.2,
    metalness: 0,
    emissive: expert.color,
    emissiveIntensity: 1.1
  });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: "#0c0f14",
    roughness: 0.12,
    metalness: 0.65
  });

  // ── Body: pelvis + tapered torso, all overlapping so there are no seams ──
  const pelvis = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.20, 0.14, 8, 18),
    underMaterial
  );
  pelvis.scale.set(1.18, 0.9, 0.92);
  pelvis.position.y = -0.02;
  bodyPivot.add(pelvis);

  const waistRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.215, 0.028, 10, 28),
    accentMaterial
  );
  waistRing.rotation.x = Math.PI / 2;
  waistRing.position.y = 0.14;
  waistRing.scale.set(1.08, 0.9, 1);
  bodyPivot.add(waistRing);

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.44, 8, 22),
    shellMaterial
  );
  torso.scale.set(1.12, 1.06, 0.84);
  torso.position.y = 0.52;
  bodyPivot.add(torso);

  // Chest core: recessed dark dish + glowing emblem
  const coreDish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.125, 0.05, 24),
    jointMaterial
  );
  coreDish.rotation.x = Math.PI / 2;
  coreDish.position.set(0, 0.60, 0.20);
  bodyPivot.add(coreDish);

  const coreGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.062, 0.062, 0.06, 22),
    glowMaterial
  );
  coreGlow.rotation.x = Math.PI / 2;
  coreGlow.position.set(0, 0.60, 0.208);
  bodyPivot.add(coreGlow);

  const coreRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.014, 10, 26),
    accentMaterial
  );
  coreRing.position.set(0, 0.60, 0.226);
  bodyPivot.add(coreRing);

  // Collar and neck
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.155, 0.185, 0.09, 20),
    underMaterial
  );
  collar.position.set(0, 0.94, 0.01);
  bodyPivot.add(collar);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 0.20, 14),
    jointMaterial
  );
  neck.position.set(0, 1.04, 0.01);
  bodyPivot.add(neck);

  // ── Head: rounded helmet + glossy visor + glowing eyes ──
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.01, 0.02);
  bodyPivot.add(headPivot);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 26, 22),
    shellMaterial
  );
  head.scale.set(1.0, 0.96, 0.94);
  head.position.y = 0.34;
  headPivot.add(head);

  // Visor: dark glass band inset into the front of the helmet
  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.215, 24, 20),
    visorMaterial
  );
  visor.scale.set(0.84, 0.58, 0.52);
  visor.position.set(0, 0.35, 0.135);
  headPivot.add(visor);

  // Eyes: soft glowing capsules on the visor
  [-0.085, 0.085].forEach((x) => {
    const eye = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.026, 0.028, 6, 12),
      glowMaterial
    );
    eye.scale.set(1, 0.9, 0.5);
    eye.position.set(x, 0.355, 0.252);
    headPivot.add(eye);
  });

  // Chin guard closes the gap between visor and neck
  const chin = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 18, 14),
    underMaterial
  );
  chin.scale.set(1.06, 0.6, 0.78);
  chin.position.set(0, 0.185, 0.06);
  headPivot.add(chin);

  // Side audio discs
  [-0.255, 0.255].forEach((x) => {
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.062, 0.035, 18),
      jointMaterial
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.set(x, 0.34, 0.0);
    headPivot.add(disc);

    const discGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.042, 14),
      accentMaterial
    );
    discGlow.rotation.z = Math.PI / 2;
    discGlow.position.set(x, 0.34, 0.0);
    headPivot.add(discGlow);
  });

  // Antenna with glowing tip — skipped for attire kits that wear a hat
  const wearsHat = ["designer", "mentor", "builder"].includes(expert.attire);
  if (!wearsHat) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.016, 0.16, 8),
      jointMaterial
    );
    antenna.position.set(0.12, 0.63, -0.04);
    antenna.rotation.z = -0.14;
    headPivot.add(antenna);

    const antennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 10),
      glowMaterial
    );
    antennaTip.position.set(0.131, 0.715, -0.04);
    headPivot.add(antennaTip);
  }

  addRobotAttire(expert.attire, bodyPivot, headPivot, {
    shellMaterial,
    underMaterial,
    jointMaterial,
    accentMaterial,
    glowMaterial
  });

  const leftArm = buildRobotArm(-1, shellMaterial, jointMaterial, accentMaterial);
  const rightArm = buildRobotArm(1, shellMaterial, jointMaterial, accentMaterial);
  bodyPivot.add(leftArm.pivot);
  bodyPivot.add(rightArm.pivot);

  const leftLeg = buildRobotLeg(-1, shellMaterial, jointMaterial, underMaterial, accentMaterial);
  const rightLeg = buildRobotLeg(1, shellMaterial, jointMaterial, underMaterial, accentMaterial);
  root.add(leftLeg.pivot);
  root.add(rightLeg.pivot);

  // Status halo: flat glowing ring hovering above the head
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.016, 10, 40),
    new THREE.MeshStandardMaterial({
      color: expert.color,
      emissive: expert.color,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.7,
      roughness: 0.4,
      metalness: 0.1,
      depthWrite: false
    })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.set(0, 1.86, 0.02);
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

// Each expert wears a small themed kit so the six robots read differently at a
// glance. All pieces are cheap primitives sharing the avatar's materials.
function addRobotAttire(kit, bodyPivot, headPivot, materials) {
  const { underMaterial, jointMaterial, accentMaterial, glowMaterial } = materials;

  if (kit === "visionary") {
    // Architect: shoulder mantle, short cape, thin data-crown around the helmet
    [-0.44, 0.44].forEach((x) => {
      const mantle = new THREE.Mesh(
        new THREE.SphereGeometry(0.155, 16, 12),
        underMaterial
      );
      mantle.scale.set(1.12, 0.5, 1.02);
      mantle.position.set(x, 0.905, 0.01);
      bodyPivot.add(mantle);
    });

    const cape = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.72, 0.028),
      underMaterial
    );
    cape.position.set(0, 0.50, -0.255);
    cape.rotation.x = 0.10;
    bodyPivot.add(cape);

    const capeHem = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.05, 0.032),
      accentMaterial
    );
    capeHem.position.set(0, 0.155, -0.286);
    capeHem.rotation.x = 0.10;
    bodyPivot.add(capeHem);

    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.225, 0.016, 8, 32),
      accentMaterial
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 0.50, 0);
    headPivot.add(crown);
  }

  if (kit === "designer") {
    // UX designer: tilted beret and a knotted accent scarf
    const beret = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 18, 14),
      underMaterial
    );
    beret.scale.set(1.3, 0.5, 1.3);
    beret.position.set(-0.045, 0.575, 0.0);
    beret.rotation.z = 0.20;
    headPivot.add(beret);

    const beretStem = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 10, 8),
      accentMaterial
    );
    beretStem.position.set(-0.075, 0.665, 0.0);
    headPivot.add(beretStem);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.036, 10, 22),
      accentMaterial
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0, 1.0, 0.01);
    bodyPivot.add(scarf);

    const scarfTail = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.22, 0.03),
      accentMaterial
    );
    scarfTail.position.set(0.085, 0.865, 0.175);
    scarfTail.rotation.x = 0.14;
    bodyPivot.add(scarfTail);
  }

  if (kit === "racer") {
    // Motion engineer: aero head fin, twin back thrusters with glow tips
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, 0.15, 0.30),
      accentMaterial
    );
    fin.position.set(0, 0.58, -0.06);
    fin.rotation.x = -0.16;
    headPivot.add(fin);

    [-0.14, 0.14].forEach((x) => {
      const thruster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.066, 0.24, 12),
        jointMaterial
      );
      thruster.position.set(x, 0.62, -0.245);
      thruster.rotation.x = 0.12;
      bodyPivot.add(thruster);

      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        glowMaterial
      );
      flame.position.set(x, 0.49, -0.262);
      bodyPivot.add(flame);
    });

    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.024, 0.03),
      accentMaterial
    );
    brow.position.set(0, 0.475, 0.205);
    headPivot.add(brow);
  }

  if (kit === "host") {
    // Community lead: bow tie and an over-head headphone band
    const bowKnot = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 10, 8),
      accentMaterial
    );
    bowKnot.position.set(0, 0.915, 0.165);
    bodyPivot.add(bowKnot);

    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.10, 10),
        accentMaterial
      );
      wing.rotation.z = side * (Math.PI / 2);
      wing.position.set(side * 0.072, 0.915, 0.16);
      bodyPivot.add(wing);
    });

    // Torus arc (0..PI) sits in the XY plane — an ear-to-ear band over the helmet
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.275, 0.026, 8, 24, Math.PI),
      jointMaterial
    );
    band.position.set(0, 0.34, 0.0);
    headPivot.add(band);
  }

  if (kit === "mentor") {
    // Knowledge mentor: mortarboard with tassel and round scholar glasses
    const capBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.185, 0.10, 18),
      underMaterial
    );
    capBase.position.set(0, 0.565, 0);
    headPivot.add(capBase);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.032, 0.5),
      underMaterial
    );
    board.position.set(0, 0.625, 0);
    board.rotation.y = Math.PI / 4;
    headPivot.add(board);

    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
      accentMaterial
    );
    button.position.set(0, 0.65, 0);
    headPivot.add(button);

    const tassel = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.16, 0.022),
      accentMaterial
    );
    tassel.position.set(0.235, 0.56, 0.235);
    headPivot.add(tassel);

    [-0.085, 0.085].forEach((x) => {
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.052, 0.011, 8, 20),
        jointMaterial
      );
      rim.position.set(x, 0.355, 0.252);
      headPivot.add(rim);
    });

    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.012, 0.012),
      jointMaterial
    );
    bridge.position.set(0, 0.365, 0.252);
    headPivot.add(bridge);
  }

  if (kit === "builder") {
    // Prototype builder: hard hat with brim and a tool belt with pouches
    const hatDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.235, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
      accentMaterial
    );
    hatDome.scale.set(1.08, 0.9, 1.08);
    hatDome.position.set(0, 0.42, 0);
    headPivot.add(hatDome);

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.30, 0.315, 0.028, 24),
      accentMaterial
    );
    brim.position.set(0, 0.51, 0.02);
    headPivot.add(brim);

    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(0.235, 0.042, 10, 26),
      underMaterial
    );
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.12, 0.95, 1);
    belt.position.set(0, 0.075, 0);
    bodyPivot.add(belt);

    [-0.195, 0.195].forEach((x) => {
      const pouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.11, 0.055),
        jointMaterial
      );
      pouch.position.set(x, 0.03, 0.155);
      bodyPivot.add(pouch);
    });
  }
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

function buildRobotArm(side, shellMaterial, jointMaterial, accentMaterial) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.42, 0.82, 0.01);
  pivot.rotation.z = side < 0 ? 0.09 : -0.09;

  // Shoulder pad: dark ball joint capped by a shell dome
  const shoulderJoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 16, 14),
    jointMaterial
  );
  pivot.add(shoulderJoint);

  const shoulderPad = new THREE.Mesh(
    new THREE.SphereGeometry(0.125, 18, 14),
    shellMaterial
  );
  shoulderPad.scale.set(1, 0.82, 0.92);
  shoulderPad.position.set(side * 0.02, 0.03, 0);
  pivot.add(shoulderPad);

  // Upper arm: R=0.072, L=0.24 → half-extent 0.192, center -0.26 → spans -0.068..-0.452
  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.072, 0.24, 8, 16),
    shellMaterial
  );
  upperArm.position.y = -0.26;
  pivot.add(upperArm);

  // Forearm group pivots at the elbow (-0.452); dark elbow ball hides the hinge
  const forearm = new THREE.Group();
  forearm.position.y = -0.452;
  pivot.add(forearm);

  const elbow = new THREE.Mesh(
    new THREE.SphereGeometry(0.082, 14, 12),
    jointMaterial
  );
  forearm.add(elbow);

  // Forearm: R=0.066, L=0.20 → half-extent 0.166; top flush with elbow origin
  const lowerArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.066, 0.20, 8, 16),
    shellMaterial
  );
  lowerArm.position.y = -0.166;
  forearm.add(lowerArm);

  // Accent wrist ring, then a dark mitt overlapping the forearm bottom (-0.332)
  const wristRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.014, 8, 20),
    accentMaterial
  );
  wristRing.rotation.x = Math.PI / 2;
  wristRing.position.y = -0.318;
  forearm.add(wristRing);

  const hand = new THREE.Mesh(
    new THREE.SphereGeometry(0.078, 14, 12),
    jointMaterial
  );
  hand.scale.set(0.86, 1.0, 0.72);
  hand.position.set(0, -0.392, 0.016);
  forearm.add(hand);

  return { pivot, forearm };
}

function buildRobotLeg(side, shellMaterial, jointMaterial, underMaterial, accentMaterial) {
  const pivot = new THREE.Group();
  pivot.position.set(side * 0.16, 0.90, 0.01);

  // Hip ball joint at the pivot, tucked into the pelvis
  const hip = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 16, 14),
    jointMaterial
  );
  hip.position.y = -0.02;
  pivot.add(hip);

  // Thigh: R=0.095, L=0.22 → half-extent 0.205, center -0.245 → spans -0.04..-0.45
  const thigh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.095, 0.22, 8, 16),
    shellMaterial
  );
  thigh.position.y = -0.245;
  pivot.add(thigh);

  // Shin group pivots at the knee (-0.45 → global 0.45); knee ball hides the hinge
  const shin = new THREE.Group();
  shin.position.y = -0.45;
  pivot.add(shin);

  const knee = new THREE.Mesh(
    new THREE.SphereGeometry(0.088, 14, 12),
    jointMaterial
  );
  shin.add(knee);

  // Lower leg: R=0.078, L=0.17 → half-extent 0.163; top flush with knee origin.
  // Bottom at -0.326 from knee → ankle at global 0.90 - 0.45 - 0.326 ≈ 0.124
  const lowerLeg = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.078, 0.17, 8, 16),
    shellMaterial
  );
  lowerLeg.position.y = -0.163;
  shin.add(lowerLeg);

  // Ankle ball overlaps both the shin bottom and the boot — no gap at the ankle
  const ankle = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 14, 12),
    jointMaterial
  );
  ankle.position.set(0, -0.326, 0.0);
  shin.add(ankle);

  const ankleRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.066, 0.013, 8, 18),
    accentMaterial
  );
  ankleRing.rotation.x = Math.PI / 2;
  ankleRing.position.set(0, -0.30, 0.0);
  shin.add(ankleRing);

  // Boot: rounded shell wedge whose sole sits exactly on the ground.
  // Center -0.385, vertical half-extent ≈ 0.065 → sole at -0.45 → global 0.0 ✓
  const boot = new THREE.Mesh(
    new THREE.SphereGeometry(0.098, 18, 14),
    underMaterial
  );
  boot.scale.set(1.12, 0.66, 1.62);
  boot.position.set(0, -0.385, 0.055);
  shin.add(boot);

  const bootCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 14, 12),
    shellMaterial
  );
  bootCap.scale.set(1.15, 0.62, 1.1);
  bootCap.position.set(0, -0.378, 0.155);
  shin.add(bootCap);

  return { pivot, shin };
}

function attachEvents() {
  window.addEventListener("resize", handleResize);
  if (nightButton) {
    nightButton.addEventListener("click", toggleNight);
  }
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
    if (event.code === "KeyN" && !event.repeat) {
      toggleNight();
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
  updateEnvironment(dt);
  updateSkyBackdrop();
  updateResidents(dt);
  updateEmotes();
  updateNearbyResident();
  updateInspector();
  updateOverlayPositions();
  updateMinimap();

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

// Rotates current toward target along the shortest arc — lerping raw angles
// spins the long way around whenever the difference crosses ±PI.
function lerpAngle(current, target, factor) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * Math.min(1, factor);
}

function updateResidents(dt) {
  npcMap.forEach((resident) => {
    // Engaged residents (waving, nearby, or selected) stop wandering and
    // square their whole body toward the player instead of just the head.
    const engaged =
      state.currentTime < resident.waveUntil ||
      resident.expert.id === state.nearbyId ||
      resident.expert.id === state.selectedId;

    let moving = 0;
    if (engaged) {
      resident.wanderTarget.copy(resident.group.position);
      tempVector.copy(state.player.position).sub(resident.group.position);
      if (tempVector.lengthSq() > 0.0001) {
        resident.group.rotation.y = lerpAngle(
          resident.group.rotation.y,
          Math.atan2(tempVector.x, tempVector.z),
          dt * 7
        );
      }
    } else {
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
        resident.group.rotation.y = lerpAngle(
          resident.group.rotation.y,
          Math.atan2(tempVector.x, tempVector.z),
          dt * 4
        );
        moving = 1;
      }
    }
    // Each NPC walks at a slightly different cadence driven by their personality
    const walkRate = moving ? (5.6 + resident.personality * 2.6) : 0;
    resident.walkCycle += dt * walkRate;

    const phase = resident.walkCycle;
    const t = state.currentTime;
    const p = resident.personality;

    // ── WALKING: proper counter-rotation gait ──────────────────────────────
    // Right leg forward → left arm forward (crossed counter-swing)
    const rightLegSwing = Math.sin(phase) * moving;
    const leftLegSwing  = Math.sin(phase + Math.PI) * moving;
    const swingAmp = 0.28 + p * 0.18;
    // Arms counter-swing to the OPPOSITE leg
    const rightArmTarget = Math.sin(phase + Math.PI) * swingAmp * moving;
    const leftArmTarget  = Math.sin(phase)           * swingAmp * moving;

    // Forearm bends more on the backswing for a natural elbow fold
    const leftForearmBend  = 0.16 + Math.max(0,  leftArmTarget) * 0.34;
    const rightForearmBend = 0.16 + Math.max(0, rightArmTarget) * 0.34;
    // Shin kicks back as foot pushes off
    const leftShinBend  = Math.max(0, -leftLegSwing)  * 0.60;
    const rightShinBend = Math.max(0, -rightLegSwing) * 0.60;

    // Body: double-frequency bounce, lateral sway, slight forward lean
    const walkBob  = Math.abs(Math.cos(phase)) * moving * 0.046;
    const hipSway  = Math.sin(phase) * moving * 0.030;
    const fwdLean  = moving * 0.068;
    const shRotY   = Math.sin(phase) * moving * 0.044;  // shoulder twists opposite to hips

    // ── IDLE: layered compound sine = never perfectly repeating ───────────
    // Breathing lift (slow)
    const breathY    = Math.sin(t * 0.55 + resident.idleSeed1) * (1 - moving) * 0.005;
    // Weight shift left–right (medium speed)
    const weightX    = Math.sin(t * 0.31 + resident.idleSeed2) * (1 - moving) * 0.024;
    // Micro-sway forward–back (different frequency)
    const microTiltZ = Math.sin(t * 0.22 + resident.idleSeed3) * (1 - moving) * 0.014;
    // Gentle arm drift — each arm on its own offset so they're asynchronous
    const leftArmDrift  = (Math.sin(t * 0.38 + resident.idleSeed1) * 0.04
                         + Math.sin(t * 0.61 + resident.idleSeed2) * 0.02) * (1 - moving);
    const rightArmDrift = (Math.sin(t * 0.41 + resident.idleSeed2) * 0.04
                         + Math.sin(t * 0.57 + resident.idleSeed3) * 0.02) * (1 - moving);

    // ── COMBINE ────────────────────────────────────────────────────────────
    resident.root.position.y = walkBob + breathY;
    resident.bodyPivot.position.x = THREE.MathUtils.lerp(resident.bodyPivot.position.x, hipSway + weightX, dt * 7);
    resident.bodyPivot.rotation.x = THREE.MathUtils.lerp(resident.bodyPivot.rotation.x, -fwdLean, dt * 5);
    resident.bodyPivot.rotation.z = THREE.MathUtils.lerp(resident.bodyPivot.rotation.z, moving ? -Math.sin(phase) * 0.033 : microTiltZ, dt * 7);
    resident.bodyPivot.rotation.y = THREE.MathUtils.lerp(resident.bodyPivot.rotation.y, shRotY, dt * 5);

    resident.leftArmPivot.rotation.x  = THREE.MathUtils.lerp(resident.leftArmPivot.rotation.x,  leftArmTarget  - 0.10 + leftArmDrift,  dt * 10);
    resident.leftForearm.rotation.x   = THREE.MathUtils.lerp(resident.leftForearm.rotation.x,  leftForearmBend,  dt * 10);

    // Greeting wave overrides the right arm: raise it sideways, rock the forearm.
    // Positive Z swings the +x arm OUTWARD — negative would fold it through the body.
    if (state.currentTime < resident.waveUntil) {
      resident.rightArmPivot.rotation.x = THREE.MathUtils.lerp(resident.rightArmPivot.rotation.x, 0, dt * 10);
      resident.rightArmPivot.rotation.z = THREE.MathUtils.lerp(resident.rightArmPivot.rotation.z, 2.25, dt * 9);
      resident.rightForearm.rotation.x  = THREE.MathUtils.lerp(resident.rightForearm.rotation.x, 0.12, dt * 10);
      resident.rightForearm.rotation.z  = Math.sin(t * 11) * 0.38;
    } else {
      resident.rightArmPivot.rotation.x = THREE.MathUtils.lerp(resident.rightArmPivot.rotation.x, rightArmTarget - 0.10 + rightArmDrift, dt * 10);
      resident.rightArmPivot.rotation.z = THREE.MathUtils.lerp(resident.rightArmPivot.rotation.z, -0.09, dt * 9);
      resident.rightForearm.rotation.x  = THREE.MathUtils.lerp(resident.rightForearm.rotation.x, rightForearmBend, dt * 10);
      resident.rightForearm.rotation.z  = THREE.MathUtils.lerp(resident.rightForearm.rotation.z, 0, dt * 9);
    }

    resident.leftLegPivot.rotation.x  = THREE.MathUtils.lerp(resident.leftLegPivot.rotation.x,  leftLegSwing  * 0.50, dt * 11);
    resident.rightLegPivot.rotation.x = THREE.MathUtils.lerp(resident.rightLegPivot.rotation.x, rightLegSwing * 0.50, dt * 11);
    resident.leftShin.rotation.x      = THREE.MathUtils.lerp(resident.leftShin.rotation.x,  leftShinBend,  dt * 11);
    resident.rightShin.rotation.x     = THREE.MathUtils.lerp(resident.rightShin.rotation.x, rightShinBend, dt * 11);
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

    // Layered idle head look-around — three sine waves at co-prime-ish ratios
    // so the pattern never repeats on any human-perceptible timescale
    const idleHeadYaw = (
      Math.sin(t * 0.19 + resident.idleSeed1 * 3.1) * 0.22 +
      Math.sin(t * 0.43 + resident.idleSeed2 * 1.7) * 0.12 +
      Math.sin(t * 0.71 + resident.idleSeed3 * 2.3) * 0.06
    ) * (1 - headWeight);
    const idleHeadPitch = (
      Math.sin(t * 0.27 + resident.idleSeed1 * 2.4) * 0.07 +
      Math.sin(t * 0.53 + resident.idleSeed3 * 1.1) * 0.04
    ) * (1 - headWeight);

    resident.headPivot.rotation.y = THREE.MathUtils.lerp(
      resident.headPivot.rotation.y,
      desiredHeadYaw * headWeight + idleHeadYaw,
      dt * 4.6
    );
    resident.headPivot.rotation.x = THREE.MathUtils.lerp(
      resident.headPivot.rotation.x,
      desiredHeadPitch * headWeight + idleHeadPitch,
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
    if (newNearbyId) {
      // Greet the approaching player with a wave and a floating emote
      const npc = npcMap.get(newNearbyId);
      npc.waveUntil = state.currentTime + 1.9;
      spawnEmote(npc, "👋");
    }
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
      ? "W forward, S back, A left, D right. O info, Q chat."
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
    if (qaTitle) qaTitle.textContent = "Ask. Stream. Understand.";
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
  focusChatButton.textContent = `Chat with ${resident.name.split(" ")[0]}`;
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
  if (qaTitle) {
    qaTitle.textContent = `Ask ${expert.name.split(" ")[0]} directly`;
  }
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
