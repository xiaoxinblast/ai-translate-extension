// options.js — 设置页面

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  // 加载所有设置
  const settings = await chrome.storage.local.get([
    'apiKey', 'model', 'temperature', 'maxTokens',
    'thinkingEnabled', 'reasoningEffort',
    'maxRequestsPerSec', 'maxTextLen', 'maxParaCount',
    'selectionTranslateEnabled'
  ]);

  // API Key
  if (settings.apiKey) $('apiKey').value = settings.apiKey;

  $('toggleApiKey').addEventListener('click', () => {
    const field = $('apiKey');
    const btn = $('toggleApiKey');
    field.type = field.type === 'password' ? 'text' : 'password';
    btn.textContent = field.type === 'password' ? '👁' : '🙈';
  });

  $('saveApiKey').addEventListener('click', async () => {
    const key = $('apiKey').value.trim();
    if (!key) { showStatus('请输入 API Key', 'error'); return; }
    await chrome.storage.local.set({ apiKey: key });
    showStatus('已保存', 'success');
  });

  $('testApiKey').addEventListener('click', async () => {
    const key = $('apiKey').value.trim();
    if (!key) { showStatus('请先输入 API Key', 'error'); return; }
    await chrome.storage.local.set({ apiKey: key });
    showStatus('测试中...', '');
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: '回复"ok"' }],
          max_tokens: 5
        })
      });
      showStatus(r.ok ? '连接成功' : (r.status === 401 ? 'API Key 无效' : `HTTP ${r.status}`), r.ok ? 'success' : 'error');
    } catch (e) {
      showStatus(`网络错误: ${e.message}`, 'error');
    }
  });

  // 模型
  if (settings.model) $('modelSelect').value = settings.model;
  $('modelSelect').addEventListener('change', () => {
    chrome.storage.local.set({ model: $('modelSelect').value });
  });

  // 温度
  const temp = settings.temperature !== undefined ? settings.temperature : 0.3;
  $('temperatureRange').value = temp;
  $('temperatureValue').textContent = temp;
  $('temperatureRange').addEventListener('input', () => {
    const v = parseFloat($('temperatureRange').value);
    $('temperatureValue').textContent = v;
    chrome.storage.local.set({ temperature: v });
  });

  // 最大输出 Token
  const mt = settings.maxTokens || 8192;
  $('maxTokens').value = mt;
  $('maxTokensValue').textContent = mt;
  $('maxTokens').addEventListener('input', () => {
    const v = parseInt($('maxTokens').value);
    $('maxTokensValue').textContent = v;
    chrome.storage.local.set({ maxTokens: v });
  });

  // 思考模式
  $('thinkingToggle').checked = settings.thinkingEnabled !== false; // 默认开启
  if (settings.reasoningEffort) $('reasoningEffort').value = settings.reasoningEffort;

  $('thinkingToggle').addEventListener('change', () => {
    chrome.storage.local.set({ thinkingEnabled: $('thinkingToggle').checked });
  });
  $('reasoningEffort').addEventListener('change', () => {
    chrome.storage.local.set({ reasoningEffort: $('reasoningEffort').value });
  });

  // 请求控制
  const rps = settings.maxRequestsPerSec || 2;
  $('maxRPS').value = rps;
  $('maxRPSValue').textContent = rps;
  $('maxRPS').addEventListener('input', () => {
    const v = parseInt($('maxRPS').value);
    $('maxRPSValue').textContent = v;
    chrome.storage.local.set({ maxRequestsPerSec: v });
  });

  const tlen = settings.maxTextLen || 5000;
  $('maxTextLen').value = tlen;
  $('maxTextLenValue').textContent = tlen;
  $('maxTextLen').addEventListener('input', () => {
    const v = parseInt($('maxTextLen').value);
    $('maxTextLenValue').textContent = v;
    chrome.storage.local.set({ maxTextLen: v });
  });

  const pcount = settings.maxParaCount || 30;
  $('maxParaCount').value = pcount;
  $('maxParaCountValue').textContent = pcount;
  $('maxParaCount').addEventListener('input', () => {
    const v = parseInt($('maxParaCount').value);
    $('maxParaCountValue').textContent = v;
    chrome.storage.local.set({ maxParaCount: v });
  });

  // 划词翻译
  $('selectionToggle').checked = settings.selectionTranslateEnabled !== false;
  $('selectionToggle').addEventListener('change', () => {
    chrome.storage.local.set({ selectionTranslateEnabled: $('selectionToggle').checked });
  });

  $('backLink').addEventListener('click', (e) => { e.preventDefault(); window.close(); });

  function showStatus(msg, type) {
    const el = $('statusMessage');
    el.textContent = msg;
    el.className = `status-message ${type}`;
    if (type === 'success') setTimeout(() => { el.textContent = ''; el.className = 'status-message'; }, 3000);
  }
});
