// translator.js — DeepSeek API 翻译客户端

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const LANGUAGE_NAMES = {
  auto: '自动检测',
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语'
};

// 请求速率控制
let lastRequestTime = 0;

/**
 * 使用 DeepSeek API 翻译文本数组
 */
export async function translateWithDeepSeek(texts, sourceLang, targetLang) {
  const settings = await chrome.storage.local.get([
    'apiKey', 'model', 'temperature',
    'thinkingEnabled', 'reasoningEffort',
    'maxTokens'
  ]);

  if (!settings.apiKey) {
    throw new Error('请先在设置页面配置 DeepSeek API Key');
  }

  // 速率限制
  await enforceRateLimit(settings);

  const effectiveModel = settings.model || 'deepseek-v4-flash';
  const effectiveTemp = settings.temperature !== undefined ? settings.temperature : 0.3;

  const sourceName = LANGUAGE_NAMES[sourceLang] || sourceLang;
  const targetName = LANGUAGE_NAMES[targetLang] || targetLang;

  const systemPrompt = `你是一个专业的翻译引擎。你的任务是将以下所有文本从${sourceName}翻译成${targetName}。

重要规则：
1. 必须翻译每条文本，不管是哪种语言的混合内容，都要完整翻译成${targetName}
2. 即使文本中包含英文产品名、品牌名、URL，其余部分也必须翻译
3. 品牌名和专有名词保留原文，但周围的描述性文字必须翻译
4. 严格以 JSON 格式返回：{"texts":["译文1","译文2",...]}
5. 数组长度必须与输入完全一致（共 ${texts.length} 条）
6. 保持原文的语气、风格和格式
7. 不要添加任何解释或注释`;

  const userMessage = JSON.stringify({ texts });

  const body = {
    model: effectiveModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: effectiveTemp,
    max_tokens: settings.maxTokens || 8192,
    response_format: { type: 'json_object' }
  };

  // 思考模式 (V4 默认开启，用户可选择关闭)
  if (effectiveModel.startsWith('deepseek-v4')) {
    if (settings.thinkingEnabled === false) {
      body.thinking = { type: 'disabled' };
    }
    if (settings.reasoningEffort) {
      body.reasoning_effort = settings.reasoningEffort;
    }
  }

  const response = await fetchWithRetry(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek 返回了空响应');
  }

  let result = parseResponse(content, texts.length);

  // 检测：如果超过一半的译文和原文相同，可能是模型偷懒没翻译
  const unchanged = texts.filter((t, i) => i < result.length && result[i] === t).length;
  if (unchanged > texts.length * 0.4 && texts.length > 1) {
    console.warn(`[AI翻译] 发现 ${unchanged}/${texts.length} 条未翻译，使用加强 prompt 重试`);

    const retryPrompt = `你是一个严格的翻译引擎。上一轮你返回了未翻译的原文，这是不可接受的。

请将以下所有文本从${sourceName}翻译成${targetName}。每条文本都必须翻译，无论其中是否包含英文词汇。

严格返回 JSON：{"texts":["译文1","译文2",...]}`;

    const retryBody = {
      ...body,
      messages: [
        { role: 'system', content: retryPrompt },
        { role: 'user', content: `请务必全部翻译（${texts.length}条）：` + JSON.stringify(texts) }
      ],
      temperature: Math.min((effectiveTemp || 0.3) + 0.2, 1.0)
    };

    const retryResp = await fetchWithRetry(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify(retryBody)
    });

    const retryData = await retryResp.json();
    const retryContent = retryData.choices?.[0]?.message?.content;
    if (retryContent) {
      const retryResult = parseResponse(retryContent, texts.length);
      // 只替换那些没被翻译的条目
      for (let i = 0; i < texts.length && i < result.length; i++) {
        if (result[i] === texts[i] && i < retryResult.length && retryResult[i] !== texts[i]) {
          result[i] = retryResult[i];
        }
      }
    }
  }

  return result;
}

async function enforceRateLimit(settings) {
  const maxRPS = settings.maxRequestsPerSec || 3;
  const minInterval = 1000 / maxRPS;
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < minInterval) {
    await new Promise(r => setTimeout(r, minInterval - elapsed));
  }
  lastRequestTime = Date.now();
}

function parseResponse(content, expectedCount) {
  // 尝试直接 JSON 解析
  try {
    const parsed = JSON.parse(content);
    return extractTexts(parsed, expectedCount);
  } catch {}

  // 从 markdown 代码块提取
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      return extractTexts(parsed, expectedCount);
    } catch {}
  }

  // 正则匹配 JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/) || content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return extractTexts(parsed, expectedCount);
    } catch {}
  }

  // 回退到逐行
  const lines = content.split('\n')
    .map(l => l.replace(/^\d+\.\s*/, '').trim())
    .filter(l => l.length > 0);
  if (lines.length !== expectedCount) {
    console.warn(`行解析数量(${lines.length})与输入(${expectedCount})不匹配`);
  }
  return lines.slice(0, expectedCount);
}

function extractTexts(parsed, expectedCount) {
  let result;
  if (Array.isArray(parsed)) {
    result = parsed;
  } else if (parsed.texts && Array.isArray(parsed.texts)) {
    result = parsed.texts;
  } else if (parsed.translations && Array.isArray(parsed.translations)) {
    result = parsed.translations;
  } else {
    throw new Error('未知响应格式');
  }
  const texts = result.map(item =>
    typeof item === 'string' ? item : (item.translated || item.text || JSON.stringify(item))
  );
  if (texts.length !== expectedCount) {
    console.warn(`翻译数量(${texts.length})与输入(${expectedCount})不匹配`);
  }
  return texts.slice(0, expectedCount);
}

async function fetchWithRetry(url, options, retries = 2, baseDelay = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败: HTTP ${response.status}`);
      }

      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      } else {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `API 请求失败: HTTP ${response.status}`);
      }
    } catch (e) {
      if (attempt === retries || e.message.startsWith('API 请求失败')) throw e;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
}
