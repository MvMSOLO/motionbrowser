import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGLRenderer,
  type ColorSpace,
  type Material,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type ModelTier = "high" | "balanced" | "low";
export type SceneMode = "portal" | "browsing" | "calibrating";

export type ObservatoryController = {
  setReducedMotion: (value: boolean) => void;
  setOrientation: (pitchDeg: number, rollDeg: number) => void;
  setMode: (mode: SceneMode) => void;
  pulse: () => void;
  resize: () => void;
  dispose: () => void;
};

type Profile = { renderScaleCap: number; particles: number; modelTier: string };

type SceneConfig = {
  camera: { position: number[]; lookAt: number[]; fovPortrait: number; fovLandscape: number };
  fog: { color: string; density: number };
  exposure: number;
  placements: Record<string, { position: number[]; rotation: number[] }>;
};

const PLACEMENTS: SceneConfig["placements"] = {
  portalRing: { position: [0, 1.18, 0], rotation: [Math.PI / 2, 0, 0] },
  portalFrame: { position: [0, 1.16, 0.08], rotation: [0, 0, 0] },
  portalCore: { position: [0, 1.16, -0.06], rotation: [Math.PI / 2, 0, 0] },
  browserFrame: { position: [0, 1.16, 0.18], rotation: [0, 0, 0] },
  browserCorners: { position: [0, 1.16, 0.22], rotation: [0, 0, 0] },
  sideRails: { position: [0, 1.16, 0.2], rotation: [0, 0, 0] },
  orb: { position: [0, 0.28, 1.9], rotation: [0, 0, 0] },
  compass: { position: [0.46, 0.28, 1.9], rotation: [Math.PI / 2, 0, 0] },
  marker: { position: [0, 1.18, 0.62], rotation: [Math.PI / 2, 0, 0] },
  shards: { position: [0, 1.18, 0.1], rotation: [0, 0, 0] },
  lights: { position: [0, 0, 0], rotation: [0, 0, 0] },
};

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Missing ${url}`);
  return response.json() as Promise<T>;
}

function loadTexture(loader: TextureLoader, url: string, colorSpace: ColorSpace, fallback: Texture): Promise<Texture> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.anisotropy = 4;
        resolve(texture);
      },
      undefined,
      () => resolve(fallback),
    );
  });
}

function place(root: Object3D, name: string, placement: { position: number[]; rotation: number[] } | undefined) {
  const target = root.getObjectByName(name) ?? root;
  if (!placement) return target;
  target.position.set(placement.position[0], placement.position[1], placement.position[2]);
  target.rotation.set(placement.rotation[0], placement.rotation[1], placement.rotation[2]);
  return target;
}

function paint(root: Object3D, name: string, material: Material) {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh && mesh.name === name) mesh.material = material;
  });
}

export async function mountObservatory(
  canvas: HTMLCanvasElement,
  options: { profile: ModelTier; reducedMotion: boolean; onFailure: (message: string) => void; onFps?: (fps: number) => void },
): Promise<ObservatoryController> {
  const gl = canvas.getContext("webgl", {
    antialias: options.profile !== "low",
    alpha: false,
    powerPreference: options.profile === "low" ? "low-power" : "default",
    failIfMajorPerformanceCaveat: false,
  });
  if (!gl) {
    options.onFailure("WebGL is not available. The 2D shell is still usable.");
    throw new Error("WebGL is not available");
  }
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      context: gl,
      antialias: options.profile !== "low",
    });
  } catch (error) {
    options.onFailure(error instanceof Error ? error.message : "WebGL failed to start");
    throw error;
  }

  const [profiles, defaults, idle, shaders, fallbackTexture] = await Promise.all([
    readJson<Record<string, Profile>>("/motion/config/performance-profiles.json"),
    readJson<SceneConfig>("/motion/config/scene-defaults.json"),
    readJson<{ durationMs: number }>("/motion/animations/scene_idle.json"),
    Promise.all([
      fetch("/motion/shaders/portal_vertex.glsl").then((r) => r.text()),
      fetch("/motion/shaders/portal_fragment.glsl").then((r) => r.text()),
      fetch("/motion/shaders/glass_vertex.glsl").then((r) => r.text()),
      fetch("/motion/shaders/glass_fragment.glsl").then((r) => r.text()),
      fetch("/motion/shaders/atmosphere_vertex.glsl").then((r) => r.text()),
      fetch("/motion/shaders/atmosphere_fragment.glsl").then((r) => r.text()),
      fetch("/motion/shaders/transition_vertex.glsl").then((r) => r.text()),
      fetch("/motion/shaders/transition_fragment.glsl").then((r) => r.text()),
    ]),
    new Promise<Texture>((resolve, reject) => {
      new TextureLoader().load("/motion/textures/fallback/texture_fallback.png", resolve, undefined, reject);
    }),
  ]);

  const profile = profiles[options.profile] ?? profiles.balanced;
  const placements = { ...PLACEMENTS, ...defaults.placements };
  // portal_core.glb is a disc in its local XZ plane. A zero rotation leaves it
  // flat, like a lid, instead of filling the vertical portal opening.
  placements.portalCore = {
    ...placements.portalCore,
    rotation: [Math.PI / 2, 0, 0],
  };
  fallbackTexture.colorSpace = NoColorSpace;
  const textureLoader = new TextureLoader();
  const [floorColor, floorRough, floorNormal, sky, metalColor, metalRough, glassNoise, carbon] = await Promise.all([
    loadTexture(textureLoader, "/motion/textures/environment/floor_basecolor.png", SRGBColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/environment/floor_roughness.png", NoColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/environment/floor_normal.png", NoColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/environment/distant_sky.png", SRGBColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/materials/brushed_metal_basecolor.png", SRGBColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/materials/brushed_metal_roughness.png", NoColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/materials/glass_noise.png", NoColorSpace, fallbackTexture),
    loadTexture(textureLoader, "/motion/textures/materials/carbon_detail.png", SRGBColorSpace, fallbackTexture),
  ]);

  const [portalVs, portalFs, glassVs, glassFs, atmoVs, atmoFs, transVs, transFs] = shaders;
  const portalMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: options.reducedMotion ? 0.35 : 0.85 } },
    vertexShader: portalVs,
    fragmentShader: portalFs,
    transparent: true,
    depthWrite: false,
  });
  const glassMaterial = new ShaderMaterial({
    uniforms: { uNoise: { value: glassNoise }, uIntensity: { value: 0.8 } },
    vertexShader: glassVs,
    fragmentShader: glassFs,
    transparent: true,
    depthWrite: false,
  });
  const atmosphereMaterial = new ShaderMaterial({
    uniforms: { uSky: { value: sky } },
    vertexShader: atmoVs,
    fragmentShader: atmoFs,
    side: BackSide,
    depthWrite: false,
  });
  const transitionMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 2 }, uNoise: { value: glassNoise } },
    vertexShader: transVs,
    fragmentShader: transFs,
    transparent: true,
    depthWrite: false,
  });

  const scene = new Scene();
  scene.fog = new FogExp2(new Color(defaults.fog.color), defaults.fog.density);
  scene.background = new Color(defaults.fog.color);
  const camera = new PerspectiveCamera(defaults.camera.fovPortrait, 1, 0.1, 80);
  camera.position.set(defaults.camera.position[0], defaults.camera.position[1], defaults.camera.position[2]);
  const look = defaults.camera.lookAt;
  camera.lookAt(look[0], look[1], look[2]);

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = defaults.exposure;
  renderer.setClearColor(defaults.fog.color, 1);

  const gltfLoader = new GLTFLoader();
  const environmentUrl = profile.modelTier === "low" ? "/motion/environment/environment_low.glb" : "/motion/environment/motion_observatory.glb";
  const [environment, portalRing, portalFrame, portalCore, browserFrame, corners, rails, orb, compass, marker, shards, lights] = await Promise.all([
    gltfLoader.loadAsync(environmentUrl),
    gltfLoader.loadAsync("/motion/models/portal/portal_ring.glb"),
    gltfLoader.loadAsync("/motion/models/portal/portal_frame.glb"),
    gltfLoader.loadAsync("/motion/models/portal/portal_core.glb"),
    gltfLoader.loadAsync("/motion/models/browser/browser_frame.glb"),
    gltfLoader.loadAsync("/motion/models/browser/browser_corner_detail.glb"),
    gltfLoader.loadAsync("/motion/models/browser/browser_side_rail.glb"),
    gltfLoader.loadAsync("/motion/models/controls/gesture_orb.glb"),
    gltfLoader.loadAsync("/motion/models/controls/orientation_compass.glb"),
    gltfLoader.loadAsync("/motion/models/controls/calibration_marker.glb"),
    gltfLoader.loadAsync("/motion/models/effects/transition_shards.glb"),
    gltfLoader.loadAsync("/motion/models/effects/soft_light_rig.glb"),
  ]);

  const floorMaterial = new MeshStandardMaterial({
    map: floorColor,
    roughnessMap: floorRough,
    normalMap: floorNormal,
    metalness: 0.22,
    roughness: 0.86,
    color: new Color("#9aa8b8"),
  });
  const brushed = new MeshStandardMaterial({
    map: metalColor,
    roughnessMap: metalRough,
    metalness: 0.78,
    roughness: 0.42,
    color: new Color("#c5d0dc"),
  });
  const carbonMaterial = new MeshStandardMaterial({
    map: carbon,
    metalness: 0.46,
    roughness: 0.62,
    color: new Color("#d5dde6"),
  });
  paint(environment.scene, "Floor", floorMaterial);
  paint(portalFrame.scene, "PortalFrame", brushed);
  paint(browserFrame.scene, "BrowserFrame", brushed);
  paint(rails.scene, "SideRails", carbonMaterial);
  paint(portalRing.scene, "PortalRing", portalMaterial);
  paint(portalCore.scene, "PortalCore", glassMaterial);
  paint(shards.scene, "Shards", transitionMaterial);

  const skyMesh = new Mesh(new SphereGeometry(26, 32, 20), atmosphereMaterial);
  scene.add(skyMesh);

  scene.add(environment.scene);
  place(portalRing.scene, "PortalRing", placements.portalRing);
  place(portalFrame.scene, "PortalFrame", placements.portalFrame);
  place(portalCore.scene, "PortalCore", placements.portalCore);
  place(browserFrame.scene, "BrowserFrame", placements.browserFrame);
  place(corners.scene, "BrowserCorners", placements.browserCorners);
  place(rails.scene, "SideRails", placements.sideRails);
  place(orb.scene, "GestureOrb", placements.orb);
  place(compass.scene, "Compass", placements.compass);
  place(marker.scene, "CalibrationMarker", placements.marker);
  place(shards.scene, "Shards", placements.shards);
  place(lights.scene, "LightRig", placements.lights);
  for (const node of [portalRing.scene, portalFrame.scene, portalCore.scene, browserFrame.scene, corners.scene, rails.scene, orb.scene, compass.scene, marker.scene, shards.scene, lights.scene]) {
    scene.add(node);
  }
  marker.scene.visible = false;
  shards.scene.visible = false;

  scene.add(new AmbientLight(0xc5d4e4, 0.46));
  const key = new DirectionalLight(0xf3f6fc, 1.15);
  key.position.set(2.4, 4.2, 3.2);
  scene.add(key);
  const cyan = new PointLight(0x54d9f2, 3.2, 8, 2);
  cyan.position.set(0, 1.4, 1.2);
  scene.add(cyan);
  const blue = new PointLight(0x7295ff, 1.4, 9, 2);
  blue.position.set(-1.6, 1.8, -1.2);
  scene.add(blue);

  const particleCount = Math.max(0, profile.particles ?? 0);
  let points: Points | null = null;
  if (particleCount > 0) {
    const geometry = new BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.5 + Math.random() * 3.1;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.15 + Math.random() * 2.3;
      positions[i * 3 + 2] = -1.8 + Math.random() * 2.4;
    }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    points = new Points(geometry, new PointsMaterial({ color: 0x54d9f2, size: 0.028, transparent: true, opacity: 0.45, depthWrite: false }));
    scene.add(points);
  }

  const distant = environment.scene.getObjectByName("DistantRings");
  let reduced = options.reducedMotion;
  let pitch = 0;
  let roll = 0;
  let elapsed = 0;
  let pulseStart = -1;
  let running = true;
  let fpsFrames = 0;
  let fpsWindow = 0;
  const baseLook = { x: look[0], y: look[1], z: look[2] };
  const idleTurnsPerSecond = idle.durationMs > 0 ? 1000 / idle.durationMs : 0;

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;
    camera.fov = height >= width ? defaults.camera.fovPortrait : defaults.camera.fovLandscape;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.renderScaleCap || 1));
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const onVisibility = () => {
    running = !document.hidden;
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (event: Event) => {
    event.preventDefault();
    options.onFailure("The graphics context was lost. The 2D frame is still usable.");
    running = false;
  };
  canvas.addEventListener("webglcontextlost", onLost);

  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const delta = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += delta;
    fpsFrames += 1;
    fpsWindow += delta;
    if (fpsWindow >= 1) {
      options.onFps?.(fpsFrames / fpsWindow);
      fpsFrames = 0;
      fpsWindow = 0;
    }
    portalMaterial.uniforms.uTime.value = reduced ? 0 : elapsed;
    if (!reduced && distant) distant.rotation.y += delta * idleTurnsPerSecond * Math.PI * 2;
    if (points && !reduced) points.rotation.y += delta * 0.03;
    const parallax = reduced ? 0 : 1;
    camera.position.x = defaults.camera.position[0] + roll * 0.004 * parallax;
    camera.position.y = defaults.camera.position[1] - pitch * 0.002 * parallax;
    camera.lookAt(baseLook.x, baseLook.y, baseLook.z);
    compass.scene.rotation.z = placements.compass.rotation[2] + (roll * Math.PI) / 180;
    if (pulseStart >= 0) {
      const age = elapsed - pulseStart;
      transitionMaterial.uniforms.uTime.value = age;
      if (age > 0.9) {
        shards.scene.visible = false;
        pulseStart = -1;
      }
    }
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    setReducedMotion(value) {
      reduced = value;
      portalMaterial.uniforms.uIntensity.value = value ? 0.3 : 0.85;
    },
    setOrientation(nextPitch, nextRoll) {
      pitch = nextPitch;
      roll = nextRoll;
    },
    setMode(mode) {
      marker.scene.visible = mode === "calibrating";
    },
    pulse() {
      if (reduced) return;
      shards.scene.visible = true;
      pulseStart = elapsed;
      transitionMaterial.uniforms.uTime.value = 0;
    },
    resize,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
      });
      points?.geometry.dispose();
      (points?.material as Material | undefined)?.dispose?.();
      for (const material of [portalMaterial, glassMaterial, atmosphereMaterial, transitionMaterial, floorMaterial, brushed, carbonMaterial]) material.dispose();
      for (const texture of [floorColor, floorRough, floorNormal, sky, metalColor, metalRough, glassNoise, carbon, fallbackTexture]) texture.dispose();
      renderer.dispose();
    },
  };
}
