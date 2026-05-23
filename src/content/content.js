// content.js — 段落级双语对照翻译引擎

const BLOCK_SELECTORS = [
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li', 'td', 'th', 'blockquote', 'figcaption', 'dt', 'dd',
  'pre', 'code', 'span.ai-translated-item'
].join(',');

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT',
  'SVG', 'IFRAME', 'CANVAS', 'AUDIO', 'VIDEO', 'OBJECT', 'EMBED'
]);

const WRAPPER_CLASS = 'ai-translation-wrapper';
const ORIGINAL_CLASS = 'ai-original-text';
const TRANSLATION_CLASS = 'ai-translation-text';

const state = {
  originalContents: new Map(),
  isTranslating: false,
  containerCount: 0
};

// ===== 消息监听 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'toggleTranslation':
      if (!message.enabled) restorePage();
      sendResponse({ success: true });
      break;

    case 'translate':
      handleTranslate(message.sourceLang, message.targetLang);
      sendResponse({ started: true });
      break;

    case 'restore':
      restorePage();
      sendResponse({ success: true });
      break;

    case 'getStatus':
      sendResponse({
        isTranslating: state.isTranslating,
        translatedCount: state.originalContents.size
      });
      break;
  }
});

// ===== 翻译主流程 =====
async function handleTranslate(sourceLang, targetLang) {
  if (state.isTranslating) return;
  state.isTranslating = true;

  restorePage();

  const containers = getTranslatableContainers(document.body);
  if (containers.length === 0) {
    reportProgress('complete', { total: 0, done: 0 });
    state.isTranslating = false;
    return;
  }

  state.containerCount = containers.length;

  // 基于 token 估算动态分批
  const batches = buildBatches(containers);
  let done = 0;

  for (const batch of batches) {
    const texts = batch.map(c => extractText(c));
    try {
      const translated = await requestTranslation(texts, sourceLang, targetLang);
      batch.forEach((container, i) => {
        if (i < translated.length) {
          injectTranslation(container, translated[i]);
        }
      });
    } catch (err) {
      console.error('批次翻译失败:', err);
    }
    done += batch.length;
    reportProgress('progress', { total: containers.length, done });
  }

  state.isTranslating = false;
  reportProgress('complete', { total: containers.length, done: containers.length });
}

// ===== 容器识别 =====
function getTranslatableContainers(root) {
  const candidates = root.querySelectorAll(BLOCK_SELECTORS);
  const result = [];

  for (const el of candidates) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (el.closest(`.${WRAPPER_CLASS}`)) continue;
    if (el.closest('[contenteditable="true"]')) continue;

    // 跳过被隐藏的元素
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;

    const text = extractText(el);
    if (text.length < 4) continue;

    // 对 div 额外检查：不包含块级子元素
    if (el.tagName === 'DIV' && hasBlockChild(el)) continue;

    result.push(el);
  }

  return result;
}

function hasBlockChild(el) {
  const blockSelectors = 'div, section, article, aside, header, footer, nav, main, ul, ol, table, form, fieldset, details, p, h1, h2, h3, h4, h5, h6, blockquote, pre';
  return el.querySelector(blockSelectors) !== null;
}

// ===== 文本提取 =====
function extractText(el) {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

// ===== 分批策略 =====
function buildBatches(containers) {
  const MAX_TOKENS = 2800;
  const batches = [];
  let currentBatch = [];
  let currentTokens = 0;

  for (const c of containers) {
    const text = extractText(c);
    const tokens = estimateTokens(text) + 10; // 10 tokens overhead for JSON
    if (currentTokens + tokens > MAX_TOKENS && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokens = 0;
    }
    currentBatch.push(c);
    currentTokens += tokens;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

function estimateTokens(text) {
  let count = 0;
  for (const ch of text) {
    count += (ch.charCodeAt(0) > 127) ? 1.5 : 0.3;
  }
  return Math.ceil(count);
}

// ===== 注入翻译 =====

// 只能包含 phrasing content 的元素（插入 span，避免浏览器自动闭合）
const PHRASING_ONLY_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'DT', 'DD', 'FIGCAPTION', 'LI', 'TD', 'TH'
]);

function injectTranslation(container, translatedText) {
  if (state.originalContents.has(container)) return;

  state.originalContents.set(container, container.innerHTML);

  const useSpan = PHRASING_ONLY_TAGS.has(container.tagName);
  const wrapper = document.createElement(useSpan ? 'span' : 'div');
  wrapper.className = WRAPPER_CLASS;

  const originalEl = document.createElement(useSpan ? 'span' : 'div');
  originalEl.className = ORIGINAL_CLASS;
  originalEl.innerHTML = container.innerHTML;

  const translationEl = document.createElement(useSpan ? 'span' : 'div');
  translationEl.className = TRANSLATION_CLASS;
  translationEl.textContent = translatedText;

  wrapper.appendChild(originalEl);
  wrapper.appendChild(translationEl);

  container.innerHTML = '';
  container.appendChild(wrapper);
  container.classList.add('ai-translated');
}

// ===== 恢复原文 =====
function restorePage() {
  for (const [el, originalHTML] of state.originalContents) {
    el.innerHTML = originalHTML;
    el.classList.remove('ai-translated');
  }
  state.originalContents.clear();
}

// ===== 翻译请求代理 =====
function requestTranslation(texts, sourceLang, targetLang) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'translate', texts, sourceLang, targetLang },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (response?.success) {
          resolve(response.translated);
        } else {
          reject(new Error(response?.error || '翻译请求失败'));
        }
      }
    );
  });
}

// ===== 进度报告 =====
function reportProgress(type, payload) {
  chrome.runtime.sendMessage({
    action: `translation${type === 'complete' ? 'Complete' : 'Progress'}`,
    ...payload
  }).catch(() => {});
}
