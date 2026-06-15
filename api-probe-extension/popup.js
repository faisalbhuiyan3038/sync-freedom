/**
 * Sync Freedom — API Probe: Popup Script
 *
 * Reads probe results from chrome.storage.local and renders them
 * in the popup UI with categorized, collapsible sections.
 */

// ─── Elements ─────────────────────────────────────────────────────────

const summaryBar = document.getElementById('summaryBar');
const deviceInfoEl = document.getElementById('deviceInfo');
const resultsContainer = document.getElementById('resultsContainer');
const btnRunAgain = document.getElementById('btnRunAgain');
const btnExport = document.getElementById('btnExport');
const timestampEl = document.getElementById('timestamp');
const toastEl = document.getElementById('toast');

// ─── Rendering ────────────────────────────────────────────────────────

function renderSummary(summary) {
  const pct = summary.total > 0
    ? Math.round((summary.pass / summary.total) * 100)
    : 0;

  summaryBar.innerHTML = `
    <span class="summary-stat">
      <span class="dot dot-pass"></span>
      <span class="count">${summary.pass}</span>
      <span class="label">passed</span>
    </span>
    <span class="summary-stat">
      <span class="dot dot-fail"></span>
      <span class="count">${summary.fail}</span>
      <span class="label">failed</span>
    </span>
    <span class="summary-stat">
      <span class="dot dot-total"></span>
      <span class="count">${summary.total}</span>
      <span class="label">total</span>
    </span>
    <span class="summary-pct">${pct}%</span>
  `;
}

function renderDeviceInfo(info) {
  if (!info) return;

  const fields = [
    ['User Agent', info.userAgent],
    ['Platform', info.platform],
    ['OS', info.os],
    ['Arch', info.arch],
    ['Language', info.language],
    ['Runtime ID', info.runtimeId],
    ['Manifest V', info.manifestVersion],
  ];

  let html = '<div class="device-info-grid">';
  for (const [label, value] of fields) {
    if (!value || value === 'unavailable') continue;
    html += `<span class="di-label">${label}</span><span class="di-value">${escapeHtml(String(value))}</span>`;
  }
  html += '</div>';

  deviceInfoEl.innerHTML = html;
  deviceInfoEl.classList.add('visible');
}

function renderResults(results) {
  // Group by API
  const groups = {};
  for (const r of results) {
    if (!groups[r.api]) groups[r.api] = [];
    groups[r.api].push(r);
  }

  let html = '';
  for (const [api, tests] of Object.entries(groups)) {
    const passCount = tests.filter(t => t.status === 'pass').length;
    const failCount = tests.filter(t => t.status === 'fail').length;
    const allPass = failCount === 0;

    html += `
      <div class="category${allPass ? '' : ''}">
        <div class="category-header" onclick="toggleCategory(this)">
          <span class="category-name">${escapeHtml(api)}</span>
          <span class="category-badge">
            ${passCount > 0 ? `<span class="badge badge-pass">✓ ${passCount}</span>` : ''}
            ${failCount > 0 ? `<span class="badge badge-fail">✗ ${failCount}</span>` : ''}
            <svg class="category-chevron" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
        </div>
        <div class="category-body">
    `;

    for (const t of tests) {
      const icon = t.status === 'pass' ? '✅' : '❌';
      const statusClass = t.status === 'pass' ? 'status-pass' : 'status-fail';

      html += `
        <div class="test-row">
          <span class="test-icon">${icon}</span>
          <div>
            <div class="test-method">${escapeHtml(t.method)}</div>
            ${t.detail ? `<div class="test-detail">${escapeHtml(t.detail)}</div>` : ''}
          </div>
          <span class="test-status ${statusClass}">${t.status}</span>
        </div>
      `;
    }

    html += '</div></div>';
  }

  resultsContainer.innerHTML = html;
}

// ─── Interactions ─────────────────────────────────────────────────────

function toggleCategory(headerEl) {
  const category = headerEl.closest('.category');
  category.classList.toggle('collapsed');
}

// Make it global for onclick
window.toggleCategory = toggleCategory;

function showToast(message, duration = 2500) {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  setTimeout(() => toastEl.classList.remove('visible'), duration);
}

btnRunAgain.addEventListener('click', async () => {
  btnRunAgain.classList.add('running');
  btnRunAgain.disabled = true;
  btnRunAgain.querySelector('.btn-icon').style.animation = 'spin 1s linear infinite';

  try {
    await chrome.runtime.sendMessage({ type: 'RUN_PROBES' });
    showToast('Tests running… results will refresh shortly.');

    // Wait a moment then reload
    setTimeout(() => loadResults(), 3000);
  } catch (err) {
    showToast('Error: ' + err.message);
  } finally {
    setTimeout(() => {
      btnRunAgain.classList.remove('running');
      btnRunAgain.disabled = false;
      btnRunAgain.querySelector('.btn-icon').style.animation = '';
    }, 3500);
  }
});

btnExport.addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get('probeReport');
    if (!data.probeReport) {
      showToast('No results to export');
      return;
    }

    const json = JSON.stringify(data.probeReport, null, 2);
    await navigator.clipboard.writeText(json);
    showToast('Results copied to clipboard! 📋');
  } catch (err) {
    // Fallback: create a downloadable blob
    try {
      const data = await chrome.storage.local.get('probeReport');
      const json = JSON.stringify(data.probeReport, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `api-probe-results-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Results downloaded as JSON file');
    } catch (err2) {
      showToast('Export failed: ' + err2.message);
    }
  }
});

// ─── Load ─────────────────────────────────────────────────────────────

async function loadResults() {
  try {
    const data = await chrome.storage.local.get('probeReport');
    const report = data.probeReport;

    if (!report) {
      summaryBar.innerHTML = '<span class="summary-loading">Waiting for probe results… Tests run automatically on install.</span>';
      return;
    }

    renderSummary(report.summary);
    renderDeviceInfo(report.deviceInfo);
    renderResults(report.results);

    const ts = new Date(report.ranAt);
    timestampEl.textContent = `Last run: ${ts.toLocaleString()}`;

    btnRunAgain.disabled = false;
    btnExport.disabled = false;
  } catch (err) {
    resultsContainer.innerHTML = `<p class="empty-state">Error loading results: ${escapeHtml(err.message)}</p>`;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initial load
loadResults();
