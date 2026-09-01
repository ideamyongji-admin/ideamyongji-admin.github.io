// IDEA 사업단 관리자 페이지 — GitHub Contents API를 통해 data/news.json, data/archive.json,
// assets/files/ 를 직접 커밋합니다. 토큰은 이 브라우저의 localStorage에만 저장되며 외부로 전송되지 않습니다.

const REPO_OWNER = 'ideamyongji-admin';
const REPO_NAME = 'ideamyongji-admin.github.io';
const BRANCH = 'main';
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const TOKEN_KEY = 'idea_admin_gh_token';
const UNLOCK_KEY = 'idea_admin_unlocked';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64ToUtf8(b64) { return decodeURIComponent(escape(atob(b64))); }
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// data/admin-config.json은 공개 파일이므로 토큰 없이 일반 fetch로 읽습니다.
async function fetchAdminConfigPublic() {
  try {
    const res = await fetch('data/admin-config.json', { cache: 'no-store' });
    if (!res.ok) return { passwordHash: null };
    return await res.json();
  } catch (e) {
    return { passwordHash: null };
  }
}

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

// 큰 파일 업로드: GitHub Contents API(PUT /contents)는 1MB 제한이 있어,
// Git Data API(blob → tree → commit → ref 갱신)를 직접 조합해 최대 100MB까지 업로드합니다.
async function uploadLargeFile(path, base64Content, message) {
  const ref = await gh(`/git/refs/heads/${BRANCH}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await gh(`/git/commits/${baseCommitSha}`);

  const blob = await gh('/git/blobs', {
    method: 'POST',
    body: JSON.stringify({ content: base64Content, encoding: 'base64' }),
  });

  const tree = await gh('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: [{ path, mode: '100644', type: 'blob', sha: blob.sha }],
    }),
  });

  const commit = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommitSha] }),
  });

  await gh(`/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
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

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // GitHub Git Data API(blob)의 실질 상한

async function uploadFileAndGetPath(file, folder, message) {
  const safeName = sanitizeFileName(file.name);
  const path = `${folder}/${Date.now()}_${safeName}`;
  const base64 = await readFileAsBase64(file);
  await uploadLargeFile(path, base64, message);
  return path;
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
          <div class="meta">${item.date}${item.content ? ' · 내용 있음' : ' · 내용 없음(제목만 표시)'}${item.image ? ' · 이미지 첨부됨' : ''}</div>
        </div>
        <button class="btn btn--danger btn--sm" data-delete-notice="${i}">삭제</button>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:#d92d20;">${e.message}</p>`;
  }
}

async function addNotice(date, category, title, contentText, imageFile) {
  let imagePath = '';
  if (imageFile) {
    imagePath = await uploadFileAndGetPath(imageFile, 'assets/images/news', `공지사항 이미지 업로드: ${title}`);
  }
  const { sha, content } = await getJSONFile('data/news.json');
  content.unshift({ date, category, title, content: contentText || '', image: imagePath });
  await putJSONFile('data/news.json', content, sha, `공지사항 등록: ${title}`);
}

async function deleteNotice(index) {
  const { sha, content } = await getJSONFile('data/news.json');
  const removed = content.splice(index, 1)[0];
  await putJSONFile('data/news.json', content, sha, `공지사항 삭제: ${removed ? removed.title : ''}`);
  if (removed && removed.image) {
    try {
      const fileData = await gh(`/contents/${removed.image}?ref=${BRANCH}`);
      if (fileData) await deleteFile(removed.image, fileData.sha, `공지사항 이미지 삭제: ${removed.title}`);
    } catch (e) { /* 이미지 삭제 실패는 무시 (목록에서는 이미 제거됨) */ }
  }
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
  const path = await uploadFileAndGetPath(file, 'assets/files', `자료 업로드: ${title}`);
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

document.addEventListener('DOMContentLoaded', async () => {
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

  const noticeForm = $('#notice-form');
  const noticeStatus = $('#notice-status');
  noticeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus(noticeStatus);
    const date = $('#notice-date').value.replace(/-/g, '.');
    const category = $('#notice-category').value;
    const title = $('#notice-title').value.trim();
    const contentText = $('#notice-content').value.trim();
    const imageFile = $('#notice-image').files[0] || null;
    if (!date || !title) { showStatus(noticeStatus, '날짜와 제목을 입력하세요.', 'error'); return; }
    if (imageFile && imageFile.size > MAX_UPLOAD_BYTES) {
      showStatus(noticeStatus, `이미지 용량이 너무 큽니다. GitHub API 제한으로 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하만 첨부할 수 있습니다.`, 'error');
      return;
    }
    const btn = noticeForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = imageFile ? '이미지 업로드 중…' : '게시 중…';
    try {
      await addNotice(date, category, title, contentText, imageFile);
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
    if (file.size > MAX_UPLOAD_BYTES) {
      showStatus(archiveStatus, `파일 용량이 너무 큽니다. GitHub API 제한으로 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하만 업로드할 수 있습니다.`, 'error');
      return;
    }
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

  // ---------- 잠금 화면 ----------

  function unlock() {
    localStorage.setItem(UNLOCK_KEY, '1');
    $('#lock-screen').hidden = true;
    $('#admin-content').hidden = false;
    $('#lock-now').hidden = false;
    renderNoticeList();
    renderArchiveList();
  }

  $('#lock-now').addEventListener('click', () => {
    localStorage.removeItem(UNLOCK_KEY);
    location.reload();
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = $('#login-status');
    hideStatus(statusEl);
    const pw = $('#login-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '확인 중…';
    try {
      const config = await fetchAdminConfigPublic();
      const hash = await sha256Hex(pw);
      if (config.passwordHash && hash === config.passwordHash) {
        unlock();
      } else {
        showStatus(statusEl, '비밀번호가 올바르지 않습니다.', 'error');
      }
    } finally {
      btn.disabled = false; btn.textContent = '입장하기';
    }
  });

  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const statusEl = $('#setup-status');
    hideStatus(statusEl);
    const token = $('#setup-token').value.trim();
    const pw = $('#setup-password').value;
    const pw2 = $('#setup-password-confirm').value;
    if (pw.length < 4) { showStatus(statusEl, '비밀번호는 4자 이상 입력하세요.', 'error'); return; }
    if (pw !== pw2) { showStatus(statusEl, '비밀번호가 일치하지 않습니다.', 'error'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '설정 중…';
    try {
      localStorage.setItem(TOKEN_KEY, token);
      const hash = await sha256Hex(pw);
      const { sha } = await getJSONFile('data/admin-config.json');
      await putJSONFile('data/admin-config.json', { passwordHash: hash }, sha, '관리자 비밀번호 설정');
      if (tokenInput) tokenInput.value = token;
      if (tokenStatus) tokenStatus.textContent = '토큰이 저장되어 있습니다.';
      unlock();
    } catch (err) {
      showStatus(statusEl, err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '설정하고 시작하기';
    }
  });

  if (localStorage.getItem(UNLOCK_KEY) === '1') {
    unlock();
  } else {
    const config = await fetchAdminConfigPublic();
    $('#lock-loading').hidden = true;
    if (config && config.passwordHash) {
      $('#lock-login').hidden = false;
    } else {
      $('#lock-setup').hidden = false;
    }
  }
});
