// options.js — 设置页面交互逻辑

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('apiKey');
  const toggleApiKeyBtn = document.getElementById('toggleApiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const testApiKeyBtn = document.getElementById('testApiKey');
  const modelSelect = document.getElementById('modelSelect');
  const temperatureRange = document.getElementById('temperatureRange');
  const temperatureValue = document.getElementById('temperatureValue');
  const statusMessage = document.getElementById('statusMessage');
  const backLink = document.getElementById('backLink');

  // 加载已保存的设置
  const settings = await chrome.storage.local.get([
    'apiKey',
    'model',
    'temperature'
  ]);

  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }
  if (settings.model) {
    modelSelect.value = settings.model;
  }
  if (settings.temperature !== undefined) {
    temperatureRange.value = settings.temperature;
    temperatureValue.textContent = settings.temperature;
  }

  // 显示/隐藏 API Key
  toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleApiKeyBtn.textContent = isPassword ? '🙈' : '👁';
  });

  // 保存 API Key
  saveApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('请输入 API Key', 'error');
      return;
    }

    await chrome.storage.local.set({ apiKey });
    showStatus('API Key 已保存', 'success');
  });

  // 测试连接
  testApiKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      showStatus('请先输入 API Key', 'error');
      return;
    }

    // 先保存
    await chrome.storage.local.set({ apiKey });

    showStatus('正在测试连接...', '');

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [
            { role: 'system', content: '回复"连接成功"' },
            { role: 'user', content: '测试' }
          ],
          max_tokens: 10
        })
      });

      if (response.ok) {
        showStatus('连接成功！API Key 有效', 'success');
      } else if (response.status === 401) {
        showStatus('API Key 无效，请检查', 'error');
      } else {
        showStatus(`连接失败: HTTP ${response.status}`, 'error');
      }
    } catch (err) {
      showStatus(`网络错误: ${err.message}`, 'error');
    }
  });

  // 模型选择
  modelSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ model: modelSelect.value });
  });

  // 温度滑块
  temperatureRange.addEventListener('input', async () => {
    temperatureValue.textContent = temperatureRange.value;
    await chrome.storage.local.set({ temperature: parseFloat(temperatureRange.value) });
  });

  // 返回
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });

  function showStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message ${type}`;
    if (type === 'success') {
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status-message';
      }, 3000);
    }
  }
});
