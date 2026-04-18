import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
const canvas = document.getElementById('mainScreen');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

// Style login button
const loginBtn = document.getElementById("login-button");
loginBtn.style.position = 'absolute';
loginBtn.style.zIndex = '1';
loginBtn.style.top = '45%';
loginBtn.style.left = '43%';
loginBtn.style.opacity = '0.8';
loginBtn.style.border = 'none';
loginBtn.style.padding = '10px 20px';
loginBtn.style.fontSize = '24px';
loginBtn.style.backgroundColor = '#31493aff';
loginBtn.style.color = 'white';
loginBtn.style.fontFamily = 'monospace';
loginBtn.style.cursor = 'pointer';

// Style share-audio button (hidden until login succeeds)
const audioBtn = document.getElementById("share-audio-button");
audioBtn.style.position = 'absolute';
audioBtn.style.zIndex = '1';
audioBtn.style.top = '45%';
audioBtn.style.left = '40%';
audioBtn.style.opacity = '0.8';
audioBtn.style.border = 'none';
audioBtn.style.padding = '10px 20px';
audioBtn.style.fontSize = '24px';
audioBtn.style.backgroundColor = '#31493aff';
audioBtn.style.color = 'white';
audioBtn.style.fontFamily = 'monospace';
audioBtn.style.cursor = 'pointer';
audioBtn.style.display = 'none';

const renderer = new THREE.WebGLRenderer({ canvas: canvas });
renderer.setSize(window.innerWidth, window.innerHeight);

const composer = new EffectComposer(renderer);
const pixelPass = new RenderPixelatedPass(3, scene, camera);
composer.addPass(pixelPass);

let isMusicPlaying = false;
let currentTrackId = null;

const DEFAULT_COLOR = new THREE.Color(0x00ff00);
const targetConeColor = new THREE.Color(0x00ff00);
const targetParticleColor = new THREE.Color(0x00ff00);
const currentConeColor = new THREE.Color(0x00ff00);
const currentParticleColor = new THREE.Color(0x00ff00);
const COLOR_LERP_SPEED = 0.04;

window.addEventListener('spotifyStateChange', (event) => {
  isMusicPlaying = event.detail.isPlaying;

  const { trackId, albumImageUrl } = event.detail;
  if (trackId && trackId !== currentTrackId) {
    currentTrackId = trackId;
    if (albumImageUrl) {
      const requestedTrackId = trackId;
      extractColorsFromImage(albumImageUrl).then(colors => {
        if (currentTrackId !== requestedTrackId) return;
        targetConeColor.copy(colors.primary);
        targetParticleColor.copy(colors.secondary);
      }).catch(() => {
        if (currentTrackId !== requestedTrackId) return;
        targetConeColor.copy(DEFAULT_COLOR);
        targetParticleColor.copy(DEFAULT_COLOR);
      });
    } else {
      targetConeColor.copy(DEFAULT_COLOR);
      targetParticleColor.copy(DEFAULT_COLOR);
    }
  }
});

// --- Album art color extraction ---

function extractColorsFromImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const cvs = document.createElement('canvas');
        cvs.width = size;
        cvs.height = size;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        const pixels = [];

        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const brightness = r * 0.299 + g * 0.587 + b * 0.114;
          if (brightness > 30 && brightness < 220) {
            pixels.push([r, g, b]);
          }
        }

        if (pixels.length < 10) {
          resolve({ primary: DEFAULT_COLOR.clone(), secondary: DEFAULT_COLOR.clone() });
          return;
        }

        const palette = medianCut(pixels, 0, 3);
        const sorted = palette
          .map(c => ({ color: c, saturation: colorSaturation(c) }))
          .sort((a, b) => b.saturation - a.saturation)
          .map(e => e.color);

        const primary = new THREE.Color().setRGB(sorted[0][0] / 255, sorted[0][1] / 255, sorted[0][2] / 255);
        const secondary = sorted.length > 1
          ? new THREE.Color().setRGB(sorted[1][0] / 255, sorted[1][1] / 255, sorted[1][2] / 255)
          : primary.clone();

        resolve({ primary, secondary });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

function medianCut(pixels, depth, maxDepth) {
  if (depth >= maxDepth || pixels.length === 0) {
    const avg = [0, 0, 0];
    for (const p of pixels) {
      avg[0] += p[0];
      avg[1] += p[1];
      avg[2] += p[2];
    }
    const n = pixels.length || 1;
    return [[Math.round(avg[0] / n), Math.round(avg[1] / n), Math.round(avg[2] / n)]];
  }

  let maxRange = 0;
  let splitChannel = 0;
  for (let ch = 0; ch < 3; ch++) {
    let min = 255, max = 0;
    for (const p of pixels) {
      if (p[ch] < min) min = p[ch];
      if (p[ch] > max) max = p[ch];
    }
    if (max - min > maxRange) {
      maxRange = max - min;
      splitChannel = ch;
    }
  }

  pixels.sort((a, b) => a[splitChannel] - b[splitChannel]);
  const mid = Math.floor(pixels.length / 2);

  return [
    ...medianCut(pixels.slice(0, mid), depth + 1, maxDepth),
    ...medianCut(pixels.slice(mid), depth + 1, maxDepth),
  ];
}

function colorSaturation([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

// --- Audio analysis state ---

let analyser = null;
let frequencyData = null;
let audioReady = false;

const audioLevels = {
  bass: 0,
  mid: 0,
  rms: 0,
};

// Smoothed values for visual interpolation
const smoothed = {
  bass: 0,
  mid: 0,
  rms: 0,
};

const SMOOTH_FACTOR = 0.15;

// --- Audio capture via getDisplayMedia ---

async function initAudioCapture() {
  try {
    // Some browsers require video:true for getDisplayMedia; we discard the video track
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    // Stop the video track immediately — we only need audio
    stream.getVideoTracks().forEach(t => t.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("No audio track captured. Visuals will use fallback animation.");
      return false;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    audioReady = true;

    // Clean up when the user stops sharing
    audioTracks[0].addEventListener('ended', () => {
      audioReady = false;
      analyser = null;
      frequencyData = null;
      console.log("Audio sharing stopped.");
    });

    console.log("Audio capture active — visuals are now beat-reactive.");
    return true;
  } catch (err) {
    console.warn("Audio capture declined or failed:", err.message);
    return false;
  }
}

// --- Frequency band extraction ---

function updateAudioLevels() {
  if (!audioReady || !analyser) return;

  analyser.getByteFrequencyData(frequencyData);

  const binCount = analyser.frequencyBinCount;
  // With fftSize=2048 and sampleRate=48000, each bin ≈ 23Hz
  // Bass: bins 1-10 (~23-230Hz), Mid: bins 10-80 (~230-1840Hz)
  const bassEnd = Math.min(10, binCount);
  const midStart = bassEnd;
  const midEnd = Math.min(80, binCount);

  let bassSum = 0;
  for (let i = 1; i < bassEnd; i++) bassSum += frequencyData[i];
  audioLevels.bass = bassSum / ((bassEnd - 1) * 255);

  let midSum = 0;
  for (let i = midStart; i < midEnd; i++) midSum += frequencyData[i];
  audioLevels.mid = midSum / ((midEnd - midStart) * 255);

  let totalSum = 0;
  for (let i = 0; i < binCount; i++) totalSum += frequencyData[i];
  audioLevels.rms = totalSum / (binCount * 255);

  // Exponential smoothing
  smoothed.bass = smoothed.bass * (1 - SMOOTH_FACTOR) + audioLevels.bass * SMOOTH_FACTOR;
  smoothed.mid = smoothed.mid * (1 - SMOOTH_FACTOR) + audioLevels.mid * SMOOTH_FACTOR;
  smoothed.rms = smoothed.rms * (1 - SMOOTH_FACTOR) + audioLevels.rms * SMOOTH_FACTOR;
}

// --- Share Audio button handler ---

audioBtn.addEventListener('click', async () => {
  audioBtn.disabled = true;
  audioBtn.innerText = 'Waiting for share...';
  const success = await initAudioCapture();
  if (success) {
    audioBtn.style.display = 'none';
  } else {
    audioBtn.disabled = false;
    audioBtn.innerText = 'Share Audio (optional)';
  }
});

// --- Wireframe tunnel / wormhole background ---

const TUNNEL_RING_COUNT = 20;
const TUNNEL_SPOKE_COUNT = 24;
const TUNNEL_RING_SEGMENTS = 64;
const TUNNEL_MIN_RADIUS = 0.3;
const TUNNEL_MAX_RADIUS = 18;

const tunnelRingData = [];

function radiusFromProgress(progress) {
  return TUNNEL_MIN_RADIUS + (TUNNEL_MAX_RADIUS - TUNNEL_MIN_RADIUS) * progress * progress;
}

function createTunnel() {
  const ringVertCount = TUNNEL_RING_COUNT * TUNNEL_RING_SEGMENTS * 2;
  const spokeVertCount = TUNNEL_SPOKE_COUNT * 2;
  const totalVerts = ringVertCount + spokeVertCount;
  const positions = new Float32Array(totalVerts * 3);

  for (let i = 0; i < TUNNEL_RING_COUNT; i++) {
    const progress = i / TUNNEL_RING_COUNT;
    tunnelRingData.push({ progress });
    const radius = radiusFromProgress(progress);
    const baseIdx = i * TUNNEL_RING_SEGMENTS * 2 * 3;

    for (let s = 0; s < TUNNEL_RING_SEGMENTS; s++) {
      const a0 = (s / TUNNEL_RING_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / TUNNEL_RING_SEGMENTS) * Math.PI * 2;
      const idx = baseIdx + s * 6;
      positions[idx]     = Math.cos(a0) * radius;
      positions[idx + 1] = 0;
      positions[idx + 2] = Math.sin(a0) * radius;
      positions[idx + 3] = Math.cos(a1) * radius;
      positions[idx + 4] = 0;
      positions[idx + 5] = Math.sin(a1) * radius;
    }
  }

  const spokeBase = ringVertCount * 3;
  for (let i = 0; i < TUNNEL_SPOKE_COUNT; i++) {
    const angle = (i / TUNNEL_SPOKE_COUNT) * Math.PI * 2;
    const idx = spokeBase + i * 6;
    positions[idx]     = Math.cos(angle) * TUNNEL_MIN_RADIUS;
    positions[idx + 1] = 0;
    positions[idx + 2] = Math.sin(angle) * TUNNEL_MIN_RADIUS;
    positions[idx + 3] = Math.cos(angle) * TUNNEL_MAX_RADIUS;
    positions[idx + 4] = 0;
    positions[idx + 5] = Math.sin(angle) * TUNNEL_MAX_RADIUS;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.LineBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });

  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = -1;
  return lines;
}

const tunnelMesh = createTunnel();
scene.add(tunnelMesh);

function updateTunnel(speed) {
  const positions = tunnelMesh.geometry.attributes.position.array;

  for (let i = 0; i < TUNNEL_RING_COUNT; i++) {
    const ring = tunnelRingData[i];
    ring.progress += speed;
    if (ring.progress >= 1) ring.progress -= 1;

    const radius = radiusFromProgress(ring.progress);
    const baseIdx = i * TUNNEL_RING_SEGMENTS * 2 * 3;

    for (let s = 0; s < TUNNEL_RING_SEGMENTS; s++) {
      const a0 = (s / TUNNEL_RING_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / TUNNEL_RING_SEGMENTS) * Math.PI * 2;
      const idx = baseIdx + s * 6;
      positions[idx]     = Math.cos(a0) * radius;
      positions[idx + 2] = Math.sin(a0) * radius;
      positions[idx + 3] = Math.cos(a1) * radius;
      positions[idx + 5] = Math.sin(a1) * radius;
    }
  }

  tunnelMesh.geometry.attributes.position.needsUpdate = true;
}

// --- Three.js scene objects ---

const geometry = new THREE.ConeGeometry(2, 2, 3);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
const cone1 = new THREE.Mesh(geometry, material);
scene.add(cone1);

const cone2 = new THREE.Mesh(geometry, material);
scene.add(cone2);

const cone3 = new THREE.Mesh(geometry, material);
scene.add(cone3);

const cone4 = new THREE.Mesh(geometry, material);
scene.add(cone4);

// Particle ring
const PARTICLE_COUNT = 5000;
const RING_RADIUS = 5;
const RING_THICKNESS = 2;
const particleData = [];

function createParticleRing(scene) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLE_COUNT * 3);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = RING_RADIUS + (Math.random() * RING_THICKNESS);

    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 0;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    particleData.push({
      angle: angle,
      baseRadius: radius,
      driftSpeed: Math.random() * 2 + 0.5
    });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x00ff00,
    size: 0.001,
    transparent: true,
    opacity: 0.8
  });
  const particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
  return particleSystem;
}

const partCloud = createParticleRing(scene);

function updateParticleRing(particleSystem, beatIntensity) {
  const positions = particleSystem.geometry.attributes.position.array;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const data = particleData[i];
    const currentRadius = data.baseRadius + (beatIntensity * 5 * data.driftSpeed);

    const x = Math.cos(data.angle) * currentRadius;
    const z = Math.sin(data.angle) * currentRadius;

    positions[i * 3] = x;
    positions[i * 3 + 2] = z;
  }
  particleSystem.geometry.attributes.position.needsUpdate = true;
}

// --- Fallback oscillator (used when no audio is shared) ---

let fallbackBass = 0;
let fallbackUp = true;

function updateFallbackBass() {
  if (fallbackUp) {
    fallbackBass += 0.01;
    if (fallbackBass >= 0.9) fallbackUp = false;
  } else {
    fallbackBass -= 0.1;
    if (fallbackBass <= 0.1) fallbackUp = true;
  }
}

// --- Animation loop ---

function animate() {
  requestAnimationFrame(animate);

  if (isMusicPlaying) {
    // Update audio data if available
    if (audioReady) {
      updateAudioLevels();
    } else {
      updateFallbackBass();
    }

    const bassVal = audioReady ? smoothed.bass : fallbackBass;
    const midVal = audioReady ? smoothed.mid : fallbackBass * 0.6;
    const rmsVal = audioReady ? smoothed.rms : fallbackBass * 0.4;

    // Cone rotation (unchanged)
    cone1.rotation.x += 0.01;
    cone1.rotation.y += 0.01;
    cone2.rotation.x -= 0.01;
    cone2.rotation.y -= 0.01;
    cone3.rotation.x += 0.0051;
    cone3.rotation.y += 0.0051;
    cone4.rotation.x -= 0.02;
    cone4.rotation.y += 0.01;

    // Cone scaling driven by loudness (cone1, cone2) and melody/mid (cone3, cone4)
    const loudnessScale = 1.0 + rmsVal * 4.0;
    const melodyScale = 1.0 + midVal * 5.0;

    cone1.scale.y = THREE.MathUtils.lerp(cone1.scale.y, loudnessScale, 0.12);
    cone2.scale.y = THREE.MathUtils.lerp(cone2.scale.y, loudnessScale * 1.2, 0.10);
    cone3.scale.y = THREE.MathUtils.lerp(cone3.scale.y, melodyScale, 0.14);
    cone4.scale.y = THREE.MathUtils.lerp(cone4.scale.y, melodyScale * 0.8, 0.10);

    // Particle ring expansion driven by bass
    updateParticleRing(partCloud, bassVal);
    partCloud.rotation.y += bassVal * 0.02;

    // Tunnel scrolls outward and spins opposite to particle ring
    const tunnelSpeed = 0.003 + rmsVal * 0.008;
    updateTunnel(tunnelSpeed);
    tunnelMesh.rotation.y -= 0.001 + rmsVal * 0.005;
  }

  currentConeColor.lerp(targetConeColor, COLOR_LERP_SPEED);
  currentParticleColor.lerp(targetParticleColor, COLOR_LERP_SPEED);
  material.color.copy(currentConeColor);
  partCloud.material.color.copy(currentParticleColor);
  tunnelMesh.material.color.copy(currentConeColor);

  composer.render();
}

animate();
