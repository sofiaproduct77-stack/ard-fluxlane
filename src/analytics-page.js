(function () {
  let intensityChart;
  let speedChart;

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 },
        grid: { color: 'rgba(30, 41, 59, 0.8)' }
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(30, 41, 59, 0.8)' }
      }
    }
  };

  function defaultRange() {
    const fromInput = document.getElementById('fx-from');
    const toInput = document.getElementById('fx-to');
    if (!fromInput || !toInput) return;
    fromInput.value = '2020-01-01T00:00';
    toInput.value = '2030-12-31T23:59';
  }

  async function loadStats() {
    const from = document.getElementById('fx-from').value;
    const to = document.getElementById('fx-to').value;
    if (!from || !to) return;

    const q = new URLSearchParams({ from: new Date(from).toISOString(), to: new Date(to).toISOString() });
    const res = await fetch(`/api/traffic/edge-stats?${q}`);
    if (!res.ok) {
      alert('Не удалось загрузить статистику. Проверьте период и наличие треков.');
      return;
    }
    const data = await res.json();
    const edges = (data.edges || []).sort((a, b) => b.count - a.count).slice(0, 12);
    const labels = edges.map((e) => `${e.fromId}→${e.toId}`);
    const counts = edges.map((e) => e.count);
    const speeds = edges.map((e) => (e.avgSpeed != null ? Math.round(e.avgSpeed * 10) / 10 : 0));

    const ic = document.getElementById('fx-intensity-chart');
    const sc = document.getElementById('fx-speed-chart');
    if (intensityChart) intensityChart.destroy();
    if (speedChart) speedChart.destroy();

    intensityChart = new Chart(ic, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Проезды',
            data: counts,
            backgroundColor: 'rgba(37, 99, 235, 0.75)',
            borderColor: '#2563eb',
            borderWidth: 1
          }
        ]
      },
      options: {
        ...chartDefaults,
        plugins: {
          ...chartDefaults.plugins,
          title: { display: true, text: 'Топ участков по интенсивности', color: '#f1f5f9' }
        }
      }
    });

    speedChart = new Chart(sc, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'км/ч',
            data: speeds,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            fill: true,
            tension: 0.3
          }
        ]
      },
      options: {
        ...chartDefaults,
        plugins: {
          ...chartDefaults.plugins,
          title: { display: true, text: 'Средняя скорость на участках', color: '#f1f5f9' }
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    defaultRange();
    document.getElementById('fx-load-stats')?.addEventListener('click', loadStats);
    loadStats().catch(() => {});
  });
})();
