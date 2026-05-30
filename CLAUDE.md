# AI 翻译助手

基于 DeepSeek V4 的 Edge/Chrome 双语网页翻译插件。Manifest V3。

## 架构

```
src/popup/       → 用户界面，通过 chrome.storage.local 发指令
src/content/     → 文本节点级翻译引擎（TreeWalker），每 frame 独立运行
src/background/  → Service Worker，API 中转 + 右键菜单 + 快捷键
src/options/     → API Key + 模型参数设置
src/utils/       → DeepSeek API 客户端（JSON 请求 + 重试 + 限速）
```

## 核心设计决策

1. **文本节点级翻译** — TreeWalker 遍历 TextNode，不碰容器 DOM。链接/按钮/图片完全不破坏。
2. **storage 信号同步** — popup/右键/快捷键通过 `chrome.storage.local.set({ translateSignal })` 通知所有 frame，不依赖消息路由。
3. **非破坏式注入** — 双语追加 `<span class="ai-tran">`，仅译文替换 `textContent` 存 Map。
4. **IntersectionObserver + 滚动** — 视口内内容优先翻译，roll 到再翻。

## 关键文件

| 文件 | 职责 |
|------|------|
| `manifest.json` | `all_frames` + `match_about_blank` + `match_origin_as_fallback` |
| `src/content/content.js` | TreeWalker 收集文本节点 → 分批并行 API → 注入/还原 |
| `src/utils/translator.js` | DeepSeek Chat API，JSON 结构化请求，指数退避重试 |
| `src/background/background.js` | 右键菜单动态切换，快捷键，storage 状态持久化 |

## 翻译流程

```
popup 点翻译 → storage.local.set({ translateSignal })
  → 所有 frame onChanged → handleTranslate()
  → TreeWalker 收集文本节点 → 按视口排序
  → IntersectionObserver 监视 → 并行 API 请求
  → 注入: 双语追加 span / 仅译文替换 textContent
  → state.translations Map 记录 → 还原时从 Map 恢复
```

## 调试

- `Ctrl+Shift+L` — 日志面板（或 popup 按钮）
- `Ctrl+Shift+X` — 诊断快照（或 popup 按钮）
- 日志导出按钮 → `log/ai-translate-log-*.txt`
- 快照文件 → `log/ai-diag-*-*.txt`

## 注意事项

- SVG 元素 `className` 是 `SVGAnimatedString` 对象，不能直接调 `.includes()`，需要用 `typeof` 判断
- `all_frames` 下所有 iframe 都运行 content script，注意只让主 frame 做快照下载
- 翻译缓存 key = `text[0:200]|sl|tl`，同一页面切换模式不重复请求
