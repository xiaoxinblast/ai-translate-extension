# AI 翻译助手

基于 DeepSeek V4 的 Edge/Chrome 双语网页翻译插件。Manifest V3，海洋科技风视觉。

## 功能

### 全页翻译
- **文本节点级引擎** — TreeWalker 遍历 TextNode，不破坏页面 DOM（链接、按钮、图片完全保留）
- **双语对照 / 仅译文** — 两种显示模式一键切换
- **视口优先翻译** — IntersectionObserver 监视，可见区域优先翻译，滚动自动加载
- **8 种语言互译** — 中 / 英 / 日 / 韩 / 法 / 德 / 西 / 俄
- **多框架支持** — 可翻译评论 iframe（Tolstoy / Disqus 等）

### 划词翻译 (v1.2)
- 选中网页任意文字 → 浮动翻译按钮出现
- 点击按钮 → 玻璃拟态弹窗显示原文 + 译文
- **按钮位置可拖动** — 自定义位置，跨页面/跨会话持久化
- **弹窗可拖动** — 随意摆放，不挡视线
- **一键复制** — 弹窗内复制译文到剪贴板

### 翻译引擎
- DeepSeek V4 Pro / Flash，支持思考模式
- JSON 结构化请求 + 指数退避重试 + 速率控制

### 操作方式
- **Pop-up 面板** — 语言选择 + 模式切换 + 一键翻译
- **右键菜单** — 翻译页面 / 还原原文
- **键盘快捷键** — `Ctrl+Shift+T` 翻译 / `Ctrl+Shift+R` 还原
- **调试工具** — `Ctrl+Shift+L` 日志面板 / `Ctrl+Shift+X` 诊断快照

## 安装

1. 打开 Edge/Chrome，访问 `edge://extensions/` 或 `chrome://extensions/`
2. 开启「开发人员模式」
3. 点击「加载解压缩的扩展」→ 选择本项目文件夹
4. 在设置页配置 DeepSeek API Key

## 设置选项

| 分类 | 选项 |
|------|------|
| 划词翻译 | 开关 |
| 模型 | DeepSeek V4 Flash / Pro |
| 思考模式 | 开关 + 强度（high / max） |
| 请求控制 | 单秒最大请求数、每批最大文本长度、每批最大段落数 |
| 温度 | 0 ~ 2 |
| 最大输出 Token | 1024 ~ 32768 |

## 项目结构

```
├── manifest.json              # Manifest V3, all_frames
├── icons/                     # SVG + PNG 图标
├── src/
│   ├── popup/                 # 控制面板
│   ├── content/               # 翻译引擎 + 划词翻译
│   ├── background/            # Service Worker (API 中转 / 广播 / 右键菜单)
│   ├── options/               # 设置页
│   └── utils/                 # DeepSeek API 客户端
└── README.md
```

## 版本

| 版本 | 更新 |
|------|------|
| v1.2.0 | 划词翻译（拖动定位 + 复制）、海洋科技风视觉重构（玻璃拟态 + 蓝青渐变）、SVG 图标重绘 |
| v1.1.0 | 多框架翻译 + storage 信号同步 + 文本节点级引擎修复 |
| v1.0.0 | 初始发布 |
