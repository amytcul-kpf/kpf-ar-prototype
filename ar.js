import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { getProject } from './db.js';
import { showPanorama } from './panorama.js';

// ─── State ────────────────────────────────────────────────
let mindarThree       = null;
let activePano        = null;   // { close: () => void } when a pano is open
let motionGranted     = false;  // true once iOS motion permission resolved (or non-iOS)
const videoEls        = [];     // flat-video target elements, for the unmute toggle

// ─── Go Back ──────────────────────────────────────────────
function goBack() {
  if (activePano) activePano.close();
  if (mindarThree) mindarThree.stop();
  window.location.href = 'index.html';
}
window.goBack = goBack;

// ─── iOS DeviceOrientation permission helper ──────────────
function needsMotionPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' &&
         typeof DeviceOrientationEvent.requestPermission === 'function';
}

// Block on a user tap for both camera + motion on iOS 13+; resolve
// immediately on platforms that don't need the permission step.
async function waitForStart() {
  const overlay = document.getElementById('tap-to-start');
  if (!needsMotionPermission()) {
    motionGranted = true; // no permission API: treat as granted (works on Android)
    return;
  }
  overlay.style.display = 'flex';
  await new Promise(resolve => {
    const btn = document.getElementById('tap-start-btn');
    btn.addEventListener('click', resolve, { once: true });
  });
  try {
    const resp = await DeviceOrientationEvent.requestPermission();
    motionGranted = (resp === 'granted');
  } catch {
    motionGranted = false;
  }
  overlay.style.display = 'none';
}

// ─── Boot AR ──────────────────────────────────────────────
window.addEventListener('load', async () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText    = document.getElementById('loading-text');
  const loadingBar     = document.getElementById('loading-bar');
  const loadingPct     = document.getElementById('loading-percent');
  const statusLabel    = document.getElementById('statusLabel');
  const scanGuide      = document.getElementById('scan-guide');
  const scanText       = document.getElementById('scan-text');

  // Progress helper — clamps and updates bar width + % readout + label.
  let progress = 0;
  function setProgress(pct, text) {
    progress = Math.max(progress, Math.min(100, Math.round(pct)));
    loadingBar.style.width = progress + '%';
    loadingPct.textContent = progress + '%';
    if (text) loadingText.textContent = text;
  }

  try {
    setProgress(2, 'Loading project…');

    // ── Resolve project ──
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      alert('No project selected. Returning to home.');
      window.location.href = 'index.html';
      return;
    }
    const project = await getProject(id);
    if (!project || !project.mindBuffer) {
      alert('Project not found or not compiled. Returning to home.');
      window.location.href = 'index.html';
      return;
    }
    setProgress(20, 'Project loaded');

    // ── iOS: wait for tap to grant motion permission before starting AR ──
    await waitForStart();

    const mindURL     = URL.createObjectURL(new Blob([project.mindBuffer]));
    const targetCount = project.targets.length;

    setProgress(25, 'Preparing targets…');

    // ── Init MindAR Three.js renderer ──
    mindarThree = new MindARThree({
      container: document.getElementById('ar-container'),
      imageTargetSrc: mindURL,
      maxTrack: targetCount,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError:   'no',
      filterMinCF: 0.000099,
      filterBeta:  0.001,
    });

    const { renderer, scene, camera } = mindarThree;

    // ── Build one anchor per project target ──
    let foundCount = 0;
    project.targets.forEach((t, i) => {
      const anchor = mindarThree.addAnchor(i);

      // Panoramas open a full-screen viewer instead of placing a plane
      if (t.mediaType === 'photo360' || t.mediaType === 'video360') {
        anchor.onTargetFound = () => {
          foundCount++;
          updateStatus(t, i);
          if (activePano) return; // already showing one
          activePano = showPanorama({
            blob:          t.mediaBlob,
            type:          t.mediaType,
            motionGranted,
            onExit:        () => { activePano = null; },
          });
        };
        anchor.onTargetLost = () => {
          foundCount = Math.max(0, foundCount - 1);
          updateScanHint();
          // Don't auto-close the pano; user dismisses via ✕ Close.
        };
        return;
      }

      // Flat-video target: plane textured with a looped <video>
      const videoURL = URL.createObjectURL(t.mediaBlob);
      const videoEl = document.createElement('video');
      videoEl.src         = videoURL;
      videoEl.loop        = true;
      videoEl.muted       = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.preload     = 'auto';
      videoEls.push(videoEl);

      const videoTexture = new THREE.VideoTexture(videoEl);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;

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

      anchor.group.add(videoPlane);

      anchor.onTargetFound = () => {
        foundCount++;
        videoEl.play().catch(err => console.warn('Autoplay blocked:', err));
        updateStatus(t, i);
      };
      anchor.onTargetLost = () => {
        foundCount = Math.max(0, foundCount - 1);
        videoEl.pause();
        updateScanHint();
      };
    });
    // 25 -> 60 across all target setups
    setProgress(25 + 35);

    function updateStatus(t, i) {
      statusLabel.textContent = `✅ ${t.imageName || `Target ${i + 1}`}`;
      statusLabel.classList.add('found');
      scanGuide.classList.add('hidden');
      scanText.classList.add('hidden');
    }
    function updateScanHint() {
      if (foundCount === 0) {
        statusLabel.textContent = `🔍 Scanning ${targetCount} target${targetCount === 1 ? '' : 's'}…`;
        statusLabel.classList.remove('found');
        scanGuide.classList.remove('hidden');
        scanText.classList.remove('hidden');
      }
    }

    statusLabel.textContent = `🔍 Scanning ${targetCount} target${targetCount === 1 ? '' : 's'}…`;

    // ── Start AR (opaque, no progress events — trickle from 60 -> 88) ──
    setProgress(60, 'Loading AR engine…');
    const trickleId = setInterval(() => {
      if (progress < 88) setProgress(progress + 1);
    }, 80);
    try {
      await mindarThree.start();
    } finally {
      clearInterval(trickleId);
    }
    setProgress(92, 'Finalising…');

    // ── HUD unmute button (flat-video only) ──
    const unmuteBtn = document.getElementById('unmute-btn');
    if (videoEls.length === 0) {
      unmuteBtn.style.display = 'none';
    } else {
      unmuteBtn.addEventListener('click', () => {
        const nextMuted = !videoEls[0].muted;
        videoEls.forEach(v => v.muted = nextMuted);
        unmuteBtn.textContent = nextMuted ? '🔊 Unmute' : '🔇 Mute';
      });
    }

    // ── Render loop ──
    renderer.setAnimationLoop(() => {
      renderer.render(scene, camera);
    });

    // ── Hide loading screen ──
    setProgress(100, 'Ready!');
    setTimeout(() => {
      loadingOverlay.classList.add('fade-out');
      setTimeout(() => loadingOverlay.style.display = 'none', 500);
    }, 500);

  } catch (err) {
    console.error('AR Error:', err);
    document.getElementById('loading-text').textContent =
      '❌ ' + (err?.message || 'Camera error. Please allow camera access and refresh.');
  }
});
