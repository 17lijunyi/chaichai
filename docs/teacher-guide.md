# 老师手册：发布和维护拆拆

这份手册写给维护拆拆的老师。学生只需要看首页的 [README](https://github.com/17lijunyi/chaichai#readme)。

## 拆拆是怎么送到学生电脑上的

```text
你的 GitHub 仓库 ─┬─ main 分支：代码和 install.sh ───────┐
                  ├─ releases 分支：安装包 chaichai-ai.tgz ┼─ jsDelivr 国内加速 ─▶ 学生电脑
                  └─ Releases 页面：安装包（备用）─────────┘
```

- 学生运行的安装命令先下载 `install.sh`，再从国内镜像下载拆拆专用的 Node.js 和依赖。
- 拆拆本身的安装包按顺序从这几个地方下载：jsDelivr 加速 → GitHub Releases。
- **默认只发布到 GitHub。** `npm run release` 不会发布 npm 包；只有明确添加 `--npm` 才会执行 npm 发布。
- 没有在 npm 上发布时，安装程序**不会**去 npm 上找 `chaichai-ai`。这样别人抢注同名包，学生也不会装错。
- 安装程序保持 `NPM_ENABLED="false"`。发布到 npm 不会自动改这个设置；确认包名所有权和实际发布结果后，维护者才能另行决定是否启用。

## 第一次发布（只做一次）

这台电脑已登录 GitHub 账号 `17lijunyi`，可以让 AI 助手代劳。也可以自己运行：

```bash
gh repo create 17lijunyi/chaichai --public --source . --push
bash scripts/pack-release.sh /tmp/chaichai-1.0.0      # 打包，并模拟学生安装一遍
gh release create v1.0.0 /tmp/chaichai-1.0.0/chaichai-ai.tgz /tmp/chaichai-1.0.0/chaichai-ai.tgz.sha256 \
  --title "拆拆 1.0.0" --notes "第一个版本"
# releases 分支（给 jsDelivr 国内加速用）
mkdir /tmp/chaichai-releases && cp /tmp/chaichai-1.0.0/chaichai-ai*.tgz* /tmp/chaichai-releases/
git -C /tmp/chaichai-releases init -b releases && git -C /tmp/chaichai-releases add -A
git -C /tmp/chaichai-releases commit -m "release 1.0.0"
git -C /tmp/chaichai-releases remote add origin https://github.com/17lijunyi/chaichai.git
git -C /tmp/chaichai-releases push origin HEAD:refs/heads/releases
```

做完后，自己在终端运行一遍 README 里的安装命令，确认能装好。

上述新建 `releases` 分支的命令只用于首次发布。已有分支时应沿用其历史，使用下方发布脚本追加安装包，不强制覆盖分支。

**明确要发布到 npm 时：** 先确认 `chaichai-ai` 包名的发布权限，运行 `npm login --registry=https://registry.npmjs.org`，再执行 `npm run release -- --npm`。即使已经登录 npm，不带 `--npm` 也不会发布 npm 包。

## 发布更新

改完代码并提交后，运行：

```bash
npm run release            # 小更新：1.0.0 → 1.0.1
npm run release -- minor   # 加了新功能：1.0.1 → 1.1.0
# 只有明确授权 npm 发布时才添加此选项
npm run release -- minor --npm
```

这个命令会按顺序：检查代码 → 升级版本号 → 打包并**模拟学生安装一遍** → 提交、推送并上传安装包（GitHub Releases 和 releases 分支，都带 SHA-256 指纹）→ 仅在指定 `--npm` 时发布 npm 包 → 刷新镜像缓存。上传开始后的失败可能已经产生部分发布；先检查 GitHub 和已选发布渠道的结果，再处理后续步骤。

学生**重新运行一次安装命令**就能更新到最新版。默认 `NPM_ENABLED="false"` 时，`chaichai update` 会提示重新运行安装命令；只有维护者另行核实并启用 npm-name 安装后，才使用 npm 更新路径。

## 学生安装失败时

1. 先让学生把安装命令**重新运行一次**。安装程序可以重复运行，会自动修复。
2. 还不行，让学生把 `~/.chaichai/install.log` 发给你。常见情况：

| 记录里看到的              | 原因                   | 怎么办                                                             |
| ------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `checksum mismatch`       | 下载的文件不完整       | 换个网络重试                                                       |
| `ETIMEDOUT`、`ECONNRESET` | 网络不通               | 关掉代理/VPN，或换个网络重试                                       |
| `E404`                    | 发布包或镜像路径不可用 | 检查 GitHub Releases、releases 分支的安装包和 SHA-256 文件是否齐全 |
| `EACCES`                  | 某个文件夹没有权限     | 让学生运行：`sudo chown -R "$USER" ~/.chaichai`，再重新安装        |

3. **学校网络完全打不开 GitHub 时**：把项目里的 `install.sh` 文件直接发给学生（微信或网盘都行），让学生运行 `bash ~/Downloads/install.sh`。
4. **npm 也连不上时**：先在你的电脑上运行 `npm pack`，得到 `chaichai-ai-x.y.z.tgz`。把它和 `install.sh` 一起发给学生，让学生运行：

   ```bash
   bash ~/Downloads/install.sh --from ~/Downloads/chaichai-ai-x.y.z.tgz
   ```

   注意：这种方式仍然需要从国内镜像下载 Node.js 和少量依赖。

## 安装程序做了什么

| 位置                       | 内容                                                                          |
| -------------------------- | ----------------------------------------------------------------------------- |
| `~/.chaichai/node/`        | 拆拆专用的 Node.js（Node 24；macOS 13.5 以下用 Node 22）。只支持 Apple 芯片   |
| `~/.chaichai/app/`         | 拆拆程序本体                                                                  |
| `~/.chaichai/bin/chaichai` | 启动器。AI 工具通过它启动拆拆                                                 |
| `~/.chaichai/npmrc`        | 拆拆专用的 npm 设置（国内镜像）                                               |
| `~/.chaichai/install.log`  | 安装记录                                                                      |
| `~/.zprofile`、`~/.zshrc`  | 各加 4 行，把 `~/.chaichai/bin` 加入 PATH。修改前有备份（`.chaichai-backup`） |
| 各 AI 工具的配置文件       | 加入名为 `chaichai` 的 MCP 服务器。修改前有备份（`.chaichai.backup`）         |

安装程序不使用 sudo，也不会安装或修改 Homebrew、系统 Node.js、nvm、Java 等其他软件。
