import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";

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
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(el.clientWidth, el.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
el.appendChild(renderer.domElement);

const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
cam.position.set(0, 0, 28);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(10, 15, 10);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xaabbff, 0.6);
fillLight.position.set(-10, 5, -5);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffeedd, 0.8);
rimLight.position.set(0, -5, -15);
scene.add(rimLight);

let model = null;

// Material overrides: map MTL names → MeshStandardMaterial props
const materialOverrides = {
  White_Plastic: { color: 0xebe9e4, metalness: 0.0, roughness: 0.45 },
  Dark_Plastic: { color: 0x4a4a4a, metalness: 0.0, roughness: 0.6 },
  Lens_Glass: { color: 0x2a2a35, metalness: 0.3, roughness: 0.05 },
  Metal_Accent: { color: 0x8d8f94, metalness: 0.7, roughness: 0.25 },
};

const mtlLoader = new MTLLoader();
mtlLoader.setPath("assets/");
mtlLoader.load("camera.mtl", (materials) => {
  materials.preload();

  const objLoader = new OBJLoader();
  objLoader.setMaterials(materials);
  objLoader.setPath("assets/");
  objLoader.load("camera.obj", (o) => {
    // Replace loaded materials with MeshStandardMaterial for PBR rendering
    o.traverse((c) => {
      if (c.isMesh) {
        const name = c.material?.name;
        const props = materialOverrides[name];
        if (props) {
          c.material = new THREE.MeshStandardMaterial(props);
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
  title.style.opacity = Math.max(0, 1 - t * 8);
  scrollHint.style.opacity = Math.max(0, 1 - t * 8);

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
  onScroll();
});

onScroll();

(function loop() {
  requestAnimationFrame(loop);
  renderer.render(scene, cam);
})();
