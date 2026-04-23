import { Compiler } from 'mindar-image';
import { getProject, saveProject, newProjectId } from './db.js';

const STARTING_PAIR_COUNT = 3;

// ─── State ────────────────────────────────────────────────
const params    = new URLSearchParams(window.location.search);
const editingId = params.get('id');

let pairs = []; // [{ imageFile, imageURL, videoFile, videoURL }]
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

// ─── Pair list rendering ──────────────────────────────────
function renderPairs() {
  pairList.innerHTML = '';
  pairs.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'pair-card';
    el.innerHTML = `
      <div class="pair-header">
        <span class="pair-number">Pair ${i + 1}</span>
        ${pairs.length > 1 ? `<button class="btn-remove pair-remove" data-i="${i}">✕ Remove</button>` : ''}
      </div>
      <div class="pair-slots">
        <label class="pair-slot">
          <span class="slot-label">🖼️ Image</span>
          <input type="file" accept="image/*" hidden data-kind="image" data-i="${i}" />
          ${p.imageFile
            ? `<img src="${p.imageURL}" alt="" class="slot-preview" />
               <span class="slot-filename">${escapeHtml(p.imageFile.name)}</span>`
            : `<div class="slot-empty">Tap to choose</div>`
          }
        </label>
        <label class="pair-slot">
          <span class="slot-label">🎬 Video</span>
          <input type="file" accept="video/*" hidden data-kind="video" data-i="${i}" />
          ${p.videoFile
            ? `<video src="${p.videoURL}" muted class="slot-preview"></video>
               <span class="slot-filename">${escapeHtml(p.videoFile.name)}</span>`
            : `<div class="slot-empty">Tap to choose</div>`
          }
        </label>
      </div>
    `;
    pairList.appendChild(el);
  });

  // Wire up file inputs
  pairList.querySelectorAll('input[type="file"]').forEach(input => {
    input.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const i    = Number(input.dataset.i);
      const kind = input.dataset.kind;
      if (kind === 'image') {
        if (pairs[i].imageURL) URL.revokeObjectURL(pairs[i].imageURL);
        pairs[i].imageFile = file;
        pairs[i].imageURL  = URL.createObjectURL(file);
      } else {
        if (pairs[i].videoURL) URL.revokeObjectURL(pairs[i].videoURL);
        pairs[i].videoFile = file;
        pairs[i].videoURL  = URL.createObjectURL(file);
      }
      renderPairs();
    });
  });

  // Wire up remove buttons
  pairList.querySelectorAll('.pair-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      if (pairs[i].imageURL) URL.revokeObjectURL(pairs[i].imageURL);
      if (pairs[i].videoURL) URL.revokeObjectURL(pairs[i].videoURL);
      pairs.splice(i, 1);
      renderPairs();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

addPairBtn.addEventListener('click', () => {
  pairs.push({ imageFile: null, imageURL: null, videoFile: null, videoURL: null });
  renderPairs();
});

// ─── Image loader ─────────────────────────────────────────
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
    alert('Add at least one image/video pair.');
    return;
  }
  for (let i = 0; i < pairs.length; i++) {
    if (!pairs[i].imageFile || !pairs[i].videoFile) {
      alert(`Pair ${i + 1} is missing its image or video.`);
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
        videoName: p.videoFile.name,
        videoBlob: p.videoFile,
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
      videoFile: new File([t.videoBlob], t.videoName, { type: t.videoBlob.type }),
      videoURL:  URL.createObjectURL(t.videoBlob),
    }));
    launchBtn.style.display = '';
    launchBtn.href = `ar-viewer.html?id=${encodeURIComponent(editingId)}`;
  } else {
    for (let i = 0; i < STARTING_PAIR_COUNT; i++) {
      pairs.push({ imageFile: null, imageURL: null, videoFile: null, videoURL: null });
    }
  }
  renderPairs();
}

bootstrap();
