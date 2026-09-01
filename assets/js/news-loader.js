// 사업단소식(공지사항/자료실) 목록을 data/news.json, data/archive.json에서 불러와 렌더링합니다.
// 게시글 등록/삭제는 admin.html에서 GitHub API를 통해 두 JSON 파일을 직접 수정합니다.

function newsItemHTML(item) {
  return `
    <div class="news-item">
      <span class="date">${item.date}</span>
      <div><span class="badge-cat">${item.category}</span><h4>${item.title}</h4></div>
      <span class="arrow">→</span>
    </div>`;
}

function archiveItemHTML(item) {
  return `
    <div class="news-item">
      <span class="date">${item.date}</span>
      <div><span class="badge-cat">자료</span><h4>${item.title}</h4></div>
      <a href="${item.path}" class="arrow" target="_blank" rel="noopener" aria-label="다운로드">⬇</a>
    </div>`;
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error('failed to load ' + path);
  return res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  const noticeList = document.querySelector('[data-list="notice"]');
  const archiveList = document.querySelector('[data-list="archive"]');
  const archiveEmpty = document.querySelector('[data-empty="archive"]');
  const noticeEmpty = document.querySelector('[data-empty="notice"]');
  const previewList = document.querySelector('[data-list="notice-preview"]');

  if (previewList) {
    try {
      const items = await loadJSON('data/news.json');
      previewList.innerHTML = items.slice(0, 3).map(newsItemHTML).join('') ||
        '<p style="color: var(--ink-500); text-align: center; padding: 24px 0;">등록된 소식이 없습니다.</p>';
    } catch (e) {
      previewList.innerHTML = '';
    }
  }

  if (noticeList) {
    try {
      const items = await loadJSON('data/news.json');
      if (items.length) {
        noticeList.innerHTML = items.map(newsItemHTML).join('');
        if (noticeEmpty) noticeEmpty.hidden = true;
      } else if (noticeEmpty) {
        noticeEmpty.hidden = false;
      }
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
});
