import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const el = document.getElementById("viewer");
const title = document.getElementById("title");
const scrollHint = document.getElementById("scroll-hint");
const receiptWrapper = document.getElementById("receipt-wrapper");
const receipt = document.getElementById("receipt");
const team = document.getElementById("team");
const spacer = document.getElementById("scroll-spacer");

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(el.clientWidth, el.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
el.appendChild(renderer.domElement);

// Environment map for realistic reflections
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envMap;
pmrem.dispose();

const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
cam.position.set(0, 0, 28);

// --- Post-processing ---
const renderTarget = new THREE.WebGLRenderTarget(
  el.clientWidth,
  el.clientHeight,
  {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    samples: 4,
  },
);
const composer = new EffectComposer(renderer, renderTarget);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(el.clientWidth, el.clientHeight);

const renderPass = new RenderPass(scene, cam);
renderPass.clearAlpha = 0;
composer.addPass(renderPass);

// Bloom — makes shiny metal and lens highlights glow
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(el.clientWidth, el.clientHeight),
  0.08, // strength
  0.4, // radius
  0.92, // threshold
);
composer.addPass(bloomPass);

// Vignette shader
const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 0.4 },
    offset: { value: 1.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vig = clamp(1.0 - dot(uv, uv) * darkness + offset - 1.0, 0.0, 1.0);
      gl_FragColor = vec4(texel.rgb * vig, texel.a);
    }
  `,
};
const vignettePass = new ShaderPass(vignetteShader);
composer.addPass(vignettePass);

// Lighting — key/fill/rim + soft ambient
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.2);
keyLight.position.set(8, 12, 10);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xb0c4ff, 0.8);
fillLight.position.set(-10, 5, -5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffeedd, 1.0);
rimLight.position.set(0, -5, -15);
scene.add(rimLight);

// Subtle top-down light to lift shadows
const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
topLight.position.set(0, 20, 0);
scene.add(topLight);

let model = null;

// Material overrides: map MTL names → MeshPhysicalMaterial props
// Shader injection for subtle 3D-printed plastic texture (no UVs needed)
function addPlasticTexture(material, strength = 0.08) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
       varying vec3 vWorldPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
       vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
       varying vec3 vWorldPos;
       vec3 hash3(vec3 p) {
         p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
                  dot(p, vec3(269.5, 183.3, 246.1)),
                  dot(p, vec3(113.5, 271.9, 124.6)));
         return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
       }
       float gnoise(vec3 p) {
         vec3 i = floor(p);
         vec3 f = fract(p);
         vec3 u = f * f * (3.0 - 2.0 * f);
         return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                            dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                        mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                            dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
                    mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                            dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                        mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                            dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
       }`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
       {
         float eps = 0.01;
         vec3 noiseGrad = vec3(0.0);
         float amp = 1.0;
         float freq = 40.0;
         float totalAmp = 0.0;
         for (int i = 0; i < 3; i++) {
           vec3 wp = vWorldPos * freq;
           float n0 = gnoise(wp);
           float nx = gnoise(wp + vec3(eps, 0.0, 0.0));
           float ny = gnoise(wp + vec3(0.0, eps, 0.0));
           float nz = gnoise(wp + vec3(0.0, 0.0, eps));
           noiseGrad += amp * (vec3(nx, ny, nz) - n0) / eps;
           totalAmp += amp;
           freq *= 2.0;
           amp *= 0.5;
         }
         noiseGrad /= totalAmp;
         normal = normalize(normal + noiseGrad * ${strength.toFixed(3)});
       }`,
    );
  };
}

const materialOverrides = {
  White_Plastic: {
    color: 0xebe9e4,
    metalness: 0.0,
    roughness: 0.55,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.6,
  },
  Dark_Plastic: {
    color: 0x6e6e6e,
    metalness: 0.0,
    roughness: 0.7,
    clearcoat: 0.1,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.5,
  },
  Lens_Glass: {
    color: 0x1a1a25,
    metalness: 0.4,
    roughness: 0.02,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    reflectivity: 0.9,
    envMapIntensity: 1.5,
  },
  Metal_Accent: {
    color: 0xffffff,
    metalness: 1.0,
    roughness: 0.02,
    envMapIntensity: 6.0,
    emissive: 0x999999,
  },
  Yellow_Plastic: {
    color: 0xf2c810,
    metalness: 0.0,
    roughness: 0.55,
    clearcoat: 0.2,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.6,
  },
};

const objLoader = new OBJLoader();
objLoader.setPath("assets/");
objLoader.load("camera.obj", (o) => {
  o.traverse((c) => {
    if (c.isMesh) {
      const name = c.material?.name;
      const props = materialOverrides[name];
      if (props) {
        const mat = new THREE.MeshPhysicalMaterial(props);
        if (name === "Dark_Plastic") {
          addPlasticTexture(mat, 0.14);
        } else if (name.includes("Plastic")) {
          addPlasticTexture(mat);
        }
        c.material = mat;
      }
    }
  });

  o.rotation.x = -Math.PI / 2;
  o.rotation.z = -Math.PI / 2;
  o.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(o);
  const center = box.getCenter(new THREE.Vector3());
  o.position.sub(center);

  const pivot = new THREE.Group();
  pivot.add(o);
  scene.add(pivot);
  model = pivot;
});

function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function onScroll() {
  const maxScroll = spacer.scrollHeight - window.innerHeight;
  const t = Math.max(0, Math.min(1, window.scrollY / maxScroll));

  // Phase 1: 0-0.2    rotate + move up + zoom
  // Phase 2: 0.2-0.35 receipt prints fast
  // Phase 3: 0.35-0.5 camera exits, receipt locks
  // Phase 4: 0.5-1.0  receipt is static, scroll to read

  const rotateT = Math.min(1, t / 0.2);
  const paperT = Math.min(1, Math.max(0, (t - 0.2) / 0.15));
  const exitT = Math.max(0, (t - 0.35) / 0.15);
  const staticT = Math.max(0, (t - 0.5) / 0.5);
  const eased = ease(rotateT);

  // Rotate camera model
  if (model) model.rotation.y = eased * Math.PI;

  // Move viewer up, zoom in, then exit off screen
  const exitAmount = Math.min(1, exitT);
  el.style.top = 55 - eased * 75 - exitAmount * 50 + "%";
  const isMobile = window.innerWidth <= 600;
  const scaleAmount = isMobile ? 2 : 1;
  el.style.transform = `translate(-50%, -50%) scale(${1 + eased * scaleAmount})`;

  // Fade title and scroll hint
  title.style.opacity = Math.max(0, 1 - t * 15);
  scrollHint.style.opacity = Math.max(0, 1 - t * 15);

  // Receipt paper positioning
  const receiptHeight = receipt.offsetHeight;
  const viewerRect = el.getBoundingClientRect();
  const cameraBottom = viewerRect.top + viewerRect.height * 0.73;

  if (exitT > 0) {
    // Phases 3-4: lock receipt in place, then scroll
    if (!receiptWrapper._lockedTop) receiptWrapper._lockedTop = cameraBottom;

    if (staticT > 0) {
      // Phase 4: full-screen wrapper so receipt scrolls off top
      receiptWrapper.style.top = "-1px";
      receiptWrapper.style.height = "100vh";
      const scrollOffset =
        staticT * (receiptHeight + receiptWrapper._lockedTop);
      receipt.style.transform = `translateY(${receiptWrapper._lockedTop - scrollOffset}px)`;
    } else {
      // Phase 3: receipt locked where camera printed it
      receiptWrapper.style.top = receiptWrapper._lockedTop + "px";
      receiptWrapper.style.height =
        window.innerHeight - receiptWrapper._lockedTop + "px";
      receipt.style.transform = "translateY(0px)";
    }
  } else {
    // Phase 1-2: receipt follows camera, prints out
    receiptWrapper._lockedTop = null;
    receiptWrapper.style.top = cameraBottom + "px";
    receiptWrapper.style.height = window.innerHeight - cameraBottom + "px";

    if (paperT > 0) {
      receipt.style.transform = `translateY(${-receiptHeight + paperT * receiptHeight}px)`;
    } else {
      receipt.style.transform = "translateY(-100%)";
    }
  }

  if (paperT > 0 || exitT > 0 || staticT > 0) {
    receiptWrapper.style.visibility = "visible";
  } else {
    receiptWrapper.style.visibility = "hidden";
  }

  // Show team when receipt scrolls off screen
  if (staticT > 0) {
    const receiptBottom = receiptHeight - staticT * receiptHeight;
    const teamFade = Math.max(
      0,
      Math.min(1, (window.innerHeight - receiptBottom) / 200),
    );
    team.style.opacity = teamFade;
    team.style.pointerEvents = teamFade > 0.5 ? "auto" : "none";
  } else {
    team.style.opacity = 0;
    team.style.pointerEvents = "none";
  }
}

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", () => {
  cam.aspect = el.clientWidth / el.clientHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(el.clientWidth, el.clientHeight);
  composer.setSize(el.clientWidth, el.clientHeight);
  bloomPass.resolution.set(el.clientWidth, el.clientHeight);
  onScroll();
});

onScroll();

(function loop() {
  requestAnimationFrame(loop);
  composer.render();
})();
