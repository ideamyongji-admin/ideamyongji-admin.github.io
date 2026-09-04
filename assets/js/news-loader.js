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

function skeletonRows(n) {
  return Array.from({ length: n }, () => `
    <div class="news-entry">
      <div class="news-item" style="pointer-events:none;">
        <span class="skeleton" style="width:60px; height:12px; border-radius:4px;"></span>
        <div style="flex:1; display:flex; flex-direction:column; gap:8px; min-width:0;">
          <span class="skeleton" style="width:44px; height:11px; border-radius:4px;"></span>
          <span class="skeleton" style="width:55%; height:16px; border-radius:4px;"></span>
        </div>
      </div>
    </div>`).join('');
}

function skeletonGallery(n) {
  const heights = [300, 380, 220, 340, 260, 400];
  return Array.from({ length: n }, (_, i) => `
    <div class="gallery-item" style="pointer-events:none;">
      <span class="skeleton" style="display:block; width:100%; height:${heights[i % heights.length]}px; border-radius: var(--radius-md);"></span>
    </div>`).join('');
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

// 업로드 시 파일명 끝에 "_1600x1200"처럼 실제 픽셀 치수를 붙여둡니다(admin.js가 부여).
// 이 값을 <img>의 width/height로 넘기면 브라우저가 로드 전에 비율을 알고 자리를 잡아,
// 매소너리 컬럼이 사진 로드마다 재배치되는 현상(CLS)이 사라집니다.
function sizeAttrs(path) {
  const m = /_(\d{2,5})x(\d{2,5})\.[a-z0-9]+$/i.exec(path || '');
  return m ? ` width="${m[1]}" height="${m[2]}"` : '';
}

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
      ? `<img src="${escapeHtml(item.attachment)}"${sizeAttrs(item.attachment)} alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">`
      : `<a class="btn btn--outline btn--sm" href="${escapeHtml(item.attachment)}" target="_blank" rel="noopener" style="margin-bottom:16px;"><svg class="ic ic--sm" aria-hidden="true" focusable="false"><use href="#i-clip"></use></svg>${escapeHtml(attachmentDisplayName(item.attachment))} 다운로드</a>`;
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
        <span class="arrow"><svg class="ic ic--sm" aria-hidden="true" focusable="false"><use href="#i-download"></use></svg><span class="sr-only">다운로드</span></span>
      </a>
    </div>`;
}

// 예전 단일 이미지 형식({image: "..."})과 새 다중 이미지 형식({images: ["...", ...]})을 모두 지원
function galleryItemImages(item) {
  return Array.isArray(item.images) ? item.images : (item.image ? [item.image] : []);
}

function galleryItemHTML(item, index) {
  const images = galleryItemImages(item);
  const hasMultiple = images.length > 1;
  return `
    <button type="button" class="gallery-item${hasMultiple ? ' has-multiple' : ''}" data-gallery-index="${index}">
      <span class="gallery-media">
        <img src="${escapeHtml(images[0] || '')}"${sizeAttrs(images[0])} alt="${escapeHtml(item.caption || item.date)}" loading="lazy" decoding="async">
        <span class="gallery-overlay">
          <span class="tag tag--date">${escapeHtml(item.date)}</span>
          ${item.caption ? `<span class="tag tag--caption">${escapeHtml(item.caption)}</span>` : ''}
        </span>
      </span>
    </button>`;
}

// 사진이 여러 장인 게시물을 넘겨보기(캐러셀) 형태로 볼 수 있는 라이트박스
function initGalleryLightbox(grid, items) {
  let box = document.getElementById('gallery-lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'gallery-lightbox';
    box.className = 'lightbox';
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '사진 크게 보기');
    box.innerHTML = `
      <button type="button" class="lightbox-close" aria-label="닫기">×</button>
      <button type="button" class="lightbox-prev" aria-label="이전 사진">‹</button>
      <img class="lightbox-img" alt="">
      <button type="button" class="lightbox-next" aria-label="다음 사진">›</button>
      <div class="lightbox-meta"><span class="lightbox-caption"></span><span class="lightbox-counter"></span></div>
    `;
    document.body.appendChild(box);
  }

  const imgEl = box.querySelector('.lightbox-img');
  const captionEl = box.querySelector('.lightbox-caption');
  const counterEl = box.querySelector('.lightbox-counter');
  const prevBtn = box.querySelector('.lightbox-prev');
  const nextBtn = box.querySelector('.lightbox-next');

  let images = [];
  let caption = '';
  let idx = 0;

  function render() {
    imgEl.src = images[idx];
    captionEl.textContent = caption;
    counterEl.textContent = images.length > 1 ? `${idx + 1} / ${images.length}` : '';
    prevBtn.hidden = images.length <= 1;
    nextBtn.hidden = images.length <= 1;
  }
  // 닫을 때 원래 눌렀던 사진 버튼으로 포커스를 돌려주기 위해 기억합니다
  let lastTrigger = null;

  function open(newImages, newCaption, startIndex, trigger) {
    images = newImages;
    caption = newCaption;
    idx = startIndex || 0;
    lastTrigger = trigger || null;
    render();
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    // 다음 프레임에 클래스를 붙여 opacity/scale 트랜지션이 실제로 재생되게 합니다
    requestAnimationFrame(() => box.classList.add('is-open'));
    box.querySelector('.lightbox-close').focus();
  }
  function close() {
    box.classList.remove('is-open');
    box.hidden = true;
    document.body.style.overflow = '';
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
    lastTrigger = null;
  }
  function next() { idx = (idx + 1) % images.length; render(); }
  function prev() { idx = (idx - 1 + images.length) % images.length; render(); }

  box.querySelector('.lightbox-close').addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  nextBtn.addEventListener('click', next);
  prevBtn.addEventListener('click', prev);
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowRight') { next(); return; }
    if (e.key === 'ArrowLeft') { prev(); return; }
    // 포커스 트랩: 오버레이가 열려 있는 동안 Tab이 뒤쪽 페이지로 새어나가지 않게 합니다
    if (e.key === 'Tab') {
      const focusables = [...box.querySelectorAll('button')].filter((b) => !b.hidden);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // 모바일 스와이프로 사진 넘기기 (양 끝 버튼만으로는 한 손 조작이 어려움)
  let touchX = null;
  box.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (touchX === null || images.length <= 1) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 45) return;
    if (dx < 0) next(); else prev();
  }, { passive: true });

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-gallery-index]');
    if (!btn) return;
    const item = items[Number(btn.dataset.galleryIndex)];
    if (!item) return;
    open(galleryItemImages(item), item.caption || '', 0, btn);
  });
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
        '<p class="list-empty">등록된 소식이 없습니다.</p>';
    } catch (e) {
      previewList.innerHTML = '';
    }
  }

  if (noticeList) {
    noticeList.innerHTML = skeletonRows(3);
    try {
      const items = sortByDateDesc(await loadJSON('data/news.json'));
      noticeList.innerHTML = items.length ? items.map(newsItemHTML).join('') : '';
      if (noticeEmpty) noticeEmpty.hidden = items.length > 0;
    } catch (e) {
      noticeList.innerHTML = '<p class="list-empty">공지사항을 불러오지 못했습니다.</p>';
    }
  }

  if (archiveList) {
    archiveList.innerHTML = skeletonRows(3);
    try {
      const items = await loadJSON('data/archive.json');
      if (items.length) {
        archiveList.innerHTML = items.map(archiveItemHTML).join('');
        if (archiveEmpty) archiveEmpty.hidden = true;
      } else if (archiveEmpty) {
        archiveEmpty.hidden = false;
      }
    } catch (e) {
      archiveList.innerHTML = '<p class="list-empty">자료실을 불러오지 못했습니다.</p>';
    }
  }

  if (galleryList) {
    galleryList.innerHTML = skeletonGallery(6);
    try {
      const items = sortByDateDesc(await loadJSON('data/gallery.json'));
      if (items.length) {
        galleryList.innerHTML = items.map(galleryItemHTML).join('');
        if (galleryEmpty) galleryEmpty.hidden = true;
        initGalleryLightbox(galleryList, items);
      } else if (galleryEmpty) {
        galleryEmpty.hidden = false;
      }
    } catch (e) {
      galleryList.innerHTML = '<p class="list-empty">포토갤러리를 불러오지 못했습니다.</p>';
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
