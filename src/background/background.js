// background.js — Service Worker，处理翻译 API 请求

import { translateWithDeepSeek } from '../utils/translator.js';

// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'translate') {
    handleTranslate(message).then(sendResponse);
    return true; // 保持消息通道开放（异步响应）
  }
});

// 处理翻译请求
async function handleTranslate({ texts, sourceLang, targetLang }) {
  try {
    const translated = await translateWithDeepSeek(texts, sourceLang, targetLang);
    return { success: true, translated };
  } catch (err) {
    console.error('翻译错误:', err);
    return { success: false, error: err.message };
  }
}
