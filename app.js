import { Compiler } from 'mindar-image';

// ─── State ───────────────────────────────────────────────
let imageFile = null;
let videoFile = null;
let imageDataURL = null;
let videoPreviewURL = null;

// ─── Image Upload ─────────────────────────────────────────
const imageInput = document.getElementById('imageInput');
const imageDropZone = document.getElementById('imageDropZone');

imageInput.addEventListener('change', e => {
  if (e.target.files[0]) handleImageFile(e.target.files[0]);
});

imageDropZone.addEventListener('click', () => imageInput.click());

imageDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  imageDropZone.classList.add('drag-over');
});

imageDropZone.addEventListener('dragleave', () => {
  imageDropZone.classList.remove('drag-over');
});

imageDropZone.addEventListener('drop', e => {
  e.preventDefault();
  imageDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) handleImageFile(file);
});

function handleImageFile(file) {
  imageFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    imageDataURL = e.target.result;
    document.getElementById('previewImg').src = imageDataURL;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('imageDropZone').style.display = 'none';
    checkReady();
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  imageFile = null;
  imageDataURL = null;
  imageInput.value = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('imageDropZone').style.display = 'block';
  checkReady();
}

// ─── Video Upload ─────────────────────────────────────────
const videoInput = document.getElementById('videoInput');
const videoDropZone = document.getElementById('videoDropZone');

videoInput.addEventListener('change', e => {
  if (e.target.files[0]) handleVideoFile(e.target.files[0]);
});

videoDropZone.addEventListener('click', () => videoInput.click());

videoDropZone.addEventListener('dragover', e => {
  e.preventDefault();
  videoDropZone.classList.add('drag-over');
});

videoDropZone.addEventListener('dragleave', () => {
  videoDropZone.classList.remove('drag-over');
});

videoDropZone.addEventListener('drop', e => {
  e.preventDefault();
  videoDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) handleVideoFile(file);
});

function handleVideoFile(file) {
  videoFile = file;
  if (videoPreviewURL) URL.revokeObjectURL(videoPreviewURL);
  videoPreviewURL = URL.createObjectURL(file);
  document.getElementById('previewVideo').src = videoPreviewURL;
  document.getElementById('videoPreview').style.display = 'block';
  document.getElementById('videoDropZone').style.display = 'none';
  checkReady();
}

function removeVideo() {
  videoFile = null;
  if (videoPreviewURL) {
    URL.revokeObjectURL(videoPreviewURL);
    videoPreviewURL = null;
  }
  videoInput.value = '';
  document.getElementById('videoPreview').style.display = 'none';
  document.getElementById('videoDropZone').style.display = 'block';
  checkReady();
}

// ─── Ready Check ──────────────────────────────────────────
function checkReady() {
  const btn = document.getElementById('launchBtn');
  const hint = document.getElementById('launchHint');

  if (imageFile && videoFile) {
    btn.disabled = false;
    hint.textContent = 'Ready! Click to compile your image target and launch AR';
    hint.style.color = '#00c864';
  } else if (imageFile && !videoFile) {
    btn.disabled = true;
    hint.textContent = 'Now upload a video to continue';
    hint.style.color = '#aaa';
  } else if (!imageFile && videoFile) {
    btn.disabled = true;
    hint.textContent = 'Now upload a reference image to continue';
    hint.style.color = '#aaa';
  } else {
    btn.disabled = true;
    hint.textContent = 'Upload both an image and a video to continue';
    hint.style.color = '#aaa';
  }
}

// ─── Launch AR ────────────────────────────────────────────
async function launchAR() {
  const btn = document.getElementById('launchBtn');
  const statusBox = document.getElementById('statusBox');
  const statusText = document.getElementById('statusText');

  btn.disabled = true;
  statusBox.classList.remove('hidden');
  statusText.textContent = 'Compiling image target... (this may take 10-20 seconds)';

  try {
    // Compile the image into a MindAR .mind file in the browser
    const compiler = new Compiler();
    const img = await loadImage(imageDataURL);
    await compiler.compileImageTargets([img], progress => {
      statusText.textContent = `Compiling image target... ${Math.round(progress)}%`;
    });

    const buffer = await compiler.exportData();

    // Persist across navigation via IndexedDB. Blob URLs created on
    // this page are revoked when it unloads, so sessionStorage can't
    // carry them over — we store the raw buffer + Blob instead.
    await saveARData(buffer, videoFile);

    statusText.textContent = '✅ Done! Opening AR viewer...';

    setTimeout(() => {
      window.location.href = 'ar-viewer.html';
    }, 800);

  } catch (err) {
    console.error(err);
    statusText.textContent = '❌ Compilation failed. Please try a clearer image.';
    statusBox.style.color = 'red';
    btn.disabled = false;
  }
}

// ─── Helpers ──────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function openARDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kpf-ar', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('data');
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function saveARData(mindBuffer, videoBlob) {
  const db = await openARDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put({ mindBuffer, videoBlob }, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Module scripts are scoped, so expose onclick handlers globally
window.removeImage = removeImage;
window.removeVideo = removeVideo;
window.launchAR   = launchAR;
