// popup.js — 弹出面板交互逻辑

document.addEventListener('DOMContentLoaded', async () => {
  const translateToggle = document.getElementById('translateToggle');
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const translateBtn = document.getElementById('translateBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const openOptions = document.getElementById('openOptions');
  const statusBar = document.getElementById('statusBar');
  const statusText = statusBar.querySelector('.status-text');

  let translationInProgress = false;

  // 从 storage 加载设置
  const settings = await chrome.storage.local.get([
    'enabled', 'sourceLang', 'targetLang'
  ]);

  translateToggle.checked = settings.enabled !== false;
  sourceLang.value = settings.sourceLang || 'auto';
  targetLang.value = settings.targetLang || 'zh';

  // 查询当前页面翻译状态
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response?.isTranslating) {
        setTranslating(true);
      } else if (response?.translatedCount > 0) {
        showStatus('success', `已翻译 ${response.translatedCount} 个段落`);
      }
    });
  }

  // 保存翻译开关状态
  translateToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ enabled: translateToggle.checked });
    notifyContentScript('toggleTranslation', { enabled: translateToggle.checked });
  });

  // 保存语言选择
  sourceLang.addEventListener('change', async () => {
    await chrome.storage.local.set({ sourceLang: sourceLang.value });
  });

  targetLang.addEventListener('change', async () => {
    await chrome.storage.local.set({ targetLang: targetLang.value });
  });

  // 翻译当前页面
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

  // 恢复原文
  restoreBtn.addEventListener('click', () => {
    notifyContentScript('restore');
    setTranslating(false);
    hideStatus();
  });

  // 打开设置页
  openOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ===== 状态管理 =====

  function setTranslating(active) {
    translationInProgress = active;
    translateBtn.disabled = active;
    if (active) {
      showStatus('translating', '正在翻译...');
    }
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

// ===== 消息监听（接收 content script 的进度/完成通知） =====
chrome.runtime.onMessage.addListener((message) => {
  const statusBar = document.getElementById('statusBar');
  const statusText = statusBar?.querySelector('.status-text');
  if (!statusBar || !statusText) return;

  if (message.action === 'translationProgress') {
    statusBar.classList.remove('hidden', 'error');
    statusBar.classList.add('translating');
    statusText.textContent = `正在翻译... ${message.done}/${message.total}`;
  }

  if (message.action === 'translationComplete') {
    statusBar.classList.remove('hidden', 'error', 'translating');
    statusText.textContent = `翻译完成（${message.total} 个段落）`;
    const translateBtn = document.getElementById('translateBtn');
    if (translateBtn) translateBtn.disabled = false;
  }
});

// 向当前活动标签页发送消息
async function notifyContentScript(action, payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action, ...payload }).catch(() => {});
  }
}
