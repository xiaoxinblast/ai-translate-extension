// content.js — 文本节点级双语翻译引擎

// 启动标记：输出到 console 方便判断脚本在哪个 frame 运行
console.log('[AI翻译] 脚本已注入', {
  url: location.href,
  title: document.title.slice(0, 50),
  frame: window === window.top ? 'MAIN' : 'IFRAME',
  size: window.innerWidth + 'x' + window.innerHeight,
  textNodes: document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT) ? 'body present' : 'no body'
});

// iframe 守卫
if (window !== window.top) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 100 || h < 100) {
    console.log('[AI翻译] 跳过极小iframe', { w, h, url: location.href });
    // 不退出，继续执行——评论 iframe 可能有意义的内容
  }
}

const TRAN_CLASS = 'ai-tran';
const LOADING_CLASS = 'ai-loading-spinner';

// ===== 日志系统 =====
const logger = {
  entries: [], maxEntries: 300,
  _add(level, msg, data) {
    const entry = { time: new Date().toISOString().slice(11, 23), level, msg, data: data ? JSON.stringify(data).slice(0, 400) : '' };
    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) this.entries.length = this.maxEntries;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[AI翻译][${entry.time}][${level}] ${msg}`, data || '');
  },
  info(m, d) { this._add('info', m, d); },
  warn(m, d) { this._add('warn', m, d); },
  error(m, d) { this._add('error', m, d); },
  debug(m, d) { this._add('debug', m, d); },
  getAll() { return this.entries; },
  clear() { this.entries.length = 0; }
};

// 日志面板 Ctrl+Shift+L | 诊断 Ctrl+Shift+X
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'L') { e.preventDefault(); toggleLogPanel(); }
  if (e.ctrlKey && e.shiftKey && e.key === 'X') { e.preventDefault(); dumpDiagnostics(); }
});

let logPanel = null;
function toggleLogPanel() {
  if (logPanel) { logPanel.remove(); logPanel = null; return; }
  logPanel = document.createElement('div');
  logPanel.className = 'ai-log-panel';
  logPanel.innerHTML = `<div class="ai-log-header"><span>调试日志 (${logger.entries.length})</span><div><button class="ai-log-btn" data-action="export">导出</button><button class="ai-log-btn" data-action="clear">清空</button><button class="ai-log-btn" data-action="close">&times;</button></div></div><div class="ai-log-body"></div>`;
  logPanel.querySelector('[data-action="close"]').onclick = () => { logPanel.remove(); logPanel = null; };
  logPanel.querySelector('[data-action="clear"]').onclick = () => { logger.clear(); renderLogEntries(); };
  logPanel.querySelector('[data-action="export"]').onclick = () => exportLogs();
  document.body.appendChild(logPanel);
  renderLogEntries();
}
function renderLogEntries() {
  if (!logPanel) return;
  const body = logPanel.querySelector('.ai-log-body');
  const entries = logger.getAll();
  body.innerHTML = entries.length === 0 ? '<div class="ai-log-empty">暂无日志</div>'
    : entries.map(e => `<div class="ai-log-entry ai-log-${e.level}"><span class="ai-log-time">${e.time}</span><span class="ai-log-level">[${e.level}]</span><span class="ai-log-msg">${escHtml(e.msg)}</span>${e.data ? `<pre class="ai-log-data">${escHtml(e.data)}</pre>` : ''}</div>`).join('');
}
function exportLogs() {
  const lines = ['AI翻译插件 - 调试日志', `导出: ${new Date().toISOString()}`, `URL: ${location.href}`, '', '-'.repeat(60), ''];
  for (const e of logger.getAll()) lines.push(`[${e.time}][${e.level}] ${e.msg}${e.data ? '\n  data: ' + e.data : ''}`);
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ai-translate-log-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.txt`; a.click();
}
function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ===== 诊断快照 =====
function dumpDiagnostics() {
  // 只在主 frame 生成快照，避免 iframe 各自下载文件
  if (window !== window.top) {
    logger.info('快照跳过 iframe');
    return;
  }

  const nodes = getTranslatableTextNodes(document.body);
  const translated = document.querySelectorAll(`.${TRAN_CLASS}`);
  const lines = ['=== AI翻译 - 诊断快照 ===', `时间: ${new Date().toISOString()}`, `URL: ${location.href}`, `frame大小: ${window.innerWidth}x${window.innerHeight}`, `文档总文本节点: ${rawCount}`, '', `--- 可翻译文本节点 (${nodes.length}) ---`];
  // 对原始文本节点做过滤分析
  const rawNodes = []; { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) rawNodes.push(n); }
  const accepted = new Set(nodes);
  const rejectedSample = [];
  for (let i = 0; i < Math.min(rawNodes.length, 300); i++) {
    const n = rawNodes[i];
    if (!accepted.has(n) && n.textContent.trim().length >= 2) {
      const p = n.parentElement;
      rejectedSample.push(`<${p.tagName}> cls="${p.className.slice(0, 30)}" display:${window.getComputedStyle(p).display} hidden:${!!p.closest('[hidden]')} aria:${p.closest('[aria-hidden]') ? '1' : '0'} text="${n.textContent.trim().slice(0, 50)}"`);
      if (rejectedSample.length >= 30) break;
    }
  }
  if (rejectedSample.length > 0) {
    lines.push('', `--- 被过滤的文本节点 (共${rawNodes.length - nodes.length}个被拒, 抽样${rejectedSample.length}) ---`);
    lines.push(...rejectedSample);
  }

  for (let i = 0; i < Math.min(nodes.length, 80); i++) {
    const p = nodes[i].parentElement;
    lines.push(`[${i}] <${p.tagName}> "${nodes[i].textContent.trim().slice(0, 60)}"`);
  }
  lines.push('', `--- 已翻译节点 (${translated.length}) ---`);
  const invisible = [];
  for (const el of translated) {
    const cs = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // 跳过行内元素（inline 元素 getBoundingClientRect 可能返回 0×0，实际可见）
    if (cs.display === 'inline' || cs.display.startsWith('inline')) continue;
    if (r.width === 0 && r.height === 0 && el.textContent.trim().length > 0) {
      invisible.push(`<${el.tagName}> "${el.textContent.slice(0, 40)}"`);
    }
  }
  if (invisible.length) { lines.push('', `--- ⚠️ 不可见译文 (${invisible.length}) ---`); lines.push(...invisible); }
  // iframe 检测
  const iframes = document.querySelectorAll('iframe');
  const commentIframes = [];
  for (const ifr of iframes) {
    const src = ifr.src || '';
    if (/tolstoy|disqus|comment|discuss|reply/i.test(src)) commentIframes.push(src.slice(0, 80));
  }
  if (commentIframes.length) { lines.push('', `--- ⚠️ 评论区 iframe (${commentIframes.length}) ---`); lines.push(...commentIframes); }
  // 评论区容器检测
  const commentContainers = document.querySelectorAll('.tolstoycomments-feed, #comments, .app-comment, .wpdiscuz, #wpdcom');
  lines.push('', `--- 评论区容器 (${commentContainers.length}) ---`);
  for (const cc of commentContainers) {
    const t = (cc.textContent || '').trim().slice(0, 60);
    lines.push(`<${cc.tagName}> cls="${cc.className.slice(0, 50)}" children:${cc.children.length} text:"${t}"`);
  }
  // 检测同页其他 frame（如果是主 frame）
  if (window === window.top) {
    const childFrames = document.querySelectorAll('iframe');
    lines.push('', `--- 子 iframe (${childFrames.length}) ---`);
    for (const ifr of childFrames) {
      const doc = ifr.contentDocument;
      const tn = doc ? doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT) : null;
      let cnt = 0; if (tn) while (tn.nextNode()) cnt++;
      lines.push(`src="${(ifr.src || 'srcdoc').slice(0, 60)}" size:${ifr.clientWidth}x${ifr.clientHeight} textNodes:${cnt}`);
    }
  }
	const frameId = window !== window.top ? '-f' + Math.random().toString(36).slice(2,6) : '-main';
	const snapshotContent = lines.join(String.fromCharCode(10));
	// 只下载文件，不弹标签页
	try { const blob = new Blob([snapshotContent], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ai-diag' + frameId + '-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.txt'; a.click(); } catch(e) {}
	logger.info('诊断已导出', { frameId, nodes: nodes.length, translated: translated.length });
}

// ===== 状态 =====
const state = {
  translations: new Map(), // TextNode -> { original, translated, spanEl }
  isTranslating: false,
  displayMode: 'bilingual',
  translationCache: new Map(),
  observer: null,
  pendingNodes: [],
  processedNodes: new WeakSet(),
  totalNodes: 0,
  doneCount: 0
};

// ===== 消息监听（双通道：chrome.runtime + window.postMessage） =====
function handleAction(action, payload) {
  switch (action) {
    case 'toggleTranslation': if (!payload.enabled) restorePage(); break;
    case 'translate': handleTranslate(payload.sourceLang, payload.targetLang); break;
    case 'restore': restorePage(); break;
    case 'setDisplayMode': setDisplayMode(payload.mode); break;
    case 'toggleLog': toggleLogPanel(); break;
    case 'dumpSnapshot': dumpDiagnostics(); break;
    case 'getStatus': return { isTranslating: state.isTranslating, translatedCount: state.translations.size, displayMode: state.displayMode };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const result = handleAction(message.action, message);
  if (message.action === 'getStatus') sendResponse(result || {});
  else sendResponse({ success: true });
});

// 备用通道：通过 window.postMessage 接收广播指令
window.addEventListener('message', (e) => {
  if (e.data && e.data.source === 'ai-translator') {
    handleAction(e.data.action, e.data);
  }
});

(async () => {
  const s = await chrome.storage.local.get(['displayMode']);
  state.displayMode = s.displayMode || 'bilingual';
  logger.info('content.js 初始化', { displayMode: state.displayMode });
})();

// ===== 显示模式 =====
async function setDisplayMode(mode) {
  state.displayMode = mode;
  await chrome.storage.local.set({ displayMode: mode });
  // 切换已有翻译的显示方式
  for (const [textNode, data] of state.translations) {
    if (mode === 'translation-only') {
      textNode.textContent = data.translated;
      if (data.spanEl) data.spanEl.style.display = 'none';
    } else {
      textNode.textContent = data.original;
      if (data.spanEl) data.spanEl.style.display = '';
    }
  }
  logger.info('显示模式切换', { mode });
}

// ===== 翻译信号：通过 storage 同步所有 frame =====
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes.translateSignal && changes.translateSignal.newValue) {
    const { action, sourceLang, targetLang, mode, enabled } = changes.translateSignal.newValue;
    if (action === 'translate') {
      handleTranslate(sourceLang || 'auto', targetLang || 'zh');
    } else if (action === 'restore') {
      restorePage();
    } else if (action === 'setDisplayMode') {
      setDisplayMode(mode || 'bilingual');
    } else if (action === 'toggleTranslation') {
      if (!enabled) restorePage();
    }
  }
});

// ===== 全局 MutationObserver =====
let dynamicNodes = [];
const globalMO = new MutationObserver((mutations) => {
  let added = 0;
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        for (const tn of getTranslatableTextNodes(node)) {
          if (!state.processedNodes.has(tn)) {
            state.processedNodes.add(tn);
            if (state.isTranslating) {
              state.pendingNodes.push(tn);
              state.totalNodes++;
              added++;
            } else {
              dynamicNodes.push(tn);
            }
          }
        }
      }
    }
  }
  if (added > 0) {
    logger.info('动态内容捕获', { added });
    // 触发处理（传递上次的 sl/tl 参数兜底）
    processQueueWithFallback();
  }
});
globalMO.observe(document.body, { childList: true, subtree: true });

// 动态内容翻译：需要记住上次的源/目标语言
let lastSL = 'auto', lastTL = 'zh';
function processQueueWithFallback() {
  if (state.pendingNodes.length > 0) processQueue(lastSL, lastTL);
}

// ===== 缓存 =====
function cacheKey(text, sl, tl) { return `${text.slice(0, 200)}|${sl}|${tl}`; }
function getCached(text, sl, tl) { return state.translationCache.get(cacheKey(text, sl, tl)); }
function setCache(text, sl, tl, translated) { state.translationCache.set(cacheKey(text, sl, tl), translated); }

// ===== 翻译主流程 =====
async function handleTranslate(sourceLang, targetLang) {
  if (state.isTranslating) return;
  state.isTranslating = true;
  lastSL = sourceLang; lastTL = targetLang;
  logger.info('=== 开始翻译 ===', { sourceLang, targetLang });

  restorePage();
  if (state.observer) { state.observer.disconnect(); state.observer = null; }

  // 初始扫描 + 动态累积的节点
  const scannedNodes = getTranslatableTextNodes(document.body);
  // 合并翻译启动前动态加载的节点
  for (const dn of dynamicNodes) {
    if (!scannedNodes.includes(dn) && document.body.contains(dn)) scannedNodes.push(dn);
  }
  dynamicNodes = [];

  // 显式扫描评论区容器：第三方评论插件可能把内容放在特殊 DOM 结构中
  const commentSelectors = [
    '.tolstoycomments-feed', '#comments', '.comments-area', '.app-comment',
    '.wpdiscuz', '#wpdcom', '.comment-content', '.comment-body', '.comment-text',
    '.commentlist', '.comment-list', '.discussion', '#disqus_thread'
  ];
  let commentNodesAdded = 0;
  for (const sel of commentSelectors) {
    for (const container of document.querySelectorAll(sel)) {
      for (const tn of getTranslatableTextNodes(container)) {
        if (!scannedNodes.includes(tn)) {
          scannedNodes.push(tn);
          commentNodesAdded++;
        }
      }
    }
  }
  if (commentNodesAdded > 0) {
    logger.info('评论区文本节点追加', { added: commentNodesAdded });
  }

  // 检测 iframe 中的评论（无法翻译，但告知用户）
  const commentIframes = document.querySelectorAll('.tolstoycomments-feed iframe, #disqus_thread iframe, .comments-area iframe');
  if (commentIframes.length > 0) {
    logger.warn('评论区使用iframe', { count: commentIframes.length, note: '跨域iframe内容无法翻译' });
  }

  const textNodes = scannedNodes;
  logger.info('文本节点收集', { scanned: textNodes.length });
  if (textNodes.length === 0) {
    logger.warn('无文本节点');
    state.isTranslating = false;
    reportProgress('complete', { total: 0, done: 0 });
    return;
  }

  state.processedNodes = new WeakSet();
  state.pendingNodes = [];
  state.totalNodes = textNodes.length;
  state.doneCount = 0;

  // 按父容器去重分组
  const parentMap = new Map(); // parentElement -> TextNode[]
  for (const node of textNodes) {
    const p = node.parentElement;
    if (!parentMap.has(p)) parentMap.set(p, []);
    parentMap.get(p).push(node);
  }

  // IntersectionObserver 观察每个父元素
  let obsFires = 0;
  state.observer = new IntersectionObserver((entries) => {
    obsFires++;
    let pushed = 0;
    for (const entry of entries) {
      if (entry.isIntersecting && parentMap.has(entry.target)) {
        const nodes = parentMap.get(entry.target);
        for (const node of nodes) {
          if (!state.processedNodes.has(node)) {
            state.processedNodes.add(node);
            state.pendingNodes.push(node);
            pushed++;
          }
        }
        state.observer.unobserve(entry.target);
      }
    }
    if (pushed > 0) logger.debug(`Observer #${obsFires}`, { pushed, queue: state.pendingNodes.length });
    if (state.pendingNodes.length > 0) processQueue(sourceLang, targetLang);
  }, { rootMargin: `${Math.max(window.innerHeight, 800)}px` });

  for (const parent of parentMap.keys()) state.observer.observe(parent);
  logger.info('Observer 启动', { parents: parentMap.size });

  // 滚动兜底
  let ticking = false, lastScroll = Date.now();
  document.addEventListener('scroll', () => {
    lastScroll = Date.now();
    if (!ticking && state.isTranslating && state.pendingNodes.length > 0) {
      ticking = true;
      requestAnimationFrame(() => { processQueue(sourceLang, targetLang); ticking = false; });
    }
  }, { passive: true });

  // 兜底定时器
  let fbTimer = setInterval(() => {
    if (!state.isTranslating) { clearInterval(fbTimer); return; }
    if (Date.now() - lastScroll > 5000 && state.pendingNodes.length === 0) {
      clearInterval(fbTimer);
      flushRemaining(textNodes, sourceLang, targetLang);
    }
  }, 5000);

}

// ===== 队列处理 =====
let queueActive = false;
let cacheHitsAcc = 0, apiReqsAcc = 0;

async function processQueue(sl, tl) {
  if (queueActive) return;
  queueActive = true;

  const maxBatch = 20;
  try {
    while (state.pendingNodes.length > 0) {
      // 按视觉位置从上到下排序
      state.pendingNodes.sort((a, b) => {
        const aTop = a.parentElement?.getBoundingClientRect().top ?? 99999;
        const bTop = b.parentElement?.getBoundingClientRect().top ?? 99999;
        return aTop - bTop;
      });

      // 取出当前队列全部节点，分成多批并行翻译
      const allNodes = state.pendingNodes.splice(0);
      const batches = [];
      for (let i = 0; i < allNodes.length; i += maxBatch) {
        batches.push(allNodes.slice(i, i + maxBatch));
      }

      const results = []; // { node, translated }[]
      const batchTasks = batches.map(async (batch) => {
        const uncached = [], batchResults = [];
        for (const node of batch) {
          const text = node.textContent.trim();
          const cached = getCached(text, sl, tl);
          if (cached !== undefined) {
            batchResults.push({ node, translated: cached });
            cacheHitsAcc++;
          } else {
            uncached.push(node);
            showLoading(node);
          }
        }
        if (uncached.length > 0) {
          apiReqsAcc++;
          const texts = uncached.map(n => n.textContent.trim());
          logger.info(`API #${apiReqsAcc}`, { batch: uncached.length, totalBatches: batches.length });
          try {
            const translated = await requestTranslation(texts, sl, tl);
            uncached.forEach((node, i) => {
              hideLoading(node);
              const text = node.textContent.trim();
              const t = i < translated.length ? translated[i] : text;
              setCache(text, sl, tl, t);
              batchResults.push({ node, translated: t });
            });
          } catch (err) {
            logger.error(`API #${apiReqsAcc} 失败`, { error: err.message });
            uncached.forEach(n => hideLoading(n));
          }
        }
        return batchResults;
      });

      // 并行执行所有批次
      const allBatchResults = await Promise.all(batchTasks);
      for (const br of allBatchResults) {
        for (const { node, translated } of br) {
          if (!state.translations.has(node) && translated !== node.textContent.trim()) {
            injectTranslation(node, translated);
          } else if (translated === node.textContent.trim()) {
            logger.warn('译文与原文相同，跳过注入', { text: node.textContent.trim().slice(0, 40) });
          }
        }
      }

      state.doneCount += allNodes.length;
      reportProgress('progress', { total: state.totalNodes, done: state.doneCount });
    }
  } finally {
    queueActive = false;
  }

  if (state.pendingNodes.length > 0) {
    processQueue(sl, tl);
    return;
  }

  const loading = document.querySelectorAll(`.${LOADING_CLASS}`).length;
  if (loading === 0 && state.pendingNodes.length === 0) {
    if (state.doneCount < state.totalNodes) {
      // 还有未处理的节点，延长观察等用户滚动
      logger.info('等待未处理节点', { done: state.doneCount, total: state.totalNodes });
      queueActive = false;
      return; // 不结束，observer 继续工作
    }
    // 全部处理完成
    state.isTranslating = false;
    if (state.observer) { state.observer.disconnect(); state.observer = null; }
    logger.info('=== 翻译完成 ===', { total: state.totalNodes, done: state.doneCount, cacheHits: cacheHitsAcc, apiReqs: apiReqsAcc });
    reportProgress('complete', { total: state.totalNodes, done: state.doneCount });
    cacheHitsAcc = 0; apiReqsAcc = 0;
  }
}

function flushRemaining(allNodes, sl, tl) {
  let pushed = 0;
  for (const node of allNodes) {
    if (!state.processedNodes.has(node)) {
      state.processedNodes.add(node);
      state.pendingNodes.push(node);
      pushed++;
    }
  }
  if (pushed > 0) { logger.info('兜底追加', { pushed }); processQueue(sl, tl); }
}

// ===== 文本节点收集 =====
function getTranslatableTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.parentElement) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      const tag = parent.tagName;
      // 跳过脚本/样式/不可见标签
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'SVG', 'CANVAS', 'OBJECT', 'EMBED'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (tag === 'IFRAME') return NodeFilter.FILTER_REJECT;
      // 跳过 [hidden] 属性（HTML5 原生隐藏，视觉上不可见）
      if (parent.closest('[hidden]')) return NodeFilter.FILTER_REJECT;
      // 跳过已翻译内容 + 自身 UI
      if (parent.closest(`.${TRAN_CLASS}, .ai-log-panel, .ai-error-popup, .ai-error-indicator, .ai-translate-toolbar, .ai-hover-translate-btn`)) return NodeFilter.FILTER_REJECT;
      // 可见性检查：跳过 display:none，但穿透 third-party 评论插件的隐藏层
      if (!isEffectivelyVisible(parent)) return NodeFilter.FILTER_REJECT;
      const text = node.textContent.trim();
      if (text.length < 3) return NodeFilter.FILTER_REJECT;
      if (/^[\s\d.,;:!?()\[\]{}#@$%^&*+=<>|/\\~`'"_-]+$/.test(text)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
}

// 检测元素是否"有效可见"：跳过 display:none，但穿透 third-party 评论插件的隐藏容器
function isEffectivelyVisible(el) {
  let p = el;
  while (p && p !== document.body) {
    const s = window.getComputedStyle(p);
    if (s.visibility === 'hidden') return false;
    if (s.display === 'none') {
      // 如果是 third-party 评论容器（Tolstoy、Disqus 等），允许穿透
      const rawCls = p.className || '';
      const cls = typeof rawCls === 'string' ? rawCls : (rawCls.baseVal || '');
      const id = p.id || '';
      if (/tolstoycomments/i.test(cls) || /tolstoycomments/i.test(id) ||
          /disqus/i.test(cls) || /disqus/i.test(id) ||
          /wpdiscuz/i.test(cls)) {
        p = p.parentElement;
        continue; // 穿透这层，继续向上检查
      }
      // 如果是评论区本身（#comments），也允许穿透
      if (id === 'comments' || cls.includes('comments-area')) {
        p = p.parentElement;
        continue;
      }
      return false;
    }
    p = p.parentElement;
  }
  return true;
}

// ===== 加载指示器 =====
function showLoading(textNode) {
  const spinner = document.createElement('span');
  spinner.className = LOADING_CLASS;
  spinner.innerHTML = '<span class="ai-loading-spinner-dot"></span>';
  textNode.parentElement.insertBefore(spinner, textNode.nextSibling);
}

function hideLoading(textNode) {
  if (textNode.parentElement) {
    const spinners = textNode.parentElement.querySelectorAll(`.${LOADING_CLASS}`);
    spinners.forEach(s => { if (s.previousSibling === textNode) s.remove(); });
  }
}

// ===== 注入翻译（非破坏式追加） =====
function injectTranslation(textNode, translatedText) {
  const parent = textNode.parentElement;
  if (!parent) return;

  const span = document.createElement('span');
  span.className = TRAN_CLASS;
  span.textContent = translatedText;

  // 插入到文本节点后面
  if (textNode.nextSibling) {
    parent.insertBefore(span, textNode.nextSibling);
  } else {
    parent.appendChild(span);
  }

  state.translations.set(textNode, { original: textNode.textContent, translated: translatedText, spanEl: span });

  // translation-only：替换原文，隐藏译文 span
  if (state.displayMode === 'translation-only') {
    textNode.textContent = translatedText;
    span.style.display = 'none';
  }
}

// ===== 恢复 =====
function restorePage() {
  if (state.observer) { state.observer.disconnect(); state.observer = null; }
  logger.info('恢复原文', { count: state.translations.size });

  for (const [textNode, data] of state.translations) {
    // 从 Map 还原原文
    textNode.textContent = data.original;
    // 移除译文 span
    if (data.spanEl && data.spanEl.parentNode) data.spanEl.remove();
  }
  state.translations.clear();
  state.processedNodes = new WeakSet();
  state.pendingNodes = [];
  // 清除残留 spinner
  document.querySelectorAll(`.${LOADING_CLASS}`).forEach(s => s.remove());

  chrome.runtime.sendMessage({ action: 'translationRestored' }).catch(() => {});
}

// ===== 工具 =====
function requestTranslation(texts, sl, tl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'translate', texts, sourceLang: sl, targetLang: tl }, (resp) => {
      if (chrome.runtime.lastError) { reject(chrome.runtime.lastError); return; }
      resp?.success ? resolve(resp.translated) : reject(new Error(resp?.error || '翻译失败'));
    });
  });
}

function reportProgress(type, payload) {
  chrome.runtime.sendMessage({ action: `translation${type === 'complete' ? 'Complete' : 'Progress'}`, ...payload }).catch(() => {});
}
