# AI 翻译助手

基于 DeepSeek V4 的 Edge/Chrome 双语网页翻译插件。

## 功能

- 段落级双语对照翻译（原文 + 译文垂直排列）
- 支持 8 种语言互译（中/英/日/韩/法/德/西/俄）
- DeepSeek V4 Pro / Flash 模型
- Token 动态分批，大页面自动拆分
- 一键恢复原文

## 安装

1. 打开 Edge，访问 `edge://extensions/`
2. 开启「开发人员模式」
3. 点击「加载解压缩的扩展」→ 选择本项目文件夹
4. 在设置页配置 DeepSeek API Key

## 项目结构

```
├── manifest.json           # 扩展清单 (Manifest V3)
├── icons/                  # 扩展图标
├── src/
│   ├── popup/              # 弹出控制面板
│   ├── content/            # 网页注入脚本（核心翻译逻辑）
│   ├── background/         # Service Worker（API 中转）
│   ├── options/            # API Key 设置页
│   └── utils/              # DeepSeek API 客户端
└── README.md
```
