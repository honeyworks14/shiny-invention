const dropZone = document.getElementById('drop-zone');
const dropZoneContent = document.getElementById('drop-zone-content');
const fileInput = document.getElementById('file-input');
const preview = document.getElementById('preview');
const analyzeBtn = document.getElementById('analyze-btn');
const resetBtn = document.getElementById('reset-btn');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');

let selectedFile = null;

function showPreview(file) {
  selectedFile = file;
  const url = URL.createObjectURL(file);
  preview.src = url;
  preview.hidden = false;
  dropZoneContent.hidden = true;
  analyzeBtn.disabled = false;
  resetBtn.hidden = false;
  resultEl.hidden = true;
  statusEl.hidden = true;
}

function resetUpload() {
  selectedFile = null;
  fileInput.value = '';
  preview.hidden = true;
  dropZoneContent.hidden = false;
  analyzeBtn.disabled = true;
  resetBtn.hidden = true;
  resultEl.hidden = true;
  statusEl.hidden = true;
}

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) {
    showPreview(fileInput.files[0]);
  }
});

['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    showPreview(file);
  }
});

resetBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetUpload();
});

function setStatus(message, isError = false) {
  statusEl.hidden = false;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c1442b' : '';
}

function renderResult(data) {
  document.getElementById('total-calories').textContent = `${Math.round(
    data.total_calories ?? 0
  )} kcal`;

  const badge = document.getElementById('confidence-badge');
  const confidence = (data.confidence || '').toLowerCase();
  const labelMap = { high: '신뢰도 높음', medium: '신뢰도 보통', low: '신뢰도 낮음' };
  badge.textContent = labelMap[confidence] || '';
  badge.className = `confidence ${confidence}`;

  const macros = document.getElementById('macros');
  macros.innerHTML = '';
  const macroDefs = [
    { key: 'protein_g', label: '단백질' },
    { key: 'carbs_g', label: '탄수화물' },
    { key: 'fat_g', label: '지방' },
  ];
  macroDefs.forEach(({ key, label }) => {
    if (data[key] === undefined) return;
    const div = document.createElement('div');
    div.className = 'macro-item';
    div.innerHTML = `<span class="macro-value">${Math.round(data[key])}g</span><span class="macro-label">${label}</span>`;
    macros.appendChild(div);
  });

  const itemsList = document.getElementById('items-list');
  itemsList.innerHTML = '';
  (data.items || []).forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span>
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-portion">${escapeHtml(item.portion || '')}</span>
      </span>
      <span class="item-calories">${Math.round(item.calories ?? 0)} kcal</span>
    `;
    itemsList.appendChild(li);
  });

  document.getElementById('notes').textContent = data.notes || '';
  resultEl.hidden = false;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

analyzeBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  analyzeBtn.disabled = true;
  resultEl.hidden = true;
  setStatus('사진을 분석하고 있어요... 잠시만 기다려주세요.');

  try {
    const formData = new FormData();
    formData.append('photo', selectedFile);

    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '분석에 실패했습니다.');
    }

    statusEl.hidden = true;
    renderResult(data);
  } catch (err) {
    setStatus(err.message || '알 수 없는 오류가 발생했습니다.', true);
  } finally {
    analyzeBtn.disabled = false;
  }
});
