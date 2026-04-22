import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

// ─── State ────────────────────────────────────────────────
let mindarThree = null;
let videoEl     = null;
let isTracking  = false;

// ─── IndexedDB — load the compiled target + video set by app.js ──
function openARDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kpf-ar', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('data');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function loadARData() {
  const db = await openARDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('data', 'readonly');
      const getReq = tx.objectStore('data').get('current');
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror   = () => reject(getReq.error);
    });
  } finally {
    db.close();
  }
}

// ─── Go Back ──────────────────────────────────────────────
function goBack() {
  if (mindarThree) mindarThree.stop();
  window.location.href = 'index.html';
}
// Module scope — expose for the onclick attribute in ar-viewer.html
window.goBack = goBack;

// ─── Boot AR ──────────────────────────────────────────────
window.addEventListener('load', async () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText    = document.getElementById('loading-text');
  const statusLabel    = document.getElementById('statusLabel');
  const scanGuide      = document.getElementById('scan-guide');
  const scanText       = document.getElementById('scan-text');

  try {
    loadingText.textContent = 'Loading compiled target...';
    const stored = await loadARData();
    if (!stored) {
      alert('No AR data found. Returning to setup page.');
      window.location.href = 'index.html';
      return;
    }
    const mindURL  = URL.createObjectURL(new Blob([stored.mindBuffer]));
    const videoURL = URL.createObjectURL(stored.videoBlob);

    loadingText.textContent = 'Starting camera...';

    // ── Init MindAR Three.js renderer ──
    mindarThree = new MindARThree({
      container: document.getElementById('ar-container'),
      imageTargetSrc: mindURL,
      maxTrack: 1,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
    });

    const { renderer, scene, camera } = mindarThree;

    // ── Create video element ──
    videoEl = document.createElement('video');
    videoEl.src = videoURL;
    videoEl.loop = true;
    videoEl.muted = false;
    videoEl.playsInline = true;
    videoEl.crossOrigin = 'anonymous';
    videoEl.preload = 'auto';

    // ── Create video texture ──
    const videoTexture = new THREE.VideoTexture(videoEl);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;

    // ── Create plane to display video on ──
    // Plane is sized once the video reports its intrinsic dimensions
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.DoubleSide,
      transparent: false,
    });
    const videoPlane = new THREE.Mesh(geometry, material);

    videoEl.addEventListener('loadedmetadata', () => {
      const aspect = videoEl.videoHeight / videoEl.videoWidth;
      videoPlane.scale.set(1, aspect, 1);
    });

    // ── Attach to image target anchor ──
    const anchor = mindarThree.addAnchor(0);
    anchor.group.add(videoPlane);

    // ── Target found — play video ──
    anchor.onTargetFound = () => {
      isTracking = true;
      videoEl.play().catch(err => console.warn('Autoplay blocked:', err));

      statusLabel.textContent = '✅ Image detected';
      statusLabel.classList.add('found');
      scanGuide.classList.add('hidden');
      scanText.classList.add('hidden');
    };

    // ── Target lost — pause video ──
    anchor.onTargetLost = () => {
      isTracking = false;
      videoEl.pause();

      statusLabel.textContent = '🔍 Scanning...';
      statusLabel.classList.remove('found');
      scanGuide.classList.remove('hidden');
      scanText.classList.remove('hidden');
    };

    // ── Start AR ──
    loadingText.textContent = 'Loading AR engine...';
    await mindarThree.start();

    // ── Render loop ──
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    // ── Hide loading screen ──
    loadingText.textContent = 'Ready!';
    setTimeout(() => {
      loadingOverlay.classList.add('fade-out');
      setTimeout(() => loadingOverlay.style.display = 'none', 500);
    }, 600);

  } catch (err) {
    console.error('AR Error:', err);
    document.getElementById('loading-text').textContent =
      '❌ Camera error. Please allow camera access and refresh.';
  }
});
