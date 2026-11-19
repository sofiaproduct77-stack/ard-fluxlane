(function () {
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function updateClock() {
    const el = document.querySelector('[data-fx-clock]');
    if (!el) return;
    const now = new Date();
    const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const sec = pad(now.getSeconds());
    el.innerHTML = `<span class="fx-clock-date">${date}</span><span class="fx-clock-time">${hm}<span class="fx-clock-sec">:${sec}</span></span>`;
  }

  function setActiveNav() {
    const path = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.fx-nav a, .fx-mobile-nav a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const target = href.split('#')[0] || 'index.html';
      const match =
        (path === '' || path === '/') && (target === 'index.html' || target === '/' || target === '')
          ? href.includes('#') === false
          : target === path;
      a.classList.toggle('is-active', match && !href.startsWith('#'));
    });
  }

  function initMobileNav() {
    const burger = document.querySelector('[data-fx-burger]');
    const panel = document.querySelector('[data-fx-mobile-nav]');
    if (!burger || !panel) return;

    burger.addEventListener('click', () => {
      const open = panel.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    panel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        panel.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  function initDataPulse() {
    const dot = document.querySelector('[data-fx-data-pulse]');
    if (!dot) return;
    fetch('/api/traffic/detectors')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        dot.classList.toggle('is-warn', !Array.isArray(rows) || rows.length === 0);
      })
      .catch(() => dot.classList.add('is-warn'));
  }

  document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);
    setActiveNav();
    initMobileNav();
    initDataPulse();
    const y = document.getElementById('y');
    if (y) y.textContent = String(new Date().getFullYear());
  });
})();
