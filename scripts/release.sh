#!/bin/bash
# 发布拆拆新版本（在 macOS 上运行）。
# 用法：npm run release -- [patch|minor|major] [--npm]
# 默认只发布到 GitHub；只有显式添加 --npm 才发布同名 npm 包。
#
# 顺序：检查 → 升级版本号 → 打包并模拟安装 → 全部通过后才提交、推送和上传。
# 进入上传步骤后失败可能已有部分发布，请检查 GitHub 上的发布结果。
set -euo pipefail
cd "$(dirname "$0")/.."

repo="17lijunyi/chaichai"
fail() { echo "发布停止：$1" >&2; exit 1; }
usage() { echo "用法：npm run release -- [patch|minor|major] [--npm]（默认只发布 GitHub）"; }
bump="patch"
bump_selected=false
publish_npm=false
for argument in "$@"; do
  case "${argument}" in
    patch|minor|major)
      [ "${bump_selected}" = false ] || fail "只能指定一个版本升级方式。"
      bump="${argument}"
      bump_selected=true
      ;;
    --npm) publish_npm=true ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "不认识的选项。" ;;
  esac
done

check_origin() {
  local remote_urls remote_url
  remote_urls="$(git remote get-url "$@" origin)" || fail "请为 origin 设置 ${repo} 的 GitHub 地址。"
  [ -n "${remote_urls}" ] || fail "origin 没有仓库地址。"
  while IFS= read -r remote_url; do
    case "${remote_url}" in
      "https://github.com/${repo}"|"https://github.com/${repo}.git"|\
      "git@github.com:${repo}"|"git@github.com:${repo}.git"|\
      "ssh://git@github.com/${repo}"|"ssh://git@github.com/${repo}.git") ;;
      *) fail "origin 的获取和推送地址都必须指向 ${repo}，没有执行发布。" ;;
    esac
  done <<<"${remote_urls}"
}
check_origin --all
check_origin --push --all
origin_url="$(git remote get-url origin)"

command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1 || fail "还没有登录 GitHub。请先运行：gh auth login"
[ -n "$(git config user.name)" ] && [ -n "$(git config user.email)" ] ||
  fail "git 还没有设置名字和邮箱。请运行：git config --global user.name 你的名字"
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || fail "请先切换到 main 分支：git switch main"
[ -z "$(git status --porcelain)" ] || fail "还有没提交的改动。请先提交：git add -A && git commit -m \"说明\""
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] ||
  fail "本地和 GitHub 上的代码不一致。请先运行 git pull 或 git push。"

if [ "${publish_npm}" = true ]; then
  npm whoami --registry=https://registry.npmjs.org >/dev/null 2>&1 ||
    fail "已指定 --npm，但还没有登录 npm；没有执行版本升级或发布。"
fi

echo "1/5 检查代码……"
npm run check:fast
npm run test:fast

echo "2/5 升级版本号（${bump}）……"
previous="$(node -p 'require("./package.json").version')"
restore_version() {
  echo "已撤销版本号改动。" >&2
  git checkout -- package.json package-lock.json src/generatedPackageMetadata.ts docs/installation.md
}
trap 'restore_version' ERR
npm version "${bump}" --no-git-tag-version >/dev/null
npm run metadata:generate >/dev/null
version="$(node -p 'require("./package.json").version')"
# 文档里的示例安装命令写的是确切版本号，一起更新
sed -i '' "s/chaichai-ai@${previous}/chaichai-ai@${version}/g" docs/installation.md

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir:?}"' EXIT
echo "3/5 打包并模拟安装……"
bash scripts/pack-release.sh "${workdir}"
trap - ERR

echo "4/5 提交并上传 v${version}……"
git add package.json package-lock.json src/generatedPackageMetadata.ts docs/installation.md
git commit -q -m "chore: release ${version}"
git push -q origin HEAD:main
gh release create "v${version}" \
  "${workdir}/chaichai-ai.tgz" "${workdir}/chaichai-ai.tgz.sha256" \
  --repo "${repo}" --target "$(git rev-parse HEAD)" --title "拆拆 ${version}" --notes "安装或更新方法见 README。"

# releases 分支：给 jsDelivr 国内加速用，沿用已有历史，禁止强制覆盖。
releases_dir="${workdir}/releases-branch"
if git ls-remote --exit-code --heads origin refs/heads/releases >/dev/null; then
  git clone -q --branch releases --single-branch --no-tags "${origin_url}" "${releases_dir}"
else
  remote_status="$?"
  [ "${remote_status}" = 2 ] || fail "无法确认 releases 分支的状态，已停止更新镜像。"
  mkdir -p "${releases_dir}"
  git -C "${releases_dir}" init -q -b releases
  git -C "${releases_dir}" remote add origin "${origin_url}"
fi
git -C "${releases_dir}" config user.name "$(git config user.name)"
git -C "${releases_dir}" config user.email "$(git config user.email)"
cp "${workdir}"/chaichai-ai*.tgz "${workdir}"/chaichai-ai*.tgz.sha256 "${releases_dir}/"
git -C "${releases_dir}" add -A
if ! git -C "${releases_dir}" diff --cached --quiet; then
  git -C "${releases_dir}" commit -q -m "release ${version}"
fi
git -C "${releases_dir}" push -q origin HEAD:refs/heads/releases

if [ "${publish_npm}" = true ]; then
  echo "5/5 发布 chaichai-ai@${version} 到 npm……"
  npm publish "${workdir}/chaichai-ai-${version}.tgz" --registry=https://registry.npmjs.org --access public
  curl -fsS -X PUT "https://registry-direct.npmmirror.com/-/package/chaichai-ai/syncs" >/dev/null ||
    echo "  （通知国内镜像失败也没关系，镜像通常会在 10 分钟内自动同步）"
else
  echo "5/5 跳过 npm（未显式指定 --npm）"
fi

# 刷新 jsDelivr 缓存，让学生马上拿到新的安装程序和安装包
for path in "@main/install.sh" "@main/uninstall.sh" "@releases/chaichai-ai.tgz" "@releases/chaichai-ai.tgz.sha256"; do
  curl -fsS "https://purge.jsdelivr.net/gh/${repo}${path}" >/dev/null ||
    echo "  （刷新 ${path} 的缓存失败也没关系，最多 12 小时后自动更新）"
done

rm -rf "${workdir:?}"
echo
echo "完成：拆拆 ${version} 已发布。学生重新运行安装命令即可更新。"
