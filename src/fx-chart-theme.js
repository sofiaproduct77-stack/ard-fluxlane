(function () {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = 'rgba(30, 41, 59, 0.65)';
  Chart.defaults.font.family = '"Inter", system-ui, sans-serif';

  window.FluxLaneChartTheme = {
    colors: {
      primary: '#38bdf8',
      secondary: '#2563eb',
      danger: '#ef4444',
      muted: '#64748b',
      text: '#f1f5f9',
      grid: 'rgba(30, 41, 59, 0.8)'
    },
    scales() {
      return {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(30, 41, 59, 0.8)' }
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(30, 41, 59, 0.45)' }
        }
      };
    },
    title(text) {
      return {
        display: true,
        text,
        color: '#f1f5f9',
        font: { size: 14, weight: '600' }
      };
    },
    baseOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        devicePixelRatio: window.devicePixelRatio > 1 ? 2 : 1,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', boxWidth: 10, usePointStyle: true }
          }
        }
      };
    }
  };
})();
