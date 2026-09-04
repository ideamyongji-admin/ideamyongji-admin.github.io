// 사업단소식(공지사항/자료실) 목록을 data/news.json, data/archive.json에서 불러와 렌더링합니다.
// 게시글 등록/삭제는 admin.html에서 GitHub API를 통해 두 JSON 파일을 직접 수정합니다.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatContent(content) {
  return content
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

// 업로드 시 파일명 앞에 붙는 "타임스탬프_" 접두어를 제거해 원래 파일명에 가깝게 표시
function attachmentDisplayName(path) {
  return (path.split('/').pop() || path).replace(/^\d+_/, '');
}

function newsItemHTML(item, index) {
  const hasText = !!(item.content && item.content.trim());
  const hasAttachment = !!item.attachment;
  const hasContent = hasText || hasAttachment;
  const bodyId = `news-body-${index}`;
  const tag = hasContent ? 'button' : 'div';
  const attrs = hasContent
    ? `type="button" aria-expanded="false" aria-controls="${bodyId}" data-toggle="notice"`
    : '';
  let attachmentHtml = '';
  if (hasAttachment) {
    attachmentHtml = IMAGE_EXT_RE.test(item.attachment)
      ? `<img src="${escapeHtml(item.attachment)}" alt="${escapeHtml(item.title)}" loading="lazy">`
      : `<a class="btn btn--outline btn--sm" href="${escapeHtml(item.attachment)}" target="_blank" rel="noopener" style="margin-bottom:16px;">📎 ${escapeHtml(attachmentDisplayName(item.attachment))} 다운로드</a>`;
  }
  const textHtml = hasText ? formatContent(item.content) : '';
  return `
    <div class="news-entry">
      <${tag} class="news-item${hasContent ? ' is-button' : ''}" ${attrs}>
        <span class="date">${escapeHtml(item.date)}</span>
        <div><span class="badge-cat">${escapeHtml(item.category)}</span><h4>${escapeHtml(item.title)}</h4></div>
        <span class="arrow">${hasContent ? '→' : ''}</span>
      </${tag}>
      ${hasContent ? `<div class="news-body" id="${bodyId}" hidden>${attachmentHtml}${textHtml}</div>` : ''}
    </div>`;
}

function archiveItemHTML(item) {
  return `
    <div class="news-entry">
      <a href="${item.path}" class="news-item" target="_blank" rel="noopener">
        <span class="date">${escapeHtml(item.date)}</span>
        <div><span class="badge-cat">자료</span><h4>${escapeHtml(item.title)}</h4></div>
        <span class="arrow" aria-label="다운로드">⬇</span>
      </a>
    </div>`;
}

function galleryItemHTML(item) {
  return `
    <a class="gallery-item" href="${escapeHtml(item.image)}" target="_blank" rel="noopener">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.caption || item.date)}" loading="lazy">
      <div class="gallery-caption">
        <span class="date">${escapeHtml(item.date)}</span>
        ${item.caption ? `<p>${escapeHtml(item.caption)}</p>` : ''}
      </div>
    </a>`;
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('failed to load ' + path);
  return res.json();
}

// "YYYY.MM.DD" 형식의 날짜 문자열을 비교 가능한 숫자로 변환 (0 패딩 여부와 무관하게 정확히 비교)
function dateSortValue(dateStr) {
  const [y = 0, m = 0, d = 0] = String(dateStr || '').split('.').map(Number);
  return y * 10000 + m * 100 + d;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => dateSortValue(b.date) - dateSortValue(a.date));
}

document.addEventListener('DOMContentLoaded', async () => {
  const noticeList = document.querySelector('[data-list="notice"]');
  const archiveList = document.querySelector('[data-list="archive"]');
  const archiveEmpty = document.querySelector('[data-empty="archive"]');
  const noticeEmpty = document.querySelector('[data-empty="notice"]');
  const previewList = document.querySelector('[data-list="notice-preview"]');
  const galleryList = document.querySelector('[data-list="gallery"]');
  const galleryEmpty = document.querySelector('[data-empty="gallery"]');

  if (previewList) {
    try {
      const items = sortByDateDesc(await loadJSON('data/news.json'));
      previewList.innerHTML = items.slice(0, 3).map(newsItemHTML).join('') ||
        '<p style="color: var(--ink-500); text-align: center; padding: 24px 0;">등록된 소식이 없습니다.</p>';
    } catch (e) {
      previewList.innerHTML = '';
    }
  }

  if (noticeList) {
    try {
      const items = sortByDateDesc(await loadJSON('data/news.json'));
      noticeList.innerHTML = items.length ? items.map(newsItemHTML).join('') : '';
      if (noticeEmpty) noticeEmpty.hidden = items.length > 0;
    } catch (e) {
      noticeList.innerHTML = '<p style="color: var(--ink-500); text-align: center; padding: 40px 0;">공지사항을 불러오지 못했습니다.</p>';
    }
  }

  if (archiveList) {
    try {
      const items = await loadJSON('data/archive.json');
      if (items.length) {
        archiveList.innerHTML = items.map(archiveItemHTML).join('');
        if (archiveEmpty) archiveEmpty.hidden = true;
      } else if (archiveEmpty) {
        archiveEmpty.hidden = false;
      }
    } catch (e) {
      archiveList.innerHTML = '<p style="color: var(--ink-500); text-align: center; padding: 40px 0;">자료실을 불러오지 못했습니다.</p>';
    }
  }

  if (galleryList) {
    try {
      const items = sortByDateDesc(await loadJSON('data/gallery.json'));
      if (items.length) {
        galleryList.innerHTML = items.map(galleryItemHTML).join('');
        if (galleryEmpty) galleryEmpty.hidden = true;
      } else if (galleryEmpty) {
        galleryEmpty.hidden = false;
      }
    } catch (e) {
      galleryList.innerHTML = '<p style="color: var(--ink-500); text-align: center; padding: 40px 0; grid-column: 1/-1;">포토갤러리를 불러오지 못했습니다.</p>';
    }
  }
});

// 공지사항 제목 클릭 시 내용 펼치기/접기 (동적으로 삽입된 요소에도 적용되도록 이벤트 위임 사용)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle="notice"]');
  if (!btn) return;
  const body = document.getElementById(btn.getAttribute('aria-controls'));
  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  if (body) body.hidden = expanded;
});
