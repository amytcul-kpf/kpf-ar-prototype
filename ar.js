// ─── Retrieve compiled data from session ─────────────────
const mindURL  = sessionStorage.getItem('mindURL');
const videoURL = sessionStorage.getItem('videoURL');

if (!mindURL || !videoURL) {
  alert('No AR data found. Returning to setup page.');
  window.location.href = 'index.html';
}

// ─── State ────────────────────────────────────────────────
let mindarThree = null;
let videoEl     = null;
let isTracking  = false;

// ─── Go Back ──────────────────────────────────────────────
function goBack() {
  if (mindarThree) mindarThree.stop();
  window.location.href = 'index.html';
}

// ─── Boot AR ──────────────────────────────────────────────
window.addEventListener('load', async () => {
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText    = document.getElementById('loading-text');
  const statusLabel    = document.getElementById('statusLabel');
  const scanGuide      = document.getElementById('scan-guide');
  const scanText       = document.getElementById('scan-text');

  try {
    loadingText.textContent = 'Starting camera...';

    // ── Init MindAR Three.js renderer ──
    mindarThree = new window.MINDAR.IMAGE.MindARThree({
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
    // Aspect ratio 16:9 — adjust if your video is different
    const geometry = new THREE.PlaneGeometry(1, 0.5625);
    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.DoubleSide,
      transparent: false,
    });
    const videoPlane = new THREE.Mesh(geometry, material);

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
