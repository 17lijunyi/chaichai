![拆拆 ChaiChai · 拆开软件，看懂原理](https://raw.githubusercontent.com/17lijunyi/chaichai/main/docs/assets/cover.png?v=63fe22a17871)

# 拆拆 ChaiChai

让 AI 助手查看软件的结构、代码和运行行为，带着证据解释它是如何工作的。

ChaiChai 在本地运行，提供命令行工具和 MCP 服务器，可接入 Codex、Claude Code、Cursor 等 AI 客户端。你用自然语言描述想弄明白的问题，AI 选择工具、追踪线索，再给出带文件位置和证据的回答。

[下载安装](#安装) · [使用方法](#使用) · [功能文档](docs/index.md) · [版本发布](https://github.com/17lijunyi/chaichai/releases)

## 功能

- **拆解应用结构**：查看 JavaScript、Electron、Mac 应用、.NET、Android、Go、Flutter、固件和网页等目标。
- **追踪代码与交互**：定位函数、调用关系、模块、资源、配置和 IPC，连接界面行为与实现线索。
- **保留分析证据**：每个结果记录来源、覆盖范围和限制，区分观察、推导、推测与未知。
- **CLI 与 MCP 共用能力**：既能在终端直接分析，也能让 AI 客户端调用同一组工具。
- **按需接入分析引擎**：JavaScript 等静态分析无需额外引擎；原生二进制、Android 和运行时观察可使用已安装的对应工具。

## 安装

一键安装适用于 **Apple 芯片 Mac、macOS 11 或更新版本**：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/17lijunyi/chaichai@main/install.sh | bash
```

安装器使用独立的运行环境，按步骤显示进度。接入 AI 客户端前会展示修改计划，并备份原配置。安装完成后重新打开终端和 AI 客户端。

备用地址：

```bash
curl -fsSL https://raw.githubusercontent.com/17lijunyi/chaichai/main/install.sh | bash
```

也可以从 [Releases](https://github.com/17lijunyi/chaichai/releases) 下载安装包，在本地安装：

```bash
bash install.sh --from ./chaichai-ai.tgz
```

## 使用

在已经接入的 AI 客户端中描述目标和问题，例如：

> 用拆拆查看这个 Electron 应用，找到主进程、预加载脚本和页面之间的通信方式，并给出证据位置。

> 用拆拆检查这个 APK，列出权限、页面入口和主要组件。

> 用拆拆分析这个网页小游戏，解释计分规则及相关代码。

工作过程：

```text
识别目标 → 查看整体结构 → 追踪代码和行为 → 保留证据 → 解释结论
```

在终端直接使用：

```bash
chaichai --help
chaichai doctor
chaichai setup
chaichai analyze-javascript-application /absolute/path/to/app --json
```

常用命令及 MCP 接入配置见 [安装与设置](docs/installation.md#supported-agents)、[客户端配置](docs/client-configuration.md) 和 [CLI 文档](docs/cli.md)。

## 运行展示

![ChaiChai 命令行分析示例](https://raw.githubusercontent.com/17lijunyi/chaichai/main/docs/assets/cli-analysis.png)

对随仓库提供的 Electron 示例执行静态分析，可以查看主进程、预加载桥接、页面脚本及 IPC 线索；分析结果以 JSON 返回，并保留证据位置。这个过程不启动被分析的应用。

## 分析范围

| 目标                                       | 所需工具                                |
| ------------------------------------------ | --------------------------------------- |
| JavaScript、Electron、ASAR、应用资源及配置 | ChaiChai 自带能力                       |
| 原生二进制的深入反编译                     | 已安装的 Ghidra、Hopper 或 IDA          |
| Android APK                                | 对应操作使用 JADX、Java、Apktool 或 ADB |
| 浏览器与运行时观察                         | 对应的浏览器、调试或插桩工具            |

具体支持范围与环境要求见 [工具目录](docs/mcp-contracts.md#generated-catalog) 和 [各平台指南](docs/index.md)。缺少某个引擎时会明确提示，不影响其他可用能力。运行、附加进程、安装应用等操作需要单独确认目标和权限。

## 本地开发

使用 `.nvmrc` 指定的 Node.js 版本和 `package.json` 指定的 npm 版本：

```bash
npm ci
npm run build:cached
npm run check:fast
npm run test:fast
node scripts/rea.mjs --help
```

启动文档站：

```bash
npm run docs:dev
```

发布和打包说明见 [维护指南](docs/teacher-guide.md)，测试说明见 [docs/testing.md](docs/testing.md)。

## 许可

采用 [MIT License](LICENSE)。第三方组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [licenses/](licenses/)。请在授权范围内分析软件，使用边界见 [DISCLAIMER.md](DISCLAIMER.md)。
