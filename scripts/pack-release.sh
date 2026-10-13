#!/bin/bash
# 打包拆拆的安装包，并用全新的临时用户目录模拟学生安装一遍。
# 用法：bash scripts/pack-release.sh 输出目录
# 输出：chaichai-ai.tgz、chaichai-ai-版本号.tgz，以及它们的 .sha256 指纹文件。
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:?用法：bash scripts/pack-release.sh 输出目录}"
mkdir -p "${out}"
version="$(node -p 'require("./package.json").version')"

echo "打包 chaichai-ai@${version}……"
npm run build:cached >/dev/null
# 把锁定的依赖版本一起打进安装包，学生装到的依赖和这里测试过的完全一致
cp package-lock.json npm-shrinkwrap.json
trap 'rm -f npm-shrinkwrap.json' EXIT
npm pack --silent --pack-destination "${out}" >/dev/null
rm -f npm-shrinkwrap.json

cd "${out}"
cp "chaichai-ai-${version}.tgz" chaichai-ai.tgz
for file in chaichai-ai.tgz "chaichai-ai-${version}.tgz"; do
  shasum -a 256 "${file}" >"${file}.sha256"
done
cd - >/dev/null

echo "模拟学生安装（临时用户目录，不影响这台电脑）……"
smoke_home="$(mktemp -d)"
trap 'rm -f npm-shrinkwrap.json; rm -rf "${smoke_home:?}"' EXIT
HOME="${smoke_home}" bash install.sh --from "${out}/chaichai-ai.tgz" --no-setup >"${out}/smoke-install.log" 2>&1 || {
  echo "模拟安装失败，详见 ${out}/smoke-install.log" >&2
  exit 1
}
installed="$("${smoke_home}/.chaichai/bin/chaichai" --version | tail -n 1)"
[ "${installed}" = "${version}" ] || {
  echo "模拟安装后的版本是 ${installed}，应该是 ${version}" >&2
  exit 1
}
echo "打包完成：${out}/chaichai-ai.tgz（${version}），模拟安装通过。"
