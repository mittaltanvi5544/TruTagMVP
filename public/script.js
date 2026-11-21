const menuButton = document.querySelector('.menu-toggle');
const portalNav = document.querySelector('#portal-nav');
document.querySelectorAll('[data-year]').forEach(function (item) { item.textContent = new Date().getFullYear(); });

if (menuButton && portalNav) {
  menuButton.addEventListener('click', function () {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    portalNav.classList.toggle('is-open', !open);
  });
  portalNav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      menuButton.setAttribute('aria-expanded', 'false');
      portalNav.classList.remove('is-open');
    });
  });
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function notify(message) {
  const element = document.querySelector('.toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('visible');
  window.setTimeout(function () { element.classList.remove('visible'); }, 3000);
}

async function api(url, options) {
  const settings = options || {};
  const response = await fetch(url, {
    method: settings.method || 'GET',
    headers: settings.body ? { 'Content-Type': 'application/json' } : {},
    body: settings.body ? JSON.stringify(settings.body) : undefined
  });
  const result = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(result.error || 'Request failed (HTTP ' + response.status + ') for ' + new URL(url, window.location.href).pathname + '.');
  return result;
}

function showDetails(id) {
  const dialog = document.querySelector('#inspection-dialog');
  const content = document.querySelector('#inspection-detail');
  if (!dialog || !content) return;
  api('/api/inspections/' + encodeURIComponent(id)).then(function (data) {
    const inspection = data.inspection;
    const rows = [
      ['Inspection ID', inspection.id],
      ['Shop', data.shop ? data.shop.name : 'Unknown shop'],
      ['Inspector', data.inspector ? data.inspector.name : 'Unassigned'],
      ['Date', new Date(inspection.date).toLocaleString()],
      ['Status', inspection.status.replace('_', ' ')],
      ['Violations', inspection.violations],
      ['Findings', inspection.summary || 'No findings recorded']
    ];
    content.innerHTML = '<p class="eyebrow">Inspection record</p><h2>' + escapeHtml(inspection.id) + '</h2>' +
      rows.map(function (row) { return '<div class="detail-row"><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>'; }).join('') +
      ((inspection.declarations || []).length ? '<h3>Recorded declarations and findings</h3>' + inspection.declarations.map(function (declaration) {
        const severity = declaration.status === 'Non-compliant' ? (declaration.severity || 'Severity not recorded') : '—';
        const resolution = declaration.status === 'Non-compliant' && declaration.resolutionStatus === 'resolved' && declaration.resolutionVerifiedAt
          ? 'Resolution verified ' + new Date(declaration.resolutionVerifiedAt).toLocaleString()
          : declaration.status === 'Non-compliant' ? declaration.resolutionStatus === 'outstanding' ? 'Outstanding · resolution not verified' : 'Resolution not recorded; treated as outstanding' : 'No confirmed violation';
        return '<div class="detail-row"><strong>' + escapeHtml(declaration.label) + '</strong><span>' + escapeHtml(declaration.status) + ' · ' + escapeHtml(severity) + '<br>' + escapeHtml(resolution) + '</span></div>';
      }).join('') : '');
    dialog.showModal();
  }).catch(function (error) { notify(error.message); });
}

document.addEventListener('click', function (event) {
  const button = event.target.closest('[data-inspection-detail]');
  if (button) showDetails(button.dataset.inspectionDetail);
});

/* Department Admin */
const inspectorForm = document.querySelector('#add-inspector-form');
if (inspectorForm) {
  let adminData;
  let activityChart;
  async function loadInspectionActivity() {
    const message = document.querySelector('#activity-chart-message');
    const chartCanvas = document.querySelector('#activity-chart');
    try {
      const days = document.querySelector('#activity-range').value;
      const chartData = await api('/api/admin/inspection-activity?days=' + encodeURIComponent(days));
      if (chartData.totalInspectionRecords === 0) {
        if (activityChart) { activityChart.destroy(); activityChart = null; }
        chartCanvas.hidden = true;
        message.textContent = 'No inspection records are available yet.';
        return;
      }
      chartCanvas.hidden = false;
      message.textContent = '';
      const labels = chartData.labels.map(function (date) {
        return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
      });
      const config = {
        type: 'line',
        data: { labels: labels, datasets: [{
          label: 'Inspections', data: chartData.counts, borderColor: '#142D4E', backgroundColor: 'rgba(242, 140, 40, 0.14)',
          pointBackgroundColor: '#F28C28', pointBorderColor: '#FFFFFF', pointBorderWidth: 2, pointRadius: chartData.days === 7 ? 4 : 2.5,
          pointHoverRadius: 6, borderWidth: 2.5, tension: 0.28, fill: true
        }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: true },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: {
              title: function (items) { return chartData.labels[items[0].dataIndex]; },
              label: function (item) { return 'Inspections: ' + item.raw; }
            } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#687b8a', maxTicksLimit: chartData.days === 7 ? 7 : chartData.days === 30 ? 10 : 12, maxRotation: 0 } },
            y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1, color: '#687b8a' }, title: { display: true, text: 'Number of inspections', color: '#526778' }, grid: { color: '#e8edf1' } }
          }
        }
      };
      if (activityChart) {
        activityChart.data = config.data;
        activityChart.options = config.options;
        activityChart.update();
      } else if (window.Chart) {
        activityChart = new Chart(chartCanvas, config);
      } else {
        message.textContent = 'The activity graph could not load. Refresh the page to try again.';
      }
    } catch (error) {
      console.error('[admin-activity] Could not fetch daily inspection activity:', error);
      message.textContent = error.message || 'Could not load inspection activity.';
    }
  }

  document.querySelector('#activity-range').addEventListener('change', loadInspectionActivity);
  async function loadAdmin() {
    const results = await Promise.all([api('/api/admin/overview'), api('/api/admin/reports'), api('/api/admin/inspection-priorities')]);
    adminData = results[0];
    const reportRecords = results[1].reports;
    const priorities = results[2].priorities;
    const summary = adminData.summary;
    document.querySelector('#admin-metrics').innerHTML = [
      ['Registered inspectors', summary.totalInspectors, 'Department directory'],
      ['Registered shops', summary.totalShops, 'Shop directory'],
      ['Completed inspections', summary.completedInspections, 'Recorded as complete'],
      ['Pending inspections', summary.pendingInspections, 'Awaiting completion']
    ].map(function (item) { return '<article class="metric"><span>' + item[0] + '</span><strong>' + item[1] + '</strong><small>' + item[2] + '</small></article>'; }).join('');

    document.querySelector('#admin-inspectors').innerHTML = adminData.inspectors.map(function (person) {
      return '<tr><td><strong>' + escapeHtml(person.name) + '</strong><small>' + escapeHtml(person.email) + '</small></td><td>' + escapeHtml(person.department) + '</td><td>' + escapeHtml(person.jurisdiction) + '</td><td><span class="status-tag ' + person.status + '">' + escapeHtml(person.status) + '</span></td><td><button class="action-link" data-toggle-inspector="' + escapeHtml(person.id) + '" data-status="' + (person.status === 'active' ? 'suspended' : 'active') + '">' + (person.status === 'active' ? 'Suspend' : 'Reactivate') + '</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty-row">No inspectors registered.</td></tr>';

    document.querySelector('#admin-shops').innerHTML = adminData.shops.map(function (shop) {
      const eligible = adminData.inspectors.filter(function (person) { return person.status === 'active' && person.jurisdiction === shop.jurisdiction; });
      const options = '<option value="">Unassigned</option>' + eligible.map(function (person) {
        return '<option value="' + escapeHtml(person.id) + '" ' + (shop.inspectorId === person.id ? 'selected' : '') + '>' + escapeHtml(person.name) + '</option>';
      }).join('');
      return '<tr><td><strong>' + escapeHtml(shop.name) + '</strong><small>' + escapeHtml(shop.owner) + ' · ' + escapeHtml(shop.category) + '</small></td><td>' + escapeHtml(shop.jurisdiction) + '</td><td><select class="assign-select" data-assign-shop="' + escapeHtml(shop.id) + '">' + options + '</select></td></tr>';
    }).join('') || '<tr><td colspan="3" class="empty-row">No shops registered.</td></tr>';

    document.querySelector('#admin-inspections').innerHTML = reportRecords.map(function (record, index) {
      const inspectionDate = new Date(record.date);
      const formattedDate = Number.isNaN(inspectionDate.getTime()) ? 'Date unavailable' : inspectionDate.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return '<tr><td>' + (index + 1) + '</td><td><strong>' + escapeHtml(record.id) + '</strong></td><td>' + escapeHtml(record.inspectorName) + '</td><td>' + escapeHtml(record.shopName) + '</td><td>' + escapeHtml(formattedDate) + '</td><td><span class="status-tag ' + escapeHtml(record.status) + '">' + escapeHtml(String(record.status).replace('_', ' ')) + '</span></td><td><button class="action-link" data-inspection-detail="' + escapeHtml(record.id) + '">View Report</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty-row">No other inspection reports available.</td></tr>';
    document.querySelector('#admin-priorities').innerHTML = priorities.map(function (business, index) {
      const priorityClass = String(business.priority).toLowerCase().replace(/\s+/g, '-');
      const date = business.lastInspectionDate ? new Date(business.lastInspectionDate) : null;
      const formattedDate = date && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No completed report';
      const findings = business.outstandingViolations.length ? business.outstandingViolations.map(function (finding) {
        return '<div class="priority-finding"><span class="priority-finding-label">' + escapeHtml(finding.label) + ' · ' + escapeHtml(finding.severity || 'Severity not recorded') + '</span><small>' + escapeHtml(finding.resolutionStatus) + '</small><button class="priority-action-button" type="button" data-verify-finding-report="' + escapeHtml(finding.inspectionId) + '" data-verify-finding-id="' + escapeHtml(finding.id) + '">Verify resolution</button></div>';
      }).join('') : '<span>No outstanding violations recorded</span>';
      const followUpClass = 'priority-status-' + String(business.followUpStatus).toLowerCase();
      const followUpAction = !business.lastInspectionId ? '<span>Initial inspection required</span>' : business.followUpStatus === 'Scheduled' ? '<button class="priority-action-button" type="button" disabled>Follow-up scheduled</button>' : business.followUpStatus === 'Completed' ? '<span>Follow-up complete</span>' : '<button class="priority-action-button" type="button" data-schedule-follow-up="' + escapeHtml(business.shopId) + '">Schedule follow-up</button>';
      const reportAction = business.lastInspectionId ? '<button class="priority-action-button" type="button" data-inspection-detail="' + escapeHtml(business.lastInspectionId) + '">View previous report</button>' : '<span>No report available</span>';
      return '<tr><td>' + (index + 1) + '</td><td><span class="priority-badge priority-' + priorityClass + '">' + escapeHtml(business.priority) + '</span></td><td><strong>' + escapeHtml(business.shopName) + '</strong></td><td>' + escapeHtml(business.shopId) + '</td><td>' + escapeHtml(business.previousInspectorName) + '</td><td>' + escapeHtml(formattedDate) + '</td><td>' + escapeHtml(business.previousInspectionSeverity) + '</td><td>' + findings + '</td><td><span class="' + followUpClass + '">' + escapeHtml(business.followUpStatus) + '</span></td><td>' + escapeHtml(business.reason) + '</td><td><div class="priority-actions"><span>' + escapeHtml(business.recommendedAction) + '</span>' + reportAction + followUpAction + '</div></td></tr>';
    }).join('') || '<tr><td colspan="11" class="empty-row">No businesses are available for inspection prioritisation.</td></tr>';
    await loadInspectionActivity();
  }

  inspectorForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(inspectorForm).entries());
    try { await api('/api/admin/inspectors', { method: 'POST', body: values }); inspectorForm.reset(); await loadAdmin(); notify('Inspector added.'); }
    catch (error) { notify(error.message); }
  });
  document.querySelector('#add-shop-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try { await api('/api/admin/shops', { method: 'POST', body: values }); form.reset(); await loadAdmin(); notify('Shop added.'); }
    catch (error) { notify(error.message); }
  });
  document.querySelector('#admin-inspectors').addEventListener('click', async function (event) {
    const button = event.target.closest('[data-toggle-inspector]');
    if (!button) return;
    try { await api('/api/admin/inspectors/' + encodeURIComponent(button.dataset.toggleInspector) + '/status', { method: 'PATCH', body: { status: button.dataset.status } }); await loadAdmin(); notify('Inspector status updated.'); }
    catch (error) { notify(error.message); }
  });
  document.querySelector('#admin-shops').addEventListener('change', async function (event) {
    const select = event.target.closest('[data-assign-shop]');
    if (!select) return;
    try { await api('/api/admin/shops/' + encodeURIComponent(select.dataset.assignShop) + '/assignment', { method: 'PATCH', body: { inspectorId: select.value || null } }); await loadAdmin(); notify('Shop assignment saved.'); }
    catch (error) { notify(error.message); }
  });
  document.querySelector('#admin-priorities').addEventListener('click', async function (event) {
    const scheduleButton = event.target.closest('[data-schedule-follow-up]');
    const verifyButton = event.target.closest('[data-verify-finding-report]');
    try {
      if (scheduleButton) {
        await api('/api/admin/shops/' + encodeURIComponent(scheduleButton.dataset.scheduleFollowUp) + '/follow-up', { method: 'PATCH', body: {} });
        await loadAdmin();
        notify('Follow-up inspection scheduled.');
      } else if (verifyButton && window.confirm('Confirm that this violation was resolved and verify it for the business record?')) {
        await api('/api/admin/inspections/' + encodeURIComponent(verifyButton.dataset.verifyFindingReport) + '/findings/' + encodeURIComponent(verifyButton.dataset.verifyFindingId) + '/verify-resolution', { method: 'PATCH', body: {} });
        await loadAdmin();
        notify('Violation resolution verified.');
      }
    } catch (error) { notify(error.message); }
  });
  loadAdmin().catch(function (error) { notify(error.message); });
}

/* Inspector */
const inspectorSelect = document.querySelector('#inspector-select');
if (inspectorSelect) {
  let currentInspectorId = 'INS-1001';
  let activeInspection = null;
  async function loadInspector(id) {
    const data = await api('/api/inspector/data?inspectorId=' + encodeURIComponent(id));
    currentInspectorId = id;
    document.querySelector('#inspector-meta').textContent = data.inspector.department + ' · ' + data.inspector.jurisdiction + ' · ' + data.inspector.status;
    document.querySelector('#assigned-shops').innerHTML = data.shops.map(function (shop) {
      return '<article class="shop-card"><span class="card-label">' + escapeHtml(shop.category) + '</span><h3>' + escapeHtml(shop.name) + '</h3><p>' + escapeHtml(shop.owner) + ' · ' + escapeHtml(shop.jurisdiction) + '</p><div class="shop-card-foot"><span>' + escapeHtml(shop.id) + '</span><button class="button" data-start-inspection="' + escapeHtml(shop.id) + '" ' + (data.inspector.status !== 'active' ? 'disabled' : '') + '>Start inspection</button></div></article>';
    }).join('') || '<p class="empty-row">No shops are currently assigned to this inspector.</p>';
    document.querySelector('#inspector-history').innerHTML = data.inspections.map(function (record) {
      return '<tr><td><strong>' + escapeHtml(record.id) + '</strong></td><td>' + escapeHtml(new Date(record.date).toLocaleDateString()) + '</td><td>' + escapeHtml(record.shopName) + '</td><td><span class="status-tag ' + record.status + '">' + escapeHtml(record.status.replace('_', ' ')) + '</span></td><td>' + Number(record.violations || 0) + '</td><td><button class="action-link" data-inspection-detail="' + escapeHtml(record.id) + '">Open details</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty-row">No previous inspections.</td></tr>';
  }
  api('/api/admin/overview').then(function (data) {
    inspectorSelect.innerHTML = data.inspectors.map(function (person) {
      return '<option value="' + escapeHtml(person.id) + '">' + escapeHtml(person.name) + (person.status === 'suspended' ? ' (suspended)' : '') + '</option>';
    }).join('');
    inspectorSelect.value = currentInspectorId;
    return loadInspector(currentInspectorId);
  }).catch(function (error) { notify(error.message); });
  inspectorSelect.addEventListener('change', function () { loadInspector(inspectorSelect.value).catch(function (error) { notify(error.message); }); });
  document.querySelector('#assigned-shops').addEventListener('click', async function (event) {
    const button = event.target.closest('[data-start-inspection]');
    if (!button) return;
    button.disabled = true;
    try {
      const result = await api('/api/inspections', { method: 'POST', body: { inspectorId: currentInspectorId, shopId: button.dataset.startInspection } });
      activeInspection = result.inspection;
      document.querySelector('#active-shop-name').textContent = result.shopName;
      document.querySelector('#active-inspection-id').textContent = activeInspection.id;
      document.querySelector('#inspection-qr').src = activeInspection.qrCode;
      document.querySelector('#active-inspection').classList.remove('hidden');
      document.querySelector('#active-inspection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      await loadInspector(currentInspectorId);
      notify('Inspection started. QR code is ready to scan.');
    } catch (error) { notify(error.message); button.disabled = false; }
  });
  document.querySelector('#complete-inspection-form').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!activeInspection) return;
    const form = event.currentTarget;
    try {
      await api('/api/inspections/' + encodeURIComponent(activeInspection.id) + '/complete', { method: 'PATCH', body: { inspectorId: currentInspectorId, summary: form.summary.value, violations: Number(form.violations.value) } });
      form.reset();
      activeInspection = null;
      document.querySelector('#active-inspection').classList.add('hidden');
      await loadInspector(currentInspectorId);
      notify('Inspection completed and saved.');
    } catch (error) { notify(error.message); }
  });
}

/* Business Owner */
const shopProfile = document.querySelector('#shop-profile');
if (shopProfile) {
  api('/api/business-owner/data').then(function (data) {
    const shop = data.shop;
    const values = [
      ['Shop name', shop.name], ['Shop ID', shop.id], ['Owner', shop.owner],
      ['Category', shop.category], ['Jurisdiction', shop.jurisdiction],
      ['Assigned inspector', shop.inspector ? shop.inspector.name : 'Not assigned']
    ];
    shopProfile.innerHTML = values.map(function (row) { return '<div><span>' + row[0] + '</span><strong>' + escapeHtml(row[1]) + '</strong></div>'; }).join('');
    document.querySelector('#shop-reports').innerHTML = data.reports.map(function (report) {
      return '<tr><td><strong>' + escapeHtml(report.id) + '</strong></td><td>' + escapeHtml(new Date(report.date).toLocaleDateString()) + '</td><td>' + escapeHtml(report.inspectorName) + '</td><td><span class="status-tag ' + report.status + '">' + escapeHtml(report.status.replace('_', ' ')) + '</span></td><td>' + Number(report.violations || 0) + '</td><td><button class="action-link" data-inspection-detail="' + escapeHtml(report.id) + '">View report</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty-row">No inspection reports are available.</td></tr>';
  }).catch(function (error) { notify(error.message); });
}

/* Public QR verification */
const verifyForm = document.querySelector('#verify-form');
if (verifyForm) {
  const resultPanel = document.querySelector('#verify-result');
  async function verifyToken(input) {
    let token = String(input || '').trim();
    try {
      if (token.indexOf('http://') === 0 || token.indexOf('https://') === 0) token = new URL(token).searchParams.get('token') || '';
      const result = await api('/api/verify', { method: 'POST', body: { token: token } });
      if (!result.verified) {
        resultPanel.innerHTML = '<span class="result-mark denied">!</span><h2>Not verified</h2><p>' + escapeHtml(result.message) + '</p>';
        return;
      }
      resultPanel.innerHTML = '<span class="result-mark verified">✓</span><h2>Inspector verified</h2><p>' + escapeHtml(result.message) + '</p><div class="result-details">' +
        '<div class="detail-row"><strong>Inspector</strong><span>' + escapeHtml(result.inspector.name) + ' · ' + escapeHtml(result.inspector.department) + '</span></div>' +
        '<div class="detail-row"><strong>Shop</strong><span>' + escapeHtml(result.shop.name) + '</span></div>' +
        '<div class="detail-row"><strong>Jurisdiction</strong><span>' + escapeHtml(result.shop.jurisdiction) + '</span></div>' +
        '<div class="detail-row"><strong>Inspection</strong><span>' + escapeHtml(result.inspection.id) + ' · ' + escapeHtml(result.inspection.status.replace('_', ' ')) + '</span></div></div>';
    } catch (error) {
      resultPanel.innerHTML = '<span class="result-mark denied">!</span><h2>Not verified</h2><p>' + escapeHtml(error.message) + '</p>';
    }
  }
  verifyForm.addEventListener('submit', function (event) { event.preventDefault(); verifyToken(verifyForm.token.value); });
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) { verifyForm.token.value = token; verifyToken(token); }
}

/* Public Inspector Passport verification */
const passportPublicResult = document.querySelector('#passport-public-result');
if (passportPublicResult) {
  const params = new URLSearchParams(window.location.search);
  const inspectorId = params.get('inspectorId');
  const token = params.get('token');
  if (!inspectorId || !token) {
    passportPublicResult.innerHTML = '<span class="result-mark denied">!</span><h2>Passport not verified</h2><p>This link is missing the Inspector Passport credentials.</p>';
  } else {
    api('/api/verify-inspector', { method: 'POST', body: { inspectorId: inspectorId, token: token } }).then(function (result) {
      const active = Boolean(result.verified);
      const matched = Boolean(result.identityMatched);
      const person = result.inspector || {};
      const details = matched
        ? '<div class="detail-row"><strong>Full name</strong><span>' + escapeHtml(person.fullName) + '</span></div>' +
          '<div class="detail-row"><strong>Inspector ID</strong><span>' + escapeHtml(person.inspectorId) + '</span></div>' +
          '<div class="detail-row"><strong>Department</strong><span>' + escapeHtml(person.department) + '</span></div>' +
          '<div class="detail-row"><strong>Designation</strong><span>' + escapeHtml(person.designation) + '</span></div>' +
          '<div class="detail-row"><strong>Jurisdiction / area</strong><span>' + escapeHtml(person.jurisdiction) + '</span></div>' +
          '<div class="detail-row"><strong>Authorization status</strong><span>' + escapeHtml(result.authorizationStatus) + '</span></div>'
        : '<div class="detail-row"><strong>Authorization status</strong><span>Unverified</span></div>';
      passportPublicResult.innerHTML = '<span class="result-mark ' + (active ? 'verified' : 'denied') + '">' + (active ? '✓' : '!') + '</span><h2>' + (active ? 'Inspector Passport verified' : (matched ? 'Inspector identified · Inactive' : 'Passport not verified')) + '</h2><p>' + escapeHtml(result.message) + '</p><div class="result-details">' + details + '</div>';
    }).catch(function (error) {
      passportPublicResult.innerHTML = '<span class="result-mark denied">!</span><h2>Passport not verified</h2><p>' + escapeHtml(error.message) + '</p>';
    });
  }
}

/* Business Owner camera QR verification */
const ownerStartScan = document.querySelector('#owner-start-scan');
if (ownerStartScan) {
  const ownerStopScan = document.querySelector('#owner-stop-scan');
  const ownerCamera = document.querySelector('#owner-camera');
  const ownerVideo = document.querySelector('#owner-camera-video');
  const ownerScanStatus = document.querySelector('#owner-scan-status');
  const ownerResult = document.querySelector('#owner-verification-result');
  let ownerStream = null;
  let ownerFrame = null;
  let ownerDetector = null;
  let ownerDetecting = false;

  function stopOwnerCamera() {
    if (ownerFrame !== null) window.cancelAnimationFrame(ownerFrame);
    ownerFrame = null;
    if (ownerStream) ownerStream.getTracks().forEach(function (track) { track.stop(); });
    ownerStream = null;
    ownerVideo.srcObject = null;
    ownerCamera.classList.add('hidden');
    ownerStopScan.classList.add('hidden');
    ownerStartScan.disabled = false;
  }

  function showOwnerVerification(result) {
    const verified = Boolean(result.verified);
    const inspection = result.inspection || {};
    const inspector = result.inspector || {};
    const shop = result.shop || {};
    let details = '';
    if (verified) {
      details = '<div class="detail-row"><strong>Inspector</strong><span>' + escapeHtml(inspector.name || 'Unknown') + (inspector.department ? ' · ' + escapeHtml(inspector.department) : '') + '</span></div>' +
        '<div class="detail-row"><strong>Authorised status</strong><span>Authorised · active · shop and jurisdiction checked</span></div>' +
        '<div class="detail-row"><strong>Inspection validity</strong><span>Valid · ' + escapeHtml((inspection.status || 'verified').replace('_', ' ')) + '</span></div>' +
        '<div class="detail-row"><strong>Business</strong><span>' + escapeHtml(shop.name || 'Verified business') + (shop.jurisdiction ? ' · ' + escapeHtml(shop.jurisdiction) : '') + '</span></div>' +
        '<div class="detail-row"><strong>Inspection record</strong><span>' + escapeHtml(inspection.id || 'Verified') + (inspection.date ? ' · ' + escapeHtml(new Date(inspection.date).toLocaleString()) : '') + '</span></div>';
    } else {
      details = '<div class="detail-row"><strong>Authorised status</strong><span>Not authorised or could not be verified</span></div><div class="detail-row"><strong>Inspection validity</strong><span>Not valid</span></div>';
    }
    ownerResult.innerHTML = '<span class="result-mark ' + (verified ? 'verified' : 'denied') + '">' + (verified ? '✓' : '!') + '</span><h2>' + (verified ? 'Inspector verified' : 'Not verified') + '</h2><p>' + escapeHtml(result.message || (verified ? 'Inspector and inspection QR are valid.' : 'Inspector authority or inspection QR could not be verified.')) + '</p><div class="result-details">' + details + '</div>';
  }

  function showOwnerPassportResult(result) {
    const verified = Boolean(result.verified);
    const matched = Boolean(result.identityMatched);
    const person = result.inspector || {};
    const details = matched
      ? '<div class="detail-row"><strong>Full name</strong><span>' + escapeHtml(person.fullName) + '</span></div>' +
        '<div class="detail-row"><strong>Inspector ID</strong><span>' + escapeHtml(person.inspectorId) + '</span></div>' +
        '<div class="detail-row"><strong>Department</strong><span>' + escapeHtml(person.department) + '</span></div>' +
        '<div class="detail-row"><strong>Designation</strong><span>' + escapeHtml(person.designation) + '</span></div>' +
        '<div class="detail-row"><strong>Jurisdiction / area</strong><span>' + escapeHtml(person.jurisdiction) + '</span></div>' +
        '<div class="detail-row"><strong>Authorization status</strong><span>' + escapeHtml(result.authorizationStatus) + '</span></div>'
      : '<div class="detail-row"><strong>Authorization status</strong><span>Unverified</span></div>';
    ownerResult.innerHTML = '<span class="result-mark ' + (verified ? 'verified' : 'denied') + '">' + (verified ? '✓' : '!') + '</span><h2>' + (verified ? 'Inspector Passport verified' : (matched ? 'Inspector identified · Inactive' : 'Passport not verified')) + '</h2><p>' + escapeHtml(result.message || 'TruTag could not verify this Inspector Passport.') + '</p><div class="result-details">' + details + '</div>';
  }

  async function verifyScannedCode(rawValue) {
    const raw = String(rawValue || '').trim();
    let scannedUrl;
    try { scannedUrl = new URL(raw, window.location.origin); } catch (_) { /* Raw QR token. */ }
    if (scannedUrl && scannedUrl.pathname === '/verify-inspector') {
      ownerScanStatus.textContent = 'Inspector Passport scanned. Checking identity and current authorization…';
      try {
        const result = await api('/api/verify-inspector', { method: 'POST', body: { inspectorId: scannedUrl.searchParams.get('inspectorId'), token: scannedUrl.searchParams.get('token') } });
        showOwnerPassportResult(result);
        ownerScanStatus.textContent = result.verified ? 'Inspector identity and authorization verified.' : (result.identityMatched ? 'Inspector identified, but authorization is inactive.' : 'The Inspector Passport could not be verified.');
      } catch (error) {
        showOwnerPassportResult({ verified: false, identityMatched: false, message: error.message });
        ownerScanStatus.textContent = 'Could not complete passport verification. Check the connection and scan again.';
      }
      return;
    }
    const token = (scannedUrl && scannedUrl.searchParams.get('token')) || raw;
    ownerScanStatus.textContent = 'QR captured. Checking the Inspector and current authority…';
    try {
      const result = await api('/api/verify', { method: 'POST', body: { token: token } });
      showOwnerVerification(result);
      ownerScanStatus.textContent = result.verified ? 'Verification completed.' : 'Verification completed. The result needs attention.';
    } catch (error) {
      showOwnerVerification({ verified: false, message: error.message });
      ownerScanStatus.textContent = 'Could not complete verification. Check the connection and scan again.';
    }
  }

  async function scanOwnerFrame() {
    if (!ownerStream) return;
    if (!ownerDetecting) {
      ownerDetecting = true;
      try {
        const codes = await ownerDetector.detect(ownerVideo);
        if (codes.length && codes[0].rawValue) {
          const value = codes[0].rawValue;
          stopOwnerCamera();
          await verifyScannedCode(value);
          return;
        }
      } catch (_) { /* Keep scanning while a QR code is not yet in focus. */ }
      finally { ownerDetecting = false; }
    }
    if (ownerStream) ownerFrame = window.requestAnimationFrame(scanOwnerFrame);
  }

  ownerStartScan.addEventListener('click', async function () {
    if (!('BarcodeDetector' in window)) {
      ownerScanStatus.textContent = 'Camera QR scanning is not supported in this browser. Use your phone camera to open the inspection QR, or use the public verification page.';
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      ownerScanStatus.textContent = 'Camera access is unavailable. Open this page on localhost or a secure connection, or use the public verification page.';
      return;
    }
    ownerStartScan.disabled = true;
    try {
      ownerDetector = new BarcodeDetector({ formats: ['qr_code'] });
      ownerStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
      ownerVideo.srcObject = ownerStream;
      await ownerVideo.play();
      ownerCamera.classList.remove('hidden');
      ownerStopScan.classList.remove('hidden');
      ownerScanStatus.textContent = 'Camera is on. Hold the complete inspection QR code in the frame.';
      scanOwnerFrame();
    } catch (error) {
      stopOwnerCamera();
      ownerScanStatus.textContent = error.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access and try again.' : 'Unable to start the camera. Try again or use the public verification page.';
    }
  });
  ownerStopScan.addEventListener('click', function () {
    stopOwnerCamera();
    ownerScanStatus.textContent = 'Camera stopped. Scan the Inspector QR when ready.';
  });
  window.addEventListener('pagehide', stopOwnerCamera);
}
