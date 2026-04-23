import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { getProject } from './db.js';

// ─── State ────────────────────────────────────────────────
let mindarThree = null;
const videoEls = [];

// ─── Go Back ──────────────────────────────────────────────
function goBack() {
  if (mindarThree) mindarThree.stop();
  window.location.href = 'index.html';
}
window.goBack = goBack;

// ─── Boot AR ──────────────────────────────────────────────
window.addEventListener('load', async () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText    = document.getElementById('loading-text');
  const statusLabel    = document.getElementById('statusLabel');
  const scanGuide      = document.getElementById('scan-guide');
  const scanText       = document.getElementById('scan-text');

  try {
    // ── Resolve project from URL ──
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) {
      alert('No project selected. Returning to home.');
      window.location.href = 'index.html';
      return;
    }
    loadingText.textContent = 'Loading project…';
    const project = await getProject(id);
    if (!project || !project.mindBuffer) {
      alert('Project not found or not compiled. Returning to home.');
      window.location.href = 'index.html';
      return;
    }

    const mindURL = URL.createObjectURL(new Blob([project.mindBuffer]));
    const targetCount = project.targets.length;

    loadingText.textContent = 'Starting camera…';

    // ── Init MindAR Three.js renderer ──
    mindarThree = new MindARThree({
      container: document.getElementById('ar-container'),
      imageTargetSrc: mindURL,
      maxTrack: targetCount,
      uiLoading: 'no',
      uiScanning: 'no',
      uiError: 'no',
      filterMinCF: 0.000099,
      filterBeta: 0.001,
    });

    const { renderer, scene, camera } = mindarThree;

    // ── Build one anchor + video plane per project target ──
    let foundCount = 0;
    project.targets.forEach((t, i) => {
      const videoURL = URL.createObjectURL(t.videoBlob);

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

      const anchor = mindarThree.addAnchor(i);
      anchor.group.add(videoPlane);

      anchor.onTargetFound = () => {
        foundCount++;
        videoEl.play().catch(err => console.warn('Autoplay blocked:', err));
        statusLabel.textContent = `✅ ${t.imageName || `Target ${i + 1}`}`;
        statusLabel.classList.add('found');
        scanGuide.classList.add('hidden');
        scanText.classList.add('hidden');
      };

      anchor.onTargetLost = () => {
        foundCount = Math.max(0, foundCount - 1);
        videoEl.pause();
        if (foundCount === 0) {
          statusLabel.textContent = `🔍 Scanning ${targetCount} target${targetCount === 1 ? '' : 's'}…`;
          statusLabel.classList.remove('found');
          scanGuide.classList.remove('hidden');
          scanText.classList.remove('hidden');
        }
      };
    });

    statusLabel.textContent = `🔍 Scanning ${targetCount} target${targetCount === 1 ? '' : 's'}…`;

    // ── Start AR ──
    loadingText.textContent = 'Loading AR engine…';
    await mindarThree.start();

    // ── Unmute button (user gesture required on iOS) ──
    const unmuteBtn = document.getElementById('unmute-btn');
    unmuteBtn.addEventListener('click', () => {
      const nextMuted = !videoEls[0]?.muted;
      videoEls.forEach(v => v.muted = nextMuted);
      unmuteBtn.textContent = nextMuted ? '🔊 Unmute' : '🔇 Mute';
    });

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
      '❌ ' + (err?.message || 'Camera error. Please allow camera access and refresh.');
  }
});
