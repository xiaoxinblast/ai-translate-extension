// background.js — Service Worker

import { translateWithDeepSeek } from '../utils/translator.js';

// 使用 chrome.storage.session 持久化标签翻译状态（Service Worker 重启不丢失）
const STATE_KEY = 'tabTranslationStates'; // { [tabId]: true/false }

async function getTabState(tabId) {
  const data = await chrome.storage.session.get(STATE_KEY);
  const states = data[STATE_KEY] || {};
  return !!states[tabId];
}

async function setTabState(tabId, translated) {
  const data = await chrome.storage.session.get(STATE_KEY);
  const states = data[STATE_KEY] || {};
  if (translated) {
    states[tabId] = true;
  } else {
    delete states[tabId];
  }
  await chrome.storage.session.set({ [STATE_KEY]: states });
}

async function updateMenuForTab(tabId) {
  const translated = await getTabState(tabId);
  chrome.contextMenus.update('toggle-translate', {
    title: translated ? '还原原文' : '翻译页面'
  });
}

// ===== 安装时初始化右键菜单 =====
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'toggle-translate',
    title: '翻译页面',
    contexts: ['page']
  });
});

// 标签页关闭时清理
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await chrome.storage.session.get(STATE_KEY);
  const states = data[STATE_KEY] || {};
  delete states[tabId];
  await chrome.storage.session.set({ [STATE_KEY]: states });
});

// 页面导航/刷新时重置状态（主 frame 导航意味着页面内容变了）
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId === 0) { // 仅主 frame
    await setTabState(details.tabId, false);
    chrome.contextMenus.update('toggle-translate', { title: '翻译页面' });
  }
});

// ===== 右键菜单 =====
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || info.menuItemId !== 'toggle-translate') return;
  toggleTranslate(tab.id);
});

// ===== 键盘快捷键 =====
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    if (!tab?.id) return;
    if (command === 'translate-page') {
      const isTranslated = await getTabState(tab.id);
      if (isTranslated) {
        await chrome.storage.local.set({ translateSignal: { action: 'restore', _ts: Date.now() } });
      } else {
        chrome.storage.local.get(['sourceLang', 'targetLang'], async (s) => {
          await chrome.storage.local.set({ translateSignal: { action: 'translate', sourceLang: s.sourceLang || 'auto', targetLang: s.targetLang || 'zh', _ts: Date.now() } });
        });
      }
    } else if (command === 'restore-page') {
      await chrome.storage.local.set({ translateSignal: { action: 'restore', _ts: Date.now() } });
    }
  });
});

async function toggleTranslate(tabId) {
  const isTranslated = await getTabState(tabId);

  if (isTranslated) {
    await chrome.storage.local.set({ translateSignal: { action: 'restore', _ts: Date.now() } });
    await setTabState(tabId, false);
    chrome.contextMenus.update('toggle-translate', { title: '翻译页面' });
  } else {
    chrome.storage.local.get(['sourceLang', 'targetLang'], async (s) => {
      await chrome.storage.local.set({ translateSignal: { action: 'translate', sourceLang: s.sourceLang || 'auto', targetLang: s.targetLang || 'zh', _ts: Date.now() } });
    });
    await setTabState(tabId, true);
    chrome.contextMenus.update('toggle-translate', { title: '还原原文' });
  }
}

// 向标签页所有 frame 广播消息（两种方式并行确保覆盖）
async function broadcastToTab(tabId, message) {
  // 方式1: scripting API 注入所有 frame（覆盖动态创建的 frame）
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const targets = frames.map(f => ({ tabId, frameIds: [f.frameId] }));
    for (const t of targets) {
      chrome.scripting.executeScript({
        target: t,
        func: (msg) => {
          // 通知已在运行的 content script
          window.postMessage({ source: 'ai-translator', ...msg }, '*');
        },
        args: [message]
      }).catch(() => {});
    }
  } catch (e) {}
  // 方式2: 直接发消息给所有已知 frame
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    for (const frame of frames) {
      chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }).catch(() => {});
    }
  } catch (e) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  }
}

// ===== 消息中转 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translate') {
    handleTranslate(message).then(sendResponse);
    return true;
  }
  // 广播：popup 发来的指令，转发到标签页所有 frame
  if (message.action === 'broadcast') {
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (tab?.id) {
        const cmd = message.cmd || message.broadcastAction;
        await broadcastToTab(tab.id, { action: cmd, sourceLang: message.sourceLang, targetLang: message.targetLang, mode: message.mode, enabled: message.enabled });
      }
      sendResponse({ success: true });
    });
    return true;
  }
  // content script 状态同步
  if (message.action === 'translationComplete') {
    if (sender.tab?.id) {
      setTabState(sender.tab.id, true);
      chrome.contextMenus.update('toggle-translate', { title: '还原原文' });
    }
  }
  if (message.action === 'translationRestored') {
    if (sender.tab?.id) {
      setTabState(sender.tab.id, false);
      chrome.contextMenus.update('toggle-translate', { title: '翻译页面' });
    }
  }
});

async function handleTranslate({ texts, sourceLang, targetLang }) {
  try {
    const translated = await translateWithDeepSeek(texts, sourceLang, targetLang);
    return { success: true, translated };
  } catch (err) {
    console.error('翻译错误:', err);
    return { success: false, error: err.message };
  }
}
