(function () {
  const feed = window.FluxLaneNewsFeed;

  async function loadHomeNews() {
    const grid = document.getElementById('fx-news-grid');
    const empty = document.getElementById('fx-news-empty');
    const moreBtn = document.getElementById('fx-news-all-btn');
    if (!grid || !feed) return;

    try {
      const res = await fetch('/api/news?limit=5', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      const items = Array.isArray(payload.data) ? payload.data : [];
      const total = payload.pagination?.total ?? items.length;

      if (!items.length) {
        grid.innerHTML = '';
        if (empty) empty.hidden = false;
        if (moreBtn) moreBtn.hidden = true;
        return;
      }
      if (empty) empty.hidden = true;
      grid.classList.add('fx-news-grid--home');
      grid.innerHTML = items.map((n) => feed.newsCard(n, true)).join('');
      if (moreBtn) moreBtn.hidden = total <= 5;
    } catch (e) {
      console.warn('[FluxLane] news', e);
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Не удалось загрузить новости.';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', loadHomeNews);
})();
