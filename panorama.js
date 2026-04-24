import * as THREE from 'three';

// Minimal DeviceOrientationControls — three.js shipped this in
// examples/jsm/controls/ until r134, then removed it. We inline the
// classic implementation here so panorama.js doesn't depend on a
// file that no longer exists in three 0.158.
class DeviceOrientationControls {
  constructor(camera) {
    this.camera = camera;
    this.camera.rotation.reorder('YXZ');
    this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
    this.screenOrientation = 0;
    this._q0 = new THREE.Quaternion();
    this._q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    this._euler = new THREE.Euler();
    this._zee = new THREE.Vector3(0, 0, 1);

    this._onDeviceOrientation = (e) => {
      this.deviceOrientation = {
        alpha: e.alpha || 0,
        beta:  e.beta  || 0,
        gamma: e.gamma || 0,
      };
    };
    this._onScreenOrientation = () => {
      this.screenOrientation = window.orientation || 0;
    };

    window.addEventListener('deviceorientation', this._onDeviceOrientation);
    window.addEventListener('orientationchange',  this._onScreenOrientation);
    this._onScreenOrientation();
  }

  update() {
    const d = THREE.MathUtils.degToRad;
    const alpha  = d(this.deviceOrientation.alpha);
    const beta   = d(this.deviceOrientation.beta);
    const gamma  = d(this.deviceOrientation.gamma);
    const orient = d(this.screenOrientation);
    this._euler.set(beta, alpha, -gamma, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
    this.camera.quaternion.multiply(this._q1);
    this.camera.quaternion.multiply(this._q0.setFromAxisAngle(this._zee, -orient));
  }

  disconnect() {
    window.removeEventListener('deviceorientation', this._onDeviceOrientation);
    window.removeEventListener('orientationchange',  this._onScreenOrientation);
  }
}

// Full-screen 360 viewer. Renders an inverted sphere textured with an
// equirectangular image or video blob. Uses DeviceOrientationControls
// when motion permission is available on a phone, otherwise falls
// back to pointer drag. Call the returned close() to dismiss.
//
//   showPanorama({
//     blob:           Blob,
//     type:           'photo360' | 'video360',
//     motionGranted:  boolean,      // true once iOS perm granted (or non-iOS)
//     onExit:         () => void,
//   }) -> { close: () => void }

const DRAG_SPEED = 0.005;

function isMobile() {
  return /Mobi|Android|iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function showPanorama({ blob, type, motionGranted, onExit }) {
  // ── DOM overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'pano-overlay';
  overlay.innerHTML = `
    <div class="pano-hud">
      <button class="pano-btn" data-role="unmute" style="display:none">🔊 Unmute</button>
      <button class="pano-btn" data-role="close">✕ Close</button>
    </div>
    <div class="pano-hint" id="pano-hint"></div>
  `;
  document.body.appendChild(overlay);

  // ── Three.js scene ──
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75, window.innerWidth / window.innerHeight, 0.1, 1000
  );
  camera.position.set(0, 0, 0);
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.className = 'pano-canvas';
  overlay.appendChild(renderer.domElement);

  const geometry = new THREE.SphereGeometry(500, 60, 40);
  geometry.scale(-1, 1, 1); // normals point inward so we see the inside

  // ── Texture (image or video) ──
  const blobURL = URL.createObjectURL(blob);
  let texture, videoEl = null;

  if (type === 'video360') {
    videoEl = document.createElement('video');
    videoEl.src         = blobURL;
    videoEl.loop        = true;
    videoEl.muted       = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.preload     = 'auto';

    texture = new THREE.VideoTexture(videoEl);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    videoEl.play().catch(err => console.warn('Pano video autoplay blocked:', err));
    overlay.querySelector('[data-role=unmute]').style.display = '';
  } else {
    texture = new THREE.TextureLoader().load(blobURL);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }

  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // ── Controls: device orientation on mobile (if permitted), else pointer drag ──
  let orientationControls = null;
  let yaw = 0, pitch = 0;
  let dragging = false, lastX = 0, lastY = 0;
  const hint = overlay.querySelector('#pano-hint');

  const useMotion = motionGranted && isMobile();

  if (useMotion) {
    orientationControls = new DeviceOrientationControls(camera);
    hint.textContent = 'Move your phone to look around';
  } else {
    hint.textContent = isMobile() ? 'Drag to look around' : 'Click & drag to look around';

    const onPointerDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      yaw   -= dx * DRAG_SPEED;
      pitch  = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch - dy * DRAG_SPEED));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerUp = () => { dragging = false; };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup',   onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    // Fade the hint out after a moment
    setTimeout(() => hint.classList.add('fade'), 2500);
  }

  // ── Resize handling ──
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // ── Render loop ──
  let rafId = 0;
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    if (orientationControls) {
      orientationControls.update();
    } else {
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }
    renderer.render(scene, camera);
  };
  animate();

  // ── Buttons ──
  const unmuteBtn = overlay.querySelector('[data-role=unmute]');
  unmuteBtn.addEventListener('click', () => {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    unmuteBtn.textContent = videoEl.muted ? '🔊 Unmute' : '🔇 Mute';
  });

  const closeBtn = overlay.querySelector('[data-role=close]');
  const close = () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    if (orientationControls) orientationControls.disconnect?.();
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';
      videoEl.load();
    }
    URL.revokeObjectURL(blobURL);
    texture.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    overlay.remove();
    onExit?.();
  };
  closeBtn.addEventListener('click', close);

  return { close };
}
