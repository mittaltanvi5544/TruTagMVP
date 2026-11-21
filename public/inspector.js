const inspectorPicker = document.querySelector('#inspector-actor-select');
const inspectorToast = document.querySelector('.toast');
const inspectionStatusOptions = ['Compliant', 'Non-compliant', 'Needs Review'];
const aiReadabilityStatuses = ['CLEAR', 'BLURRED', 'PARTIALLY_VISIBLE', 'NOT_FOUND', 'UNCERTAIN'];
const rule6Items = [
  ['responsible-party', 'Manufacturer / packer / importer'],
  ['country-origin', 'Country of origin'],
  ['generic-name', 'Generic name of the commodity'],
  ['net-quantity', 'Net quantity'],
  ['manufacturing-date', 'Manufacturing / packing / import date'],
  ['best-before', 'Best before / use by date'],
  ['mrp', 'Maximum retail price (MRP)'],
  ['unit-sale-price', 'Unit sale price'],
  ['consumer-care', 'Consumer care details'],
  ['clarity', 'Clarity and legibility of declarations']
];
let selectedInspector = null;
let selectedShops = [];
let activeInspection = null;
let photoUploadInProgress = false;

function inspectorMessage(message) {
  if (!inspectorToast) return;
  inspectorToast.textContent = message;
  inspectorToast.classList.add('visible');
  window.setTimeout(() => inspectorToast.classList.remove('visible'), 3200);
}

function safeText(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function inspectorRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not complete this request.');
  return result;
}

function renderDeclarations(values) {
  const existing = values || [];
  document.querySelector('#rule6-list').innerHTML = rule6Items.map(([id, label], index) => {
    const saved = existing.find((field) => field.id === id);
    const selected = saved ? saved.status : 'Needs Review';
    return '<div class="rule6-row"><span class="rule6-number">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<label class="rule6-label" for="declaration-' + id + '">' + safeText(label) + '</label>' +
      '<select id="declaration-' + id + '" data-declaration-id="' + id + '" required>' +
      inspectionStatusOptions.map((status) => '<option value="' + status + '" ' + (selected === status ? 'selected' : '') + '>' + status + '</option>').join('') +
      '</select><label class="severity-field" for="severity-' + id + '">Severity (when non-compliant)<select id="severity-' + id + '" data-declaration-severity="' + id + '"><option value="">Not recorded</option>' +
      ['Critical', 'High', 'Medium', 'Low'].map((severity) => '<option value="' + severity + '" ' + (saved?.severity === severity ? 'selected' : '') + '>' + severity + '</option>').join('') + '</select></label></div>';
  }).join('');
  document.querySelectorAll('#rule6-list [data-declaration-id]').forEach((select) => {
    const severity = document.querySelector('[data-declaration-severity="' + select.dataset.declarationId + '"]');
    severity.disabled = select.value !== 'Non-compliant';
  });
}

function renderSavedPhotos(photos) {
  const list = document.querySelector('#inspection-photo-list');
  if (!photos || !photos.length) {
    list.innerHTML = '<p class="photo-empty">No package-label photos saved.</p>';
    return;
  }
  list.innerHTML = photos.map((photo, index) => '<a href="' + safeText(photo.url) + '" target="_blank" rel="noopener"><img src="' + safeText(photo.url) + '" alt="Saved package-label photo ' + (index + 1) + '"><span>Photo ' + (index + 1) + '</span></a>').join('');
}

function openInspectionForm(record, shop, inspector) {
  activeInspection = record;
  document.querySelector('#active-shop-name').textContent = shop.name;
  document.querySelector('#active-inspection-id').textContent = record.id;
  document.querySelector('#inspection-qr').src = record.qrCode || '';
  document.querySelector('#inspection-context').innerHTML = [
    ['Shop name', shop.name], ['Shop ID', shop.id], ['Inspector', inspector.name],
    ['Department', inspector.department], ['Jurisdiction', inspector.jurisdiction],
    ['Inspection date', new Date(record.date).toLocaleString()]
  ].map(([label, value]) => '<div><span>' + safeText(label) + '</span><strong>' + safeText(value) + '</strong></div>').join('');
  document.querySelector('#inspection-edit-form').elements.remarks.value = record.remarks || '';
  renderDeclarations(record.declarations || []);
  renderSavedPhotos(record.photos || []);
  renderAiResults(record.aiResults, record.manualCorrections || []);
  document.querySelector('#inspection-photos').value = '';
  document.querySelector('#photo-count-hint').textContent = 'Saved ' + ((record.photos || []).length) + ' of 4 · Add JPEG, PNG or WebP · 5 MB each';
  document.querySelector('#inspection-workspace').classList.remove('hidden');
  document.querySelector('#inspection-workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadInspector(id) {
  const data = await inspectorRequest('/api/inspector/data?inspectorId=' + encodeURIComponent(id));
  selectedInspector = data.inspector;
  selectedShops = data.shops;
  document.querySelector('#inspector-meta').textContent = data.inspector.department + ' · ' + data.inspector.jurisdiction + ' · ' + data.inspector.status;
  const statusNotice = document.querySelector('#inspector-status-notice');
  if (data.inspector.status !== 'active') {
    statusNotice.textContent = 'This inspector is suspended. Ask a Department Admin to reactivate the account before starting or submitting inspections.';
    statusNotice.classList.remove('hidden');
  } else {
    statusNotice.textContent = '';
    statusNotice.classList.add('hidden');
  }
  document.querySelector('#assigned-shops').innerHTML = data.shops.map((shop) => {
    const suspended = data.inspector.status !== 'active';
    const reason = suspended ? '<p class="start-disabled-reason">Unavailable: this inspector is suspended.</p>' : '';
    return '<article class="shop-card"><span class="card-label">' + safeText(shop.category) + '</span><h3>' + safeText(shop.name) + '</h3><p>' + safeText(shop.owner) + ' · ' + safeText(shop.jurisdiction) + '</p><div class="shop-card-foot"><span>' + safeText(shop.id) + '</span><button class="button" data-start-inspection="' + safeText(shop.id) + '" ' + (suspended ? 'disabled title="Inspector is suspended"' : '') + '>Start Inspection</button></div>' + reason + '</article>';
  }).join('') || '<p class="empty-row">No shops are currently assigned to this inspector.</p>';
  document.querySelector('#inspector-history').innerHTML = data.inspections.map((record) => {
    const action = record.status === 'draft'
      ? '<button class="action-link" data-resume-inspection="' + safeText(record.id) + '" ' + (data.inspector.status !== 'active' ? 'disabled title="Inspector is suspended"' : '') + '>Resume draft</button>'
      : '<button class="action-link" data-inspection-detail="' + safeText(record.id) + '">Open details</button>';
    return '<tr><td><strong>' + safeText(record.id) + '</strong></td><td>' + safeText(new Date(record.date).toLocaleDateString()) + '</td><td>' + safeText(record.shopName) + '</td><td><span class="status-tag ' + safeText(record.status) + '">' + safeText(record.status.replace('_', ' ')) + '</span></td><td>' + Number(record.violations || 0) + '</td><td>' + action + '</td></tr>';
  }).join('') || '<tr><td colspan="6" class="empty-row">No previous inspections.</td></tr>';
  return data;
}

async function startInspection(shopId) {
  if (!selectedInspector || selectedInspector.status !== 'active') {
    inspectorMessage('This inspector is suspended. Ask a Department Admin to reactivate the account.');
    return;
  }
  const result = await inspectorRequest('/api/inspections', { method: 'POST', body: { inspectorId: selectedInspector.id, shopId } });
  openInspectionForm(result.inspection, selectedShops.find((shop) => shop.id === shopId), selectedInspector);
  await loadInspector(selectedInspector.id);
  inspectorMessage('Inspection form opened. Save a draft or submit when ready.');
}

function readSelectedPhotos() {
  const input = document.querySelector('#inspection-photos');
  const files = Array.from(input.files || []);
  const savedCount = (activeInspection.photos || []).length;
  if (files.length + savedCount > 4) throw new Error('You can save up to 4 photos for this inspection.');
  if (files.some((file) => file.size > 5 * 1024 * 1024)) throw new Error('Each photograph must be 5 MB or smaller.');
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ mimeType: file.type, data: reader.result });
    reader.onerror = () => reject(new Error('A selected photo could not be read.'));
    reader.readAsDataURL(file);
  })));
}


function renderAiResults(aiResults, manualCorrections = []) {
  const container = document.querySelector('#gemini-scan-results');
  if (!container) return;
  if (!aiResults || !Array.isArray(aiResults.fields)) {
    container.innerHTML = '<p class="muted">Upload package-label photos to scan. AI results will appear here for inspector review.</p>';
    return;
  }
  const latestCorrections = new Map();
  manualCorrections.filter((item) => item.scanId === aiResults.scanId).forEach((item) => latestCorrections.set(item.fieldId, item));
  const labels = new Map(rule6Items);
  const fields = aiResults.fields.filter((field) => labels.has(field.id) && aiReadabilityStatuses.includes(field.readabilityStatus));
  container.innerHTML = '<div class="gemini-scan-meta">Scanned ' + safeText(new Date(aiResults.scannedAt).toLocaleString()) + ' · ' + safeText(aiResults.model) + '</div>' +
    '<div class="gemini-field-list">' + fields.map((field) => {
      const corrected = latestCorrections.get(field.id);
      const clear = field.readabilityStatus === 'CLEAR';
      const value = corrected ? corrected.correctedValue : field.value;
      return '<article class="gemini-field-card"><div class="gemini-field-title"><strong>' + safeText(labels.get(field.id)) + '</strong><span class="readability-tag readability-' + safeText(field.readabilityStatus.toLowerCase().replace('_', '-')) + '">' + safeText(field.readabilityStatus.replaceAll('_', ' ')) + '</span></div>' +
        '<p class="gemini-ai-value"><span>AI extraction</span><strong>' + safeText(field.value || 'No readable text extracted') + '</strong></p>' +
        (field.notes ? '<p class="gemini-field-notes">' + safeText(field.notes) + '</p>' : '') +
        (clear ? '<p class="gemini-locked-note">CLEAR result · locked from manual changes</p>' : '<div class="gemini-manual-entry"><label>Inspector verified value<input type="text" maxlength="1000" data-gemini-correction="' + safeText(field.id) + '" value="' + safeText(value) + '" placeholder="Enter the verified label text"></label><label class="gemini-verify-check"><input type="checkbox" data-gemini-verified="' + safeText(field.id) + '" ' + (corrected ? 'checked' : '') + '> I verified this field against the package label</label></div>') +
      '</article>';
    }).join('') + '</div>';
}

function collectAiCorrections() {
  return Array.from(document.querySelectorAll('[data-gemini-correction]')).map((input) => ({
    fieldId: input.dataset.geminiCorrection,
    correctedValue: input.value,
    verified: Boolean(document.querySelector('[data-gemini-verified="' + input.dataset.geminiCorrection + '"]')?.checked)
  }));
}

async function scanLabelsWithGemini() {
  if (!activeInspection || !selectedInspector) return inspectorMessage('Start an inspection before scanning labels.');
  const button = document.querySelector('#scan-labels-with-gemini');
  button.disabled = true;
  button.textContent = 'Scanning…';
  try {
    const photos = await readSelectedPhotos();
    if (!photos.length && !(activeInspection.photos || []).length) throw new Error('Upload at least one package-label photo before scanning.');
    const result = await inspectorRequest('/api/inspections/' + encodeURIComponent(activeInspection.id) + '/scan-labels', {
      method: 'POST', body: { inspectorId: selectedInspector.id, photos }
    });
    activeInspection = Object.assign(activeInspection, result.inspection);
    document.querySelector('#inspection-photos').value = '';
    renderSavedPhotos(activeInspection.photos || []);
    renderAiResults(activeInspection.aiResults, activeInspection.manualCorrections || []);
    document.querySelector('#photo-count-hint').textContent = 'Saved ' + ((activeInspection.photos || []).length) + ' of 4 · Add JPEG, PNG or WebP · 5 MB each';
    await loadInspector(selectedInspector.id);
    inspectorMessage('Gemini scan complete. Review each field; unreadable results remain editable for manual verification.');
  } catch (error) {
    inspectorMessage(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Scan labels with Gemini';
  }
}


function setPhotoUploadInProgress(uploading) {
  photoUploadInProgress = uploading;
  ['#save-inspection-draft', '#submit-inspection', '#scan-labels-with-gemini'].forEach((selector) => {
    const button = document.querySelector(selector);
    if (button) button.disabled = uploading;
  });
}

async function uploadSelectedPhotos() {
  if (!activeInspection || !selectedInspector) return inspectorMessage('Open an inspection before uploading photos.');
  const input = document.querySelector('#inspection-photos');
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const savedCount = (activeInspection.photos || []).length;
  if (files.length + savedCount > 4) {
    input.value = '';
    inspectorMessage('You can save up to 4 photos for this inspection.');
    return;
  }
  if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
    input.value = '';
    inspectorMessage('Use JPEG, PNG, or WebP package-label photos.');
    return;
  }
  if (files.some((file) => file.size > 5 * 1024 * 1024)) {
    input.value = '';
    inspectorMessage('Each photograph must be 5 MB or smaller.');
    return;
  }

  const hint = document.querySelector('#photo-count-hint');
  hint.textContent = 'Uploading ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '…';
  setPhotoUploadInProgress(true);
  try {
    const photos = await readSelectedPhotos();
    const result = await inspectorRequest('/api/inspections/' + encodeURIComponent(activeInspection.id) + '/photos', {
      method: 'POST', body: { inspectorId: selectedInspector.id, photos }
    });
    activeInspection = Object.assign(activeInspection, result.inspection);
    input.value = '';
    renderSavedPhotos(activeInspection.photos || []);
    hint.textContent = 'Saved ' + ((activeInspection.photos || []).length) + ' of 4 · Add JPEG, PNG or WebP · 5 MB each';
    inspectorMessage(result.message || 'Package-label photos saved successfully.');
  } catch (error) {
    input.value = '';
    hint.textContent = 'Saved ' + ((activeInspection.photos || []).length) + ' of 4 · Add JPEG, PNG or WebP · 5 MB each';
    inspectorMessage(error.message || 'The photos could not be saved. Please try again.');
  } finally {
    setPhotoUploadInProgress(false);
  }
}

async function saveInspection(submit) {
  if (photoUploadInProgress) return inspectorMessage('Wait for package-label photos to finish uploading.');
  if (!activeInspection || !selectedInspector) return inspectorMessage('Start an inspection before saving.');
  const form = document.querySelector('#inspection-edit-form');
  const declarations = Array.from(form.querySelectorAll('[data-declaration-id]')).map((select) => ({
    id: select.dataset.declarationId,
    status: select.value,
    severity: form.querySelector('[data-declaration-severity="' + select.dataset.declarationId + '"]').value || null
  }));
  const button = document.querySelector(submit ? '#submit-inspection' : '#save-inspection-draft');
  button.disabled = true;
  try {
    const photos = await readSelectedPhotos();
    const body = { inspectorId: selectedInspector.id, declarations, remarks: form.elements.remarks.value, photos, manualCorrections: collectAiCorrections() };
    const url = '/api/inspections/' + encodeURIComponent(activeInspection.id) + (submit ? '/submit' : '/draft');
    const result = await inspectorRequest(url, { method: submit ? 'POST' : 'PATCH', body });
    if (submit) {
      activeInspection = null;
      document.querySelector('#inspection-workspace').classList.add('hidden');
      await loadInspector(selectedInspector.id);
      inspectorMessage('Inspection submitted successfully and added to Previous Inspections.');
    } else {
      activeInspection = Object.assign(activeInspection, result.inspection);
      document.querySelector('#inspection-photos').value = '';
      renderSavedPhotos(activeInspection.photos || []);
      document.querySelector('#photo-count-hint').textContent = 'Saved ' + ((activeInspection.photos || []).length) + ' of 4 · Add JPEG, PNG or WebP · 5 MB each';
      await loadInspector(selectedInspector.id);
      inspectorMessage('Draft saved successfully. You can resume it from Previous Inspections.');
    }
  } catch (error) {
    inspectorMessage(error.message);
  } finally {
    button.disabled = false;
  }
}

if (inspectorPicker) {
  inspectorPicker.addEventListener('change', async () => {
    activeInspection = null;
    document.querySelector('#inspection-workspace').classList.add('hidden');
    try { await loadInspector(inspectorPicker.value); }
    catch (error) { inspectorMessage(error.message); }
  });

  api('/api/admin/overview').then(async (data) => {
    inspectorPicker.innerHTML = data.inspectors.map((person) => '<option value="' + safeText(person.id) + '">' + safeText(person.name) + (person.status === 'suspended' ? ' (suspended)' : '') + '</option>').join('');
    inspectorPicker.value = data.inspectors.find((person) => person.id === 'INS-1001')?.id || data.inspectors[0]?.id || '';
    if (inspectorPicker.value) await loadInspector(inspectorPicker.value);
  }).catch((error) => inspectorMessage(error.message));

  document.querySelector('#assigned-shops').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-start-inspection]');
    if (!button || button.disabled) return;
    button.disabled = true;
    try { await startInspection(button.dataset.startInspection); }
    catch (error) { inspectorMessage(error.message); button.disabled = false; }
  });

  document.querySelector('#inspector-history').addEventListener('click', (event) => {
    const button = event.target.closest('[data-resume-inspection]');
    if (!button) return;
    inspectorRequest('/api/inspections/' + encodeURIComponent(button.dataset.resumeInspection)).then((result) => {
      const shop = selectedShops.find((item) => item.id === result.inspection.shopId) || result.shop;
      openInspectionForm(result.inspection, shop, result.inspector || selectedInspector);
    }).catch((error) => inspectorMessage(error.message));
  });

  document.querySelector('#inspection-photos').addEventListener('change', uploadSelectedPhotos);

  document.querySelector('#rule6-list').addEventListener('change', (event) => {
    const statusSelect = event.target.closest('[data-declaration-id]');
    if (!statusSelect) return;
    const severity = document.querySelector('[data-declaration-severity="' + statusSelect.dataset.declarationId + '"]');
    severity.disabled = statusSelect.value !== 'Non-compliant';
    if (severity.disabled) severity.value = '';
  });

  document.querySelector('#scan-labels-with-gemini').addEventListener('click', scanLabelsWithGemini);
  document.querySelector('#save-inspection-draft').addEventListener('click', () => saveInspection(false));
  document.querySelector('#submit-inspection').addEventListener('click', () => saveInspection(true));
  document.querySelector('#inspection-back').addEventListener('click', () => {
    activeInspection = null;
    document.querySelector('#inspection-workspace').classList.add('hidden');
    document.querySelector('.page-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    inspectorMessage('Back on the Inspector dashboard. Unsubmitted work remains saved as a draft.');
  });

  const passportButton = document.querySelector('#show-inspector-passport');
  const passportDialog = document.querySelector('#inspector-passport-dialog');
  const passportContent = document.querySelector('#inspector-passport-content');
  passportButton.addEventListener('click', async () => {
    if (!selectedInspector) return inspectorMessage('Load an inspector profile before opening the passport.');
    passportButton.disabled = true;
    try {
      const passport = await inspectorRequest('/api/inspector/passport?inspectorId=' + encodeURIComponent(selectedInspector.id));
      const person = passport.inspector;
      const authorizationClass = person.authorizationStatus === 'Active' ? 'active' : 'suspended';
      passportContent.innerHTML = '<div class="inspector-passport-card"><div class="passport-details">' +
        '<div><span>Full name</span><strong>' + safeText(person.fullName) + '</strong></div>' +
        '<div><span>Unique Inspector ID</span><strong>' + safeText(person.inspectorId) + '</strong></div>' +
        '<div><span>Department</span><strong>' + safeText(person.department) + '</strong></div>' +
        '<div><span>Designation</span><strong>' + safeText(person.designation) + '</strong></div>' +
        '<div><span>Assigned jurisdiction / area</span><strong>' + safeText(person.jurisdiction) + '</strong></div>' +
        '<div><span>Current authorization</span><strong><span class="status-tag ' + authorizationClass + '">' + safeText(person.authorizationStatus) + '</span></strong></div>' +
        '</div><div class="passport-qr"><img src="' + safeText(passport.qrCode) + '" alt="Unique Inspector Passport QR for ' + safeText(person.inspectorId) + '"><p>Scan to verify this Inspector with TruTag.</p></div></div>' +
        '<p class="passport-note">The QR contains a unique issued token. TruTag checks the Inspector ID and live authorization status when it is scanned.</p>';
      passportDialog.showModal();
    } catch (error) {
      inspectorMessage(error.message);
    } finally {
      passportButton.disabled = false;
    }
  });
  document.querySelector('#close-inspector-passport').addEventListener('click', () => passportDialog.close());
}
