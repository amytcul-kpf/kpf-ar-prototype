import { listProjects, deleteProject } from './db.js';

const projectList = document.getElementById('projectList');
const emptyState  = document.getElementById('emptyState');

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderProject(p) {
  const el = document.createElement('div');
  el.className = 'card project-card';
  el.innerHTML = `
    <div class="project-info">
      <h2>${escapeHtml(p.name || 'Untitled')}</h2>
      <p>${p.targets.length} target${p.targets.length === 1 ? '' : 's'} · ${formatDate(p.createdAt)}</p>
    </div>
    <div class="project-actions">
      <a class="btn-secondary" href="project.html?id=${encodeURIComponent(p.id)}">Open</a>
      <a class="btn-launch btn-small" href="ar-viewer.html?id=${encodeURIComponent(p.id)}">🚀 Launch</a>
      <button class="btn-remove" data-del="${encodeURIComponent(p.id)}">✕</button>
    </div>
  `;
  el.querySelector('[data-del]').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    await deleteProject(p.id);
    el.remove();
    if (projectList.children.length === 0) {
      emptyState.style.display = 'block';
    }
  });
  return el;
}

async function render() {
  projectList.innerHTML = '';
  const projects = await listProjects();
  if (projects.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  for (const p of projects) projectList.appendChild(renderProject(p));
}

render();
