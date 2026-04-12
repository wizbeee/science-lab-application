// chart-helpers.js - Chart.js 래퍼
const ChartHelpers = {
  instances: new Map(),

  destroy(canvasId) {
    if (this.instances.has(canvasId)) {
      this.instances.get(canvasId).destroy();
      this.instances.delete(canvasId);
    }
  },

  create(canvasId, config) {
    this.destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const chart = new Chart(canvas.getContext('2d'), config);
    this.instances.set(canvasId, chart);
    return chart;
  },

  // 막대 차트
  bar(canvasId, { labels, datasets, title, horizontal = false, stacked = false }) {
    return this.create(canvasId, {
      type: 'bar',
      data: { labels, datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: ds.color || Utils.getColor(i),
        borderRadius: 4
      }))},
      options: {
        responsive: true, maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { title: { display: !!title, text: title }, legend: { display: datasets.length > 1 } },
        scales: {
          x: { stacked, grid: { display: false } },
          y: { stacked, beginAtZero: true }
        }
      }
    });
  },

  // 파이/도넛 차트
  pie(canvasId, { labels, data, title, doughnut = false }) {
    return this.create(canvasId, {
      type: doughnut ? 'doughnut' : 'pie',
      data: {
        labels,
        datasets: [{ data, backgroundColor: labels.map((_, i) => Utils.getColor(i)) }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          title: { display: !!title, text: title },
          legend: { position: 'right', labels: { boxWidth: 12 } }
        }
      }
    });
  },

  // 꺾은선 차트
  line(canvasId, { labels, datasets, title }) {
    return this.create(canvasId, {
      type: 'line',
      data: { labels, datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.color || Utils.getColor(i),
        backgroundColor: (ds.color || Utils.getColor(i)) + '20',
        fill: ds.fill || false,
        tension: 0.3,
        pointRadius: 4
      }))},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { title: { display: !!title, text: title } },
        scales: { y: { beginAtZero: false } }
      }
    });
  },

  // 점수 분포 히스토그램
  histogram(canvasId, { data, title, ranges }) {
    const dist = Utils.distribution(data, ranges);
    return this.bar(canvasId, {
      labels: dist.map(d => d.label),
      datasets: [{ label: '인원', data: dist.map(d => d.count), color: '#3B82F6' }],
      title
    });
  },

  // 박스플롯 (간이 - 수평 막대로 표현)
  boxPlot(canvasId, { groups, title }) {
    const labels = groups.map(g => g.label);
    const mins = groups.map(g => Utils.min(g.data));
    const q1s = groups.map(g => Utils.percentile(g.data, 25));
    const medians = groups.map(g => Utils.median(g.data));
    const q3s = groups.map(g => Utils.percentile(g.data, 75));
    const maxs = groups.map(g => Utils.max(g.data));

    return this.create(canvasId, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '최소~Q1', data: q1s.map((v, i) => v - mins[i]), backgroundColor: '#93C5FD', stack: 'box' },
          { label: 'Q1~중앙', data: medians.map((v, i) => v - q1s[i]), backgroundColor: '#3B82F6', stack: 'box' },
          { label: '중앙~Q3', data: q3s.map((v, i) => v - medians[i]), backgroundColor: '#2563EB', stack: 'box' },
          { label: 'Q3~최대', data: maxs.map((v, i) => v - q3s[i]), backgroundColor: '#1D4ED8', stack: 'box' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { title: { display: !!title, text: title }, legend: { display: false } },
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } }
      }
    });
  }
};

window.ChartHelpers = ChartHelpers;
