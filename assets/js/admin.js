// IDEA 사업단 관리자 페이지 — GitHub Contents API를 통해 data/news.json, data/archive.json,
// assets/files/ 를 직접 커밋합니다. 토큰은 이 브라우저의 localStorage에만 저장되며 외부로 전송되지 않습니다.

const REPO_OWNER = 'ideamyongji';
const REPO_NAME = 'ideamyongji.github.io';
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

// 사진을 원본 그대로 올리면(휴대폰 사진은 보통 2~4MB, 4000px 이상) 방문자가
// 화면에서 350px로 보이는 사진 때문에 수 MB를 내려받게 됩니다.
// 업로드 직전에 브라우저에서 긴 변 1600px로 줄이고 JPEG로 다시 인코딩합니다.
const IMAGE_MAX_EDGE = 1600;
const IMAGE_QUALITY = 0.82;
const RESIZABLE_TYPE_RE = /^image\/(jpeg|png|webp)$/i;

function loadImageBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없습니다')); };
    img.src = url;
  });
}

// 반환: { blob, ext, width, height } — 줄일 필요가 없으면 blob은 null
async function shrinkImage(file) {
  if (!RESIZABLE_TYPE_RE.test(file.type)) return null;
  let img;
  try { img = await loadImageBitmap(file); } catch (_) { return null; }

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  // 이미 작고 용량도 넉넉하면 원본을 그대로 씁니다(불필요한 재인코딩 방지)
  if (scale === 1 && file.size <= 400 * 1024 && /jpeg/i.test(file.type)) {
    return { blob: null, ext: 'jpg', width: w, height: h };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';           // PNG 투명 배경이 검게 나오지 않도록
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY));
  if (!blob) return { blob: null, ext: 'jpg', width: w, height: h };
  return { blob, ext: 'jpg', width: w, height: h };
}

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function uploadFileAndGetPath(file, folder, message) {
  const shrunk = await shrinkImage(file);
  let safeName = sanitizeFileName(file.name);
  let payload = file;

  if (shrunk) {
    // 파일명 끝에 실제 픽셀 치수를 남깁니다. news-loader가 이걸 읽어 <img>에
    // width/height를 채우고, 사진 로드 중 레이아웃이 튀는 현상을 막습니다.
    const stem = safeName.replace(/\.[^.]+$/, '');
    safeName = `${stem}_${shrunk.width}x${shrunk.height}.${shrunk.ext}`;
    if (shrunk.blob) payload = shrunk.blob;
  }

  const path = `${folder}/${Date.now()}_${safeName}`;
  const base64 = shrunk && shrunk.blob ? await readBlobAsBase64(shrunk.blob) : await readFileAsBase64(payload);
  await uploadLargeFile(path, base64, message);
  return path;
}

// ---------- 공지사항 ----------

// "YYYY.MM.DD" 형식의 날짜 문자열을 비교 가능한 숫자로 변환 (0 패딩 여부와 무관하게 정확히 비교)
function dateSortValue(dateStr) {
  const [y = 0, m = 0, d = 0] = String(dateStr || '').split('.').map(Number);
  return y * 10000 + m * 100 + d;
}

async function renderNoticeList() {
  const listEl = $('#notice-admin-list');
  listEl.innerHTML = '<p style="color:var(--ink-500);">불러오는 중…</p>';
  try {
    const { content } = await getJSONFile('data/news.json');
    if (!content.length) {
      listEl.innerHTML = '<p style="color:var(--ink-500);">등록된 공지사항이 없습니다.</p>';
      return;
    }
    // 화면에는 최신 날짜순으로 보여주되, 수정·삭제 버튼은 실제 저장된 배열의
    // 원래 인덱스(i)를 그대로 참조해 정렬 순서와 무관하게 올바른 항목을 가리키게 합니다.
    const sorted = content
      .map((item, i) => ({ item, i }))
      .sort((a, b) => dateSortValue(b.item.date) - dateSortValue(a.item.date));
    listEl.innerHTML = sorted.map(({ item, i }) => `
      <div class="admin-row">
        <div>
          <div class="title">[${item.category}] ${item.title}</div>
          <div class="meta">${item.date}${item.content ? ' · 내용 있음' : ' · 내용 없음(제목만 표시)'}${item.attachment ? ' · 파일 첨부됨' : ''}</div>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0;">
          <button class="btn btn--outline btn--sm" data-edit-notice="${i}">수정</button>
          <button class="btn btn--danger btn--sm" data-delete-notice="${i}">삭제</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:#d92d20;">${e.message}</p>`;
  }
}

async function addNotice(date, category, title, contentText, attachmentFile) {
  let attachmentPath = '';
  if (attachmentFile) {
    attachmentPath = await uploadFileAndGetPath(attachmentFile, 'assets/files/news', `공지사항 첨부파일 업로드: ${title}`);
  }
  const { sha, content } = await getJSONFile('data/news.json');
  content.unshift({ date, category, title, content: contentText || '', attachment: attachmentPath });
  await putJSONFile('data/news.json', content, sha, `공지사항 등록: ${title}`);
}

async function getNotice(index) {
  const { content } = await getJSONFile('data/news.json');
  return content[index];
}

async function updateNotice(index, date, category, title, contentText, attachmentFile, removeAttachment) {
  const { sha, content } = await getJSONFile('data/news.json');
  const existing = content[index] || {};
  let attachmentPath = existing.attachment || '';

  if (attachmentFile) {
    attachmentPath = await uploadFileAndGetPath(attachmentFile, 'assets/files/news', `공지사항 첨부파일 교체: ${title}`);
    if (existing.attachment) {
      try {
        const fileData = await gh(`/contents/${existing.attachment}?ref=${BRANCH}`);
        if (fileData) await deleteFile(existing.attachment, fileData.sha, `공지사항 기존 첨부파일 삭제: ${title}`);
      } catch (e) { /* 무시 */ }
    }
  } else if (removeAttachment && existing.attachment) {
    try {
      const fileData = await gh(`/contents/${existing.attachment}?ref=${BRANCH}`);
      if (fileData) await deleteFile(existing.attachment, fileData.sha, `공지사항 첨부파일 삭제: ${title}`);
    } catch (e) { /* 무시 */ }
    attachmentPath = '';
  }

  content[index] = { date, category, title, content: contentText || '', attachment: attachmentPath };
  await putJSONFile('data/news.json', content, sha, `공지사항 수정: ${title}`);
}

async function deleteNotice(index) {
  const { sha, content } = await getJSONFile('data/news.json');
  const removed = content.splice(index, 1)[0];
  await putJSONFile('data/news.json', content, sha, `공지사항 삭제: ${removed ? removed.title : ''}`);
  if (removed && removed.attachment) {
    try {
      const fileData = await gh(`/contents/${removed.attachment}?ref=${BRANCH}`);
      if (fileData) await deleteFile(removed.attachment, fileData.sha, `공지사항 첨부파일 삭제: ${removed.title}`);
    } catch (e) { /* 첨부파일 삭제 실패는 무시 (목록에서는 이미 제거됨) */ }
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

// ---------- 포토갤러리 ----------

async function renderGalleryList() {
  const listEl = $('#gallery-admin-list');
  listEl.innerHTML = '<p style="color:var(--ink-500);">불러오는 중…</p>';
  try {
    const { content } = await getJSONFile('data/gallery.json');
    if (!content.length) {
      listEl.innerHTML = '<p style="color:var(--ink-500);">등록된 사진이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = content.map((item, i) => {
      const count = Array.isArray(item.images) ? item.images.length : (item.image ? 1 : 0);
      return `
      <div class="admin-row">
        <div>
          <div class="title">${item.caption || '(설명 없음)'}</div>
          <div class="meta">${item.date} · 사진 ${count}장</div>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0;">
          <button type="button" class="btn btn--outline btn--sm" data-edit-gallery="${i}">수정</button>
          <label class="btn btn--outline btn--sm" style="cursor:pointer; margin-bottom:0;">
            <span>사진 추가</span>
            <input type="file" accept="image/*" multiple data-add-gallery-input="${i}" style="display:none;">
          </label>
          <button class="btn btn--danger btn--sm" data-delete-gallery="${i}">삭제</button>
        </div>
      </div>
    `;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<p style="color:#d92d20;">${e.message}</p>`;
  }
}

// 여러 장을 순차 업로드합니다(GitHub Git Data API 커밋을 동시에 여러 번 하면
// 같은 브랜치 ref를 두고 경합이 생겨 일부 파일이 유실될 수 있어, 하나씩 완료 후 다음 진행).
async function addGalleryPhotos(date, caption, files, onProgress) {
  const images = [];
  for (const file of files) {
    const path = await uploadFileAndGetPath(file, 'assets/images/gallery', `포토갤러리 사진 업로드: ${caption || date}`);
    images.push(path);
    if (onProgress) onProgress(images.length, files.length);
  }
  const { sha, content } = await getJSONFile('data/gallery.json');
  content.unshift({ date, caption: caption || '', images });
  await putJSONFile('data/gallery.json', content, sha, `포토갤러리 등록: ${caption || date} (${images.length}장)`);
}

async function getGalleryPost(index) {
  const { content } = await getJSONFile('data/gallery.json');
  return content[index];
}

// 날짜·설명을 수정합니다. 이 화면에서 사진을 추가로 선택하면 기존 사진 뒤에 이어서
// 업로드·병합합니다(사진 자체를 빼거나 순서를 바꾸는 기능은 없음).
async function updateGalleryPost(index, date, caption, files, onProgress) {
  const uploaded = [];
  if (files && files.length) {
    for (const file of files) {
      const path = await uploadFileAndGetPath(file, 'assets/images/gallery', `포토갤러리 사진 추가: ${caption || date}`);
      uploaded.push(path);
      if (onProgress) onProgress(uploaded.length, files.length);
    }
  }
  const { sha, content } = await getJSONFile('data/gallery.json');
  const item = content[index];
  if (!item) throw new Error('게시물을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  const existingImages = Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []);
  content[index] = { date, caption: caption || '', images: [...existingImages, ...uploaded] };
  await putJSONFile('data/gallery.json', content, sha, `포토갤러리 수정: ${caption || date}`);
}

// 이미 등록된 게시물에 사진을 추가로 업로드합니다. 파일 선택 창은 한 폴더 안에서만
// 여러 장을 고를 수 있는 OS 제약이 있어서, 서로 다른 폴더의 사진을 한 게시물로 모으려면
// 이 기능으로 여러 번 나눠 추가하면 됩니다.
async function appendGalleryPhotos(index, files, onProgress) {
  const { content: before } = await getJSONFile('data/gallery.json');
  const target = before[index];
  if (!target) throw new Error('게시물을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  const label = target.caption || target.date;

  const uploaded = [];
  for (const file of files) {
    const path = await uploadFileAndGetPath(file, 'assets/images/gallery', `포토갤러리 사진 추가: ${label}`);
    uploaded.push(path);
    if (onProgress) onProgress(uploaded.length, files.length);
  }

  const { sha, content } = await getJSONFile('data/gallery.json');
  const item = content[index];
  if (!item) throw new Error('업로드는 완료됐지만 게시물을 찾지 못해 목록에 반영하지 못했습니다. 목록을 새로고침해 주세요.');
  const existingImages = Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []);
  item.images = [...existingImages, ...uploaded];
  delete item.image;
  await putJSONFile('data/gallery.json', content, sha, `포토갤러리 사진 추가: ${label} (+${uploaded.length}장)`);
}

async function deleteGalleryPhoto(index) {
  const { sha, content } = await getJSONFile('data/gallery.json');
  const removed = content.splice(index, 1)[0];
  await putJSONFile('data/gallery.json', content, sha, `포토갤러리 삭제: ${removed ? (removed.caption || removed.date) : ''}`);
  const images = removed ? (Array.isArray(removed.images) ? removed.images : (removed.image ? [removed.image] : [])) : [];
  for (const image of images) {
    try {
      const fileData = await gh(`/contents/${image}?ref=${BRANCH}`);
      if (fileData) await deleteFile(image, fileData.sha, `포토갤러리 사진 삭제: ${removed.caption || removed.date}`);
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
    renderGalleryList();
  });

  $('#clear-token').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    tokenInput.value = '';
    tokenStatus.textContent = '토큰이 삭제되었습니다.';
  });

  const noticeForm = $('#notice-form');
  const noticeStatus = $('#notice-status');
  const noticeFormTitle = $('#notice-form-title');
  const noticeSubmitBtn = $('#notice-submit-btn');
  const noticeCancelBtn = $('#notice-cancel-edit');
  const noticeExistingAttachment = $('#notice-existing-attachment');
  const noticeRemoveAttachment = $('#notice-remove-attachment');
  const noticeEditIndex = $('#notice-edit-index');

  function resetNoticeFormToAddMode() {
    noticeForm.reset();
    noticeEditIndex.value = '';
    noticeFormTitle.textContent = '새 공지사항 등록';
    noticeSubmitBtn.textContent = '게시하기';
    noticeSubmitBtn.disabled = false;
    noticeCancelBtn.hidden = true;
    noticeExistingAttachment.hidden = true;
    noticeRemoveAttachment.checked = false;
  }

  function dotDateToInputValue(dateStr) {
    const parts = (dateStr || '').split('.').map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 3) return '';
    const [y, m, d] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  async function enterNoticeEditMode(index) {
    hideStatus(noticeStatus);
    const item = await getNotice(index);
    if (!item) return;
    noticeEditIndex.value = String(index);
    $('#notice-date').value = dotDateToInputValue(item.date);
    $('#notice-category').value = item.category;
    $('#notice-title').value = item.title;
    $('#notice-content').value = item.content || '';
    $('#notice-attachment').value = '';
    noticeRemoveAttachment.checked = false;
    noticeExistingAttachment.hidden = !item.attachment;
    noticeFormTitle.textContent = '공지사항 수정';
    noticeSubmitBtn.textContent = '수정하기';
    noticeCancelBtn.hidden = false;
    noticeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  noticeCancelBtn.addEventListener('click', () => resetNoticeFormToAddMode());

  noticeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus(noticeStatus);
    const date = $('#notice-date').value.replace(/-/g, '.');
    const category = $('#notice-category').value;
    const title = $('#notice-title').value.trim();
    const contentText = $('#notice-content').value.trim();
    const attachmentFile = $('#notice-attachment').files[0] || null;
    const editIndex = noticeEditIndex.value;
    const isEdit = editIndex !== '';
    if (!date || !title) { showStatus(noticeStatus, '날짜와 제목을 입력하세요.', 'error'); return; }
    if (attachmentFile && attachmentFile.size > MAX_UPLOAD_BYTES) {
      showStatus(noticeStatus, `파일 용량이 너무 큽니다. GitHub API 제한으로 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하만 첨부할 수 있습니다.`, 'error');
      return;
    }
    const btn = noticeSubmitBtn;
    btn.disabled = true; btn.textContent = attachmentFile ? '파일 업로드 중…' : (isEdit ? '수정 중…' : '게시 중…');
    try {
      if (isEdit) {
        await updateNotice(Number(editIndex), date, category, title, contentText, attachmentFile, noticeRemoveAttachment.checked);
        showStatus(noticeStatus, '공지사항이 수정되었습니다. 30~60초 후 사이트에 반영됩니다.', 'success');
      } else {
        await addNotice(date, category, title, contentText, attachmentFile);
        showStatus(noticeStatus, '공지사항이 등록되었습니다. 30~60초 후 사이트에 반영됩니다.', 'success');
      }
      resetNoticeFormToAddMode();
      await renderNoticeList();
    } catch (err) {
      showStatus(noticeStatus, err.message, 'error');
      btn.disabled = false; btn.textContent = isEdit ? '수정하기' : '게시하기';
    }
  });

  $('#notice-admin-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-notice]');
    if (editBtn) {
      await enterNoticeEditMode(Number(editBtn.dataset.editNotice));
      return;
    }
    const btn = e.target.closest('[data-delete-notice]');
    if (!btn) return;
    if (!confirm('이 공지사항을 삭제할까요?')) return;
    btn.disabled = true;
    try {
      await deleteNotice(Number(btn.dataset.deleteNotice));
      if (noticeEditIndex.value === String(btn.dataset.deleteNotice)) resetNoticeFormToAddMode();
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

  const galleryForm = $('#gallery-form');
  const galleryStatus = $('#gallery-status');
  const galleryFormTitle = $('#gallery-form-title');
  const gallerySubmitBtn = $('#gallery-submit-btn');
  const galleryCancelBtn = $('#gallery-cancel-edit');
  const galleryImageHint = $('#gallery-image-hint');
  const galleryEditIndex = $('#gallery-edit-index');

  function resetGalleryFormToAddMode() {
    galleryForm.reset();
    galleryEditIndex.value = '';
    galleryFormTitle.textContent = '새 게시물 등록';
    gallerySubmitBtn.textContent = '게시하기';
    gallerySubmitBtn.disabled = false;
    galleryCancelBtn.hidden = true;
    galleryImageHint.textContent = '(여러 장 선택 가능)';
  }

  async function enterGalleryEditMode(index) {
    hideStatus(galleryStatus);
    const item = await getGalleryPost(index);
    if (!item) return;
    galleryEditIndex.value = String(index);
    $('#gallery-date').value = dotDateToInputValue(item.date);
    $('#gallery-caption').value = item.caption || '';
    $('#gallery-image').value = '';
    galleryFormTitle.textContent = '게시물 수정';
    gallerySubmitBtn.textContent = '수정하기';
    galleryCancelBtn.hidden = false;
    galleryImageHint.textContent = '(선택, 새로 고르면 기존 사진 뒤에 이어서 추가됩니다)';
    galleryForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  galleryCancelBtn.addEventListener('click', () => resetGalleryFormToAddMode());

  galleryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideStatus(galleryStatus);
    const date = $('#gallery-date').value.replace(/-/g, '.');
    const caption = $('#gallery-caption').value.trim();
    const files = [...$('#gallery-image').files];
    const editIndex = galleryEditIndex.value;
    const isEdit = editIndex !== '';
    if (!date || (!isEdit && !files.length)) {
      showStatus(galleryStatus, isEdit ? '날짜를 입력하세요.' : '날짜와 사진 파일을 선택하세요.', 'error');
      return;
    }
    const oversized = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      showStatus(galleryStatus, `"${oversized.name}" 파일 용량이 너무 큽니다. GitHub API 제한으로 장당 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하만 업로드할 수 있습니다.`, 'error');
      return;
    }
    const btn = gallerySubmitBtn;
    btn.disabled = true;
    btn.textContent = files.length > 1 ? `업로드 중… (1/${files.length})` : (isEdit ? '수정 중…' : '업로드 중…');
    try {
      if (isEdit) {
        await updateGalleryPost(Number(editIndex), date, caption, files, (done, total) => {
          btn.textContent = `업로드 중… (${done}/${total})`;
        });
        showStatus(galleryStatus, '게시물이 수정되었습니다. 30~60초 후 사이트에 반영됩니다.', 'success');
      } else {
        await addGalleryPhotos(date, caption, files, (done, total) => {
          btn.textContent = `업로드 중… (${done}/${total})`;
        });
        showStatus(galleryStatus, `사진 ${files.length}장이 등록되었습니다. 30~60초 후 사이트에 반영됩니다.`, 'success');
      }
      resetGalleryFormToAddMode();
      await renderGalleryList();
    } catch (err) {
      showStatus(galleryStatus, err.message, 'error');
      btn.disabled = false; btn.textContent = isEdit ? '수정하기' : '게시하기';
    }
  });

  $('#gallery-admin-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-gallery]');
    if (editBtn) {
      await enterGalleryEditMode(Number(editBtn.dataset.editGallery));
      return;
    }
    const btn = e.target.closest('[data-delete-gallery]');
    if (!btn) return;
    if (!confirm('이 사진을 삭제할까요?')) return;
    btn.disabled = true;
    try {
      await deleteGalleryPhoto(Number(btn.dataset.deleteGallery));
      if (galleryEditIndex.value === String(btn.dataset.deleteGallery)) resetGalleryFormToAddMode();
      await renderGalleryList();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  $('#gallery-admin-list').addEventListener('change', async (e) => {
    const input = e.target.closest('[data-add-gallery-input]');
    if (!input) return;
    const index = Number(input.dataset.addGalleryInput);
    const files = [...input.files];
    if (!files.length) return;
    const oversized = files.find((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized) {
      alert(`"${oversized.name}" 파일 용량이 너무 큽니다. GitHub API 제한으로 장당 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 이하만 업로드할 수 있습니다.`);
      input.value = '';
      return;
    }
    const label = input.closest('label');
    const textEl = label.querySelector('span');
    input.disabled = true;
    try {
      await appendGalleryPhotos(index, files, (done, total) => {
        textEl.textContent = `업로드 중… (${done}/${total})`;
      });
      await renderGalleryList();
    } catch (err) {
      alert(err.message);
      textEl.textContent = '사진 추가';
      input.disabled = false;
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
    renderGalleryList();
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
