// translator.js — DeepSeek API 翻译客户端

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const LANGUAGE_NAMES = {
  auto: '自动检测',
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
};

/**
 * 使用 DeepSeek API 翻译文本数组
 * @param {string[]} texts - 待翻译文本列表
 * @param {string} sourceLang - 源语言代码
 * @param {string} targetLang - 目标语言代码
 * @returns {Promise<string[]>} 翻译后的文本列表
 */
export async function translateWithDeepSeek(texts, sourceLang, targetLang) {
  const { apiKey, model, temperature } = await chrome.storage.local.get([
    'apiKey', 'model', 'temperature'
  ]);
  if (!apiKey) {
    throw new Error('请先在设置页面配置 DeepSeek API Key');
  }

  const effectiveModel = model || 'deepseek-v4-flash';
  const effectiveTemp = temperature !== undefined ? temperature : 0.3;

  const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;

  const systemPrompt = `你是一个专业的翻译引擎。请将以下${sourceName}文本翻译成${targetName}。

规则：
1. 只返回翻译结果，不要添加任何解释、注释或额外文本
2. 严格以 JSON 数组格式返回：["译文1", "译文2", ...]
3. 数组长度必须与输入文本数量完全一致（共 ${texts.length} 条）
4. 保持原文的语气、风格和格式
5. 对专业术语保持准确
6. 无法翻译的内容（代码、数字、专有名词）保留原文`;

  const userMessage = JSON.stringify({ texts });

  const body = {
    model: effectiveModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: effectiveTemp,
    max_tokens: 8192,
    response_format: { type: 'json_object' }
  };

  const response = await fetchWithRetry(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek 返回了空响应');
  }

  return parseTranslationResponse(content, texts.length);
}

function parseTranslationResponse(content, expectedCount) {
  // 尝试从 markdown 代码块中提取 JSON
  let jsonStr = content;
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // 尝试解析 JSON 数组
  const arrMatch = jsonStr.match(/\[[\s\S]*?\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const result = parsed.map(item =>
          typeof item === 'string' ? item : (item.translated || item.text || JSON.stringify(item))
        );
        if (result.length !== expectedCount) {
          console.warn(`翻译结果数量(${result.length})与输入(${expectedCount})不匹配`);
        }
        return result.slice(0, expectedCount);
      }
    } catch (e) {
      console.warn('JSON 解析失败，回退到逐行解析:', e.message);
    }
  }

  // 回退：逐行解析
  const lines = content
    .split('\n')
    .map(line => line.replace(/^\d+\.\s*/, '').trim())
    .filter(line => line.length > 0);

  if (lines.length !== expectedCount) {
    console.warn(`逐行解析数量(${lines.length})与输入(${expectedCount})不匹配`);
  }

  return lines.slice(0, expectedCount);
}

async function fetchWithRetry(url, options, retries = 2, baseDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // 4xx 错误（非 429）不重试
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API 请求失败: HTTP ${response.status}`);
      }

      if (attempt < retries) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API 请求失败: HTTP ${response.status}`);
      }
    } catch (e) {
      if (attempt === retries || e.message.startsWith('API 请求失败')) throw e;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
