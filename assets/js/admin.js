// IDEA 사업단 관리자 페이지 — GitHub Contents API를 통해 data/news.json, data/archive.json,
// assets/files/ 를 직접 커밋합니다. 토큰은 이 브라우저의 localStorage에만 저장되며 외부로 전송되지 않습니다.

const REPO_OWNER = 'ideamyongji-admin';
const REPO_NAME = 'ideamyongji-admin.github.io';
const BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const TOKEN_KEY = 'idea_admin_gh_token';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64ToUtf8(b64) { return decodeURIComponent(escape(atob(b64))); }
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

function showStatus(el, message, type) {
  el.textContent = message;
  el.className = `status-msg show ${type}`;
}
function hideStatus(el) { el.className = 'status-msg'; }

async function gh(path, options = {}) {
  const token = getToken();
  if (!token) throw new Error('먼저 GitHub 토큰을 입력하고 저장하세요.');
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      ...(options.headers || {}),
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.message || msg; } catch (e) { /* ignore */ }
    throw new Error(`GitHub API 오류 (${res.status}): ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getJSONFile(path) {
  const data = await gh(`/contents/${path}?ref=${BRANCH}`);
  if (!data) return { sha: null, content: [] };
  return { sha: data.sha, content: JSON.parse(b64ToUtf8(data.content)) };
}

async function putJSONFile(path, content, sha, message) {
  const body = { message, branch: BRANCH, content: utf8ToB64(JSON.stringify(content, null, 2) + '\n') };
  if (sha) body.sha = sha;
  return gh(`/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
}

async function putBinaryFile(path, base64Content, message) {
  const body = { message, branch: BRANCH, content: base64Content };
  return gh(`/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
}

async function deleteFile(path, sha, message) {
  return gh(`/contents/${path}`, { method: 'DELETE', body: JSON.stringify({ message, sha, branch: BRANCH }) });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeFileName(name) {
  return name.replace(/\s+/g, '_').replace(/[^\w.\-가-힣]/g, '');
}

// ---------- 공지사항 ----------

async function renderNoticeList() {
  const listEl = $('#notice-admin-list');
  listEl.innerHTML = '<p style="color:var(--ink-500);">불러오는 중…</p>';
  try {
    const { content } = await getJSONFile('data/news.json');
    if (!content.length) {
      listEl.innerHTML = '<p style="color:var(--ink-500);">등록된 공지사항이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = content.map((item, i) => `
      <div class="admin-row">
        <div>
          <div class="title">[${item.category}] ${item.title}</div>
          <div class="meta">${item.date}${item.content ? ' · 내용 있음' : ' · 내용 없음(제목만 표시)'}</div>
        </div>
        <button class="btn btn--danger btn--sm" data-delete-notice="${i}">삭제</button>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:#d92d20;">${e.message}</p>`;
  }
}

async function addNotice(date, category, title, contentText) {
  const { sha, content } = await getJSONFile('data/news.json');
  content.unshift({ date, category, title, content: contentText || '' });
  await putJSONFile('data/news.json', content, sha, `공지사항 등록: ${title}`);
}

async function deleteNotice(index) {
  const { sha, content } = await getJSONFile('data/news.json');
  const removed = content.splice(index, 1)[0];
  await putJSONFile('data/news.json', content, sha, `공지사항 삭제: ${removed ? removed.title : ''}`);
}

// ---------- 자료실 ----------

async function renderArchiveList() {
  const listEl = $('#archive-admin-list');
  listEl.innerHTML = '<p style="color:var(--ink-500);">불러오는 중…</p>';
  try {
    const { content } = await getJSONFile('data/archive.json');
    if (!content.length) {
      listEl.innerHTML = '<p style="color:var(--ink-500);">등록된 자료가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = content.map((item, i) => `
      <div class="admin-row">
        <div>
          <div class="title">${item.title}</div>
          <div class="meta">${item.date} · ${item.fileName}</div>
        </div>
        <button class="btn btn--danger btn--sm" data-delete-archive="${i}">삭제</button>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:#d92d20;">${e.message}</p>`;
  }
}

async function addArchive(date, title, file) {
  const safeName = sanitizeFileName(file.name);
  const path = `assets/files/${Date.now()}_${safeName}`;
  const base64 = await readFileAsBase64(file);
  await putBinaryFile(path, base64, `자료 업로드: ${title}`);
  const { sha, content } = await getJSONFile('data/archive.json');
  content.unshift({ date, title, fileName: file.name, path });
  await putJSONFile('data/archive.json', content, sha, `자료실 등록: ${title}`);
}

async function deleteArchive(index) {
  const { sha, content } = await getJSONFile('data/archive.json');
  const removed = content.splice(index, 1)[0];
  await putJSONFile('data/archive.json', content, sha, `자료실 삭제: ${removed ? removed.title : ''}`);
  if (removed) {
    try {
      const fileData = await gh(`/contents/${removed.path}?ref=${BRANCH}`);
      if (fileData) await deleteFile(removed.path, fileData.sha, `자료 파일 삭제: ${removed.fileName}`);
    } catch (e) { /* 파일 삭제 실패는 무시 (목록에서는 이미 제거됨) */ }
  }
}

// ---------- 초기화 ----------

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = $('#gh-token');
  const tokenStatus = $('#token-status');
  const savedToken = getToken();
  if (savedToken) {
    tokenInput.value = savedToken;
    tokenStatus.textContent = '토큰이 저장되어 있습니다.';
  }

  $('#save-token').addEventListener('click', () => {
    const v = tokenInput.value.trim();
    if (!v) { tokenStatus.textContent = '토큰을 입력하세요.'; return; }
    localStorage.setItem(TOKEN_KEY, v);
    tokenStatus.textContent = '토큰이 저장되었습니다. (이 브라우저에만 저장됩니다)';
    renderNoticeList();
    renderArchiveList();
  });

  $('#clear-token').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = '';
    tokenStatus.textContent = '토큰이 삭제되었습니다.';
  });

  renderNoticeList();
  renderArchiveList();

  const noticeForm = $('#notice-form');
  const noticeStatus = $('#notice-status');
  noticeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus(noticeStatus);
    const date = $('#notice-date').value.replace(/-/g, '.');
    const category = $('#notice-category').value;
    const title = $('#notice-title').value.trim();
    const contentText = $('#notice-content').value.trim();
    if (!date || !title) { showStatus(noticeStatus, '날짜와 제목을 입력하세요.', 'error'); return; }
    const btn = noticeForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '게시 중…';
    try {
      await addNotice(date, category, title, contentText);
      showStatus(noticeStatus, '공지사항이 등록되었습니다. 30~60초 후 사이트에 반영됩니다.', 'success');
      noticeForm.reset();
      await renderNoticeList();
    } catch (err) {
      showStatus(noticeStatus, err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '게시하기';
    }
  });

  $('#notice-admin-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-notice]');
    if (!btn) return;
    if (!confirm('이 공지사항을 삭제할까요?')) return;
    btn.disabled = true;
    try {
      await deleteNotice(Number(btn.dataset.deleteNotice));
      await renderNoticeList();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  const archiveForm = $('#archive-form');
  const archiveStatus = $('#archive-status');
  archiveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus(archiveStatus);
    const date = $('#archive-date').value.replace(/-/g, '.');
    const title = $('#archive-title').value.trim();
    const file = $('#archive-file').files[0];
    if (!date || !title || !file) { showStatus(archiveStatus, '날짜, 제목, 파일을 모두 선택하세요.', 'error'); return; }
    if (file.size > 1024 * 1024) { showStatus(archiveStatus, 'GitHub API 제한으로 1MB 이하 파일만 업로드할 수 있습니다.', 'error'); return; }
    const btn = archiveForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '업로드 중…';
    try {
      await addArchive(date, title, file);
      showStatus(archiveStatus, '자료가 등록되었습니다. 30~60초 후 사이트에 반영됩니다.', 'success');
      archiveForm.reset();
      await renderArchiveList();
    } catch (err) {
      showStatus(archiveStatus, err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '게시하기';
    }
  });

  $('#archive-admin-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete-archive]');
    if (!btn) return;
    if (!confirm('이 자료를 삭제할까요? (업로드된 파일도 함께 삭제됩니다)')) return;
    btn.disabled = true;
    try {
      await deleteArchive(Number(btn.dataset.deleteArchive));
      await renderArchiveList();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  $$('.tab-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const name = link.dataset.tab;
      $$('.tab-link').forEach((l) => l.classList.toggle('active', l === link));
      $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    });
  });
});
