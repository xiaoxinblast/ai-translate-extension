# AI 翻译助手

基于 DeepSeek V4 的 Edge/Chrome 双语网页翻译插件。

## 功能

- 文本节点级翻译，不破坏页面 DOM 结构（链接、按钮、图片完全保留）
- 双语对照 / 仅译文两种模式
- 视口滚动翻译（仅翻译可见区域，滚动自动加载）
- 支持 8 种语言互译（中/英/日/韩/法/德/西/俄）
- DeepSeek V4 Pro / Flash，支持思考模式
- 多框架支持（可翻译评论 iframe 如 Tolstoy/Disqus）
- 右键菜单 / 键盘快捷键（Ctrl+Shift+T/R）
- 调试日志面板（Ctrl+Shift+L）/ 诊断快照（Ctrl+Shift+X）

## 安装

1. 打开 Edge，访问 `edge://extensions/`
2. 开启「开发人员模式」
3. 点击「加载解压缩的扩展」→ 选择本项目文件夹
4. 在设置页配置 DeepSeek API Key

## 设置选项

| 分类 | 选项 |
|------|------|
| 模型 | DeepSeek V4 Flash / Pro |
| 思考模式 | 开关 + 强度（high/max） |
| 请求控制 | 每秒最大请求数、每批最大文本长度、每批最大段落数 |
| 温度 | 0 ~ 2 |
| 最大输出 Token | 1024 ~ 32768 |

## 项目结构

```
├── manifest.json              # 扩展清单 (Manifest V3, all_frames)
├── icons/                     # 扩展图标
├── src/
│   ├── popup/                 # 弹出控制面板（语言/模式/翻译触发）
│   ├── content/               # 文本节点级翻译引擎 + TreeWalker
│   ├── background/            # Service Worker（API中转/广播/右键菜单）
│   ├── options/               # API Key + 引擎参数设置页
│   └── utils/                 # DeepSeek API 客户端（JSON+重试+限速）
└── README.md
```
