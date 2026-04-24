import { Compiler } from 'mindar-image';
import { getProject, saveProject, newProjectId } from './db.js';

const STARTING_PAIR_COUNT = 3;

const MEDIA_TYPES = [
  { key: 'video',    label: '🎬 Video',       accept: 'video/*',           hint: 'Plays flat on top of the printed image' },
  { key: 'photo360', label: '🌐 360 Photo',   accept: 'image/*',           hint: 'Equirectangular 2:1 image — immersive view' },
  { key: 'video360', label: '🎥 360 Video',   accept: 'video/*',           hint: 'Equirectangular 2:1 video — immersive view' },
  { key: 'model3d',  label: '🧊 3D Model',    accept: '.glb,.gltf',        hint: 'glTF / GLB exported from Rhino, Blender, etc. — appears on top of the image' },
];

// ─── State ────────────────────────────────────────────────
const params    = new URLSearchParams(window.location.search);
const editingId = params.get('id');

// pair: { imageFile, imageURL, mediaType, mediaFile, mediaURL }
let pairs = [];
let existingCreatedAt = null;

// ─── DOM ──────────────────────────────────────────────────
const pageTitle    = document.getElementById('pageTitle');
const projectName  = document.getElementById('projectName');
const pairList     = document.getElementById('pairList');
const addPairBtn   = document.getElementById('addPairBtn');
const saveBtn      = document.getElementById('saveBtn');
const launchBtn    = document.getElementById('launchBtn');
const statusBox    = document.getElementById('statusBox');
const statusText   = document.getElementById('statusText');

// ─── Helpers ──────────────────────────────────────────────
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function mediaTypeOf(key) {
  return MEDIA_TYPES.find(t => t.key === key) || MEDIA_TYPES[0];
}

function renderMediaSlot(p, i) {
  const meta = mediaTypeOf(p.mediaType);
  if (!p.mediaFile) {
    return `<div class="slot-empty">Tap to choose</div>`;
  }
  if (p.mediaType === 'video' || p.mediaType === 'video360') {
    return `
      <video src="${p.mediaURL}" muted class="slot-preview"></video>
      <span class="slot-filename">${escapeHtml(p.mediaFile.name)}</span>
    `;
  }
  if (p.mediaType === 'model3d') {
    // No inline 3D preview — too heavy for a pair card. Icon + filename + size.
    const mb = (p.mediaFile.size / (1024 * 1024)).toFixed(1);
    return `
      <div class="slot-model">🧊</div>
      <span class="slot-filename">${escapeHtml(p.mediaFile.name)}</span>
      <span class="slot-sub">${mb} MB</span>
    `;
  }
  // photo360
  return `
    <img src="${p.mediaURL}" alt="" class="slot-preview" />
    <span class="slot-filename">${escapeHtml(p.mediaFile.name)}</span>
  `;
}

// ─── Pair list rendering ──────────────────────────────────
function renderPairs() {
  pairList.innerHTML = '';
  pairs.forEach((p, i) => {
    const meta = mediaTypeOf(p.mediaType);
    const el = document.createElement('div');
    el.className = 'pair-card';
    el.innerHTML = `
      <div class="pair-header">
        <span class="pair-number">Pair ${i + 1}</span>
        ${pairs.length > 1 ? `<button class="btn-remove pair-remove" data-i="${i}">✕ Remove</button>` : ''}
      </div>

      <div class="media-type-toggle" role="radiogroup" aria-label="Media type">
        ${MEDIA_TYPES.map(t => `
          <button
            type="button"
            class="media-btn ${t.key === p.mediaType ? 'selected' : ''}"
            data-media-key="${t.key}"
            data-i="${i}"
          >${t.label}</button>
        `).join('')}
      </div>
      <p class="media-hint">${meta.hint}</p>

      <div class="pair-slots">
        <label class="pair-slot">
          <span class="slot-label">🖼️ Reference Image</span>
          <input type="file" accept="image/*" hidden data-kind="image" data-i="${i}" />
          ${p.imageFile
            ? `<img src="${p.imageURL}" alt="" class="slot-preview" />
               <span class="slot-filename">${escapeHtml(p.imageFile.name)}</span>`
            : `<div class="slot-empty">Tap to choose</div>`
          }
        </label>
        <label class="pair-slot">
          <span class="slot-label">${meta.label}</span>
          <input type="file" accept="${meta.accept}" hidden data-kind="media" data-i="${i}" />
          ${renderMediaSlot(p, i)}
        </label>
      </div>
    `;
    pairList.appendChild(el);
  });

  // File input handlers
  pairList.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const i    = Number(input.dataset.i);
      const kind = input.dataset.kind;
      if (kind === 'image') {
        if (pairs[i].imageURL) URL.revokeObjectURL(pairs[i].imageURL);
        pairs[i].imageFile = file;
        pairs[i].imageURL  = URL.createObjectURL(file);
      } else {
        if (pairs[i].mediaURL) URL.revokeObjectURL(pairs[i].mediaURL);
        pairs[i].mediaFile = file;
        pairs[i].mediaURL  = URL.createObjectURL(file);
        // Lightweight 2:1 warning for 360 uploads
        validate360Aspect(file, pairs[i].mediaType);
      }
      renderPairs();
    });
  });

  // Media-type toggle
  pairList.querySelectorAll('.media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i       = Number(btn.dataset.i);
      const key     = btn.dataset.mediaKey;
      if (pairs[i].mediaType === key) return;
      pairs[i].mediaType = key;
      // Clear the existing media file since the expected format changed
      if (pairs[i].mediaURL) URL.revokeObjectURL(pairs[i].mediaURL);
      pairs[i].mediaFile = null;
      pairs[i].mediaURL  = null;
      renderPairs();
    });
  });

  // Remove-pair buttons
  pairList.querySelectorAll('.pair-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      if (pairs[i].imageURL) URL.revokeObjectURL(pairs[i].imageURL);
      if (pairs[i].mediaURL) URL.revokeObjectURL(pairs[i].mediaURL);
      pairs.splice(i, 1);
      renderPairs();
    });
  });
}

function validate360Aspect(file, mediaType) {
  if (mediaType !== 'photo360' && mediaType !== 'video360') return;
  const url = URL.createObjectURL(file);
  const warn = (w, h) => {
    const ratio = w / h;
    if (Math.abs(ratio - 2) > 0.05) {
      console.warn(`Panorama file is ${w}x${h} (ratio ${ratio.toFixed(2)}). Expected 2:1 for equirectangular; it may look distorted.`);
    }
    URL.revokeObjectURL(url);
  };
  if (mediaType === 'photo360') {
    const img = new Image();
    img.onload = () => warn(img.naturalWidth, img.naturalHeight);
    img.src = url;
  } else {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => warn(v.videoWidth, v.videoHeight);
    v.src = url;
  }
}

function newEmptyPair() {
  return {
    imageFile: null, imageURL: null,
    mediaType: 'video',
    mediaFile: null, mediaURL: null,
  };
}

addPairBtn.addEventListener('click', () => {
  pairs.push(newEmptyPair());
  renderPairs();
});

// ─── Image loader (for MindAR compilation) ────────────────
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Save ─────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
  const name = projectName.value.trim();
  if (!name) {
    alert('Please enter a project name.');
    projectName.focus();
    return;
  }
  if (pairs.length === 0) {
    alert('Add at least one image/media pair.');
    return;
  }
  for (let i = 0; i < pairs.length; i++) {
    if (!pairs[i].imageFile || !pairs[i].mediaFile) {
      alert(`Pair ${i + 1} is missing its reference image or media file.`);
      return;
    }
  }

  saveBtn.disabled = true;
  addPairBtn.disabled = true;
  statusBox.classList.remove('hidden');
  statusBox.style.color = '';

  try {
    statusText.textContent = 'Compiling image targets…';
    const compiler = new Compiler();
    const imgEls = await Promise.all(pairs.map(p => loadImage(p.imageURL)));
    await compiler.compileImageTargets(imgEls, progress => {
      statusText.textContent = `Compiling image targets… ${Math.round(progress)}%`;
    });
    const mindBuffer = await compiler.exportData();

    statusText.textContent = 'Saving…';
    const project = {
      id:         editingId || newProjectId(),
      name,
      createdAt:  existingCreatedAt || Date.now(),
      targets:    pairs.map(p => ({
        imageName: p.imageFile.name,
        imageBlob: p.imageFile,
        mediaType: p.mediaType,
        mediaName: p.mediaFile.name,
        mediaBlob: p.mediaFile,
      })),
      mindBuffer,
    };
    await saveProject(project);

    statusText.textContent = '✅ Saved. Returning to projects…';
    setTimeout(() => { window.location.href = 'index.html'; }, 700);

  } catch (err) {
    console.error(err);
    statusText.textContent = '❌ ' + (err?.message || 'Something went wrong while saving.');
    statusBox.style.color = 'red';
    saveBtn.disabled = false;
    addPairBtn.disabled = false;
  }
});

// ─── Load existing project (edit mode) ────────────────────
async function bootstrap() {
  if (editingId) {
    const p = await getProject(editingId);
    if (!p) {
      alert('Project not found.');
      window.location.href = 'index.html';
      return;
    }
    pageTitle.textContent = 'Edit Project';
    projectName.value     = p.name;
    existingCreatedAt     = p.createdAt;
    pairs = p.targets.map(t => ({
      imageFile: new File([t.imageBlob], t.imageName, { type: t.imageBlob.type }),
      imageURL:  URL.createObjectURL(t.imageBlob),
      mediaType: t.mediaType || 'video',
      mediaFile: new File([t.mediaBlob], t.mediaName || 'media', { type: t.mediaBlob.type }),
      mediaURL:  URL.createObjectURL(t.mediaBlob),
    }));
    launchBtn.style.display = '';
    launchBtn.href = `ar-viewer.html?id=${encodeURIComponent(editingId)}`;
  } else {
    for (let i = 0; i < STARTING_PAIR_COUNT; i++) {
      pairs.push(newEmptyPair());
    }
  }
  renderPairs();
}

bootstrap();
