// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const translateToggle = document.getElementById('translateToggle');
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const displayMode = document.getElementById('displayMode');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const logBtn = document.getElementById('logBtn');
  const snapshotBtn = document.getElementById('snapshotBtn');
  const openOptions = document.getElementById('openOptions');
  const statusBar = document.getElementById('statusBar');
  const statusText = statusBar.querySelector('.status-text');

  let inProgress = false;

  const settings = await chrome.storage.local.get(['enabled','sourceLang','targetLang','displayMode']);
  translateToggle.checked = settings.enabled !== false;
  sourceLang.value = settings.sourceLang || 'auto';
  targetLang.value = settings.targetLang || 'zh';
  displayMode.value = settings.displayMode || 'bilingual';

  // Query status from current tab's main frame
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
    if (resp?.isTranslating) setProgress(true);
    else if (resp?.translatedCount > 0) showStatus('success', resp.translatedCount + ' nodes');
  } catch(e) {}

  translateToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: translateToggle.checked });
    sendCmd('toggleTranslation', { enabled: translateToggle.checked });
  });
  sourceLang.addEventListener('change', () => chrome.storage.local.set({ sourceLang: sourceLang.value }));
  targetLang.addEventListener('change', () => chrome.storage.local.set({ targetLang: targetLang.value }));
  displayMode.addEventListener('change', async () => {
    await chrome.storage.local.set({ displayMode: displayMode.value });
    sendCmd('setDisplayMode', { mode: displayMode.value });
  });

  translateBtn.addEventListener('click', async () => {
    if (inProgress) return;
    await chrome.storage.local.set({ sourceLang: sourceLang.value, targetLang: targetLang.value });
    setProgress(true);
    sendCmd('translate', { sourceLang: sourceLang.value, targetLang: targetLang.value });
  });

  restoreBtn.addEventListener('click', () => { sendCmd('restore'); setProgress(false); hideStatus(); });
  openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
  logBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'toggleLog' }).catch(() => {});
  });
  snapshotBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'dumpSnapshot' }).catch(() => {});
  });

  function setProgress(v) { inProgress = v; translateBtn.disabled = v; if (v) showStatus('translating', '...'); }
  function showStatus(t, m) { statusBar.classList.remove('hidden','error','translating'); if (t==='error') statusBar.classList.add('error'); if (t==='translating') statusBar.classList.add('translating'); statusText.textContent = m; }
  function hideStatus() { statusBar.classList.add('hidden'); }

  // 通过 chrome.storage 广播指令（所有 frame 都能收到）
  async function sendCmd(action, payload = {}) {
    await chrome.storage.local.set({ translateSignal: { action, ...payload, _ts: Date.now() } });
  }
});

// Listen for progress from content scripts
chrome.runtime.onMessage.addListener((msg) => {
  const sb = document.getElementById('statusBar');
  const st = sb?.querySelector('.status-text');
  if (!sb || !st) return;
  if (msg.action === 'translationProgress') {
    sb.classList.remove('hidden','error'); sb.classList.add('translating');
    st.textContent = `${msg.done}/${msg.total}`;
  }
  if (msg.action === 'translationComplete') {
    sb.classList.remove('hidden','error','translating');
    st.textContent = `Done (${msg.total})`;
    const btn = document.getElementById('translateBtn');
    if (btn) btn.disabled = false;
  }
});
