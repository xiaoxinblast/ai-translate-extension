// popup.js — 弹出面板交互逻辑

document.addEventListener('DOMContentLoaded', async () => {
  const translateToggle = document.getElementById('translateToggle');
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const displayMode = document.getElementById('displayMode');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const openOptions = document.getElementById('openOptions');
  const statusBar = document.getElementById('statusBar');
  const statusText = statusBar.querySelector('.status-text');

  let translationInProgress = false;

  // 加载设置
  const settings = await chrome.storage.local.get([
    'enabled', 'sourceLang', 'targetLang', 'displayMode'
  ]);

  translateToggle.checked = settings.enabled !== false;
  sourceLang.value = settings.sourceLang || 'auto';
  targetLang.value = settings.targetLang || 'zh';
  displayMode.value = settings.displayMode || 'bilingual';

  // 查询当前页面状态
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp?.isTranslating) setTranslating(true);
      else if (resp?.translatedCount > 0) showStatus('success', `已翻译 ${resp.translatedCount} 个段落`);
      if (resp?.displayMode) displayMode.value = resp.displayMode;
    });
  }

  // 翻译开关
  translateToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: translateToggle.checked });
    notifyContentScript('toggleTranslation', { enabled: translateToggle.checked });
  });

  // 语言
  sourceLang.addEventListener('change', () => chrome.storage.local.set({ sourceLang: sourceLang.value }));
  targetLang.addEventListener('change', () => chrome.storage.local.set({ targetLang: targetLang.value }));

  // 显示模式
  displayMode.addEventListener('change', async () => {
    await chrome.storage.local.set({ displayMode: displayMode.value });
    notifyContentScript('setDisplayMode', { mode: displayMode.value });
  });

  // 翻译
  translateBtn.addEventListener('click', async () => {
    if (translationInProgress) return;
    await chrome.storage.local.set({
      sourceLang: sourceLang.value,
      targetLang: targetLang.value
    });
    setTranslating(true);
    notifyContentScript('translate', {
      sourceLang: sourceLang.value,
      targetLang: targetLang.value
    });
  });

  // 还原
  restoreBtn.addEventListener('click', () => {
    notifyContentScript('restore');
    setTranslating(false);
    hideStatus();
  });

  // 设置页
  openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

  function setTranslating(active) {
    translationInProgress = active;
    translateBtn.disabled = active;
    if (active) showStatus('translating', '正在翻译...');
  }

  function showStatus(type, message) {
    statusBar.classList.remove('hidden', 'error', 'translating');
    if (type === 'error') statusBar.classList.add('error');
    if (type === 'translating') statusBar.classList.add('translating');
    statusText.textContent = message;
  }

  function hideStatus() {
    statusBar.classList.add('hidden');
  }
});

// 消息监听
chrome.runtime.onMessage.addListener((message) => {
  const statusBar = document.getElementById('statusBar');
  const statusText = statusBar?.querySelector('.status-text');
  if (!statusBar || !statusText) return;

  if (message.action === 'translationProgress') {
    statusBar.classList.remove('hidden', 'error');
    statusBar.classList.add('translating');
    statusText.textContent = `翻译中... ${message.done}/${message.total}`;
  }
  if (message.action === 'translationComplete') {
    statusBar.classList.remove('hidden', 'error', 'translating');
    statusText.textContent = `完成（${message.total} 段）`;
    const btn = document.getElementById('translateBtn');
    if (btn) btn.disabled = false;
  }
});

async function notifyContentScript(action, payload = {}) {
  // 通过 background 广播到所有 frame（包括评论 iframe）
  chrome.runtime.sendMessage({ action: 'broadcast', broadcastAction: action, ...payload }).catch(() => {});
}
