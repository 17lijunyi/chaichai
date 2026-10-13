import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createTestTempDirectory } from "../../fixtures/temporaryDirectory.js";
import { PRODUCT_IDENTITY } from "../../../src/identity.js";

const installer = resolve("install.sh");
const uninstaller = resolve("uninstall.sh");
const releaseScript = resolve("scripts/release.sh");

const runBash = (script: string, args: readonly string[]) =>
  spawnSync("/bin/bash", [script, ...args], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-home" },
  });

describe("student installer scripts", () => {
  it.each([installer, uninstaller, releaseScript])(
    "parses %s with the system bash",
    (script) => {
      const result = spawnSync("/bin/bash", ["-n", script], {
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    },
  );

  it("refuses to run a truncated download", async () => {
    const source = await readFile(installer, "utf8");
    const truncated = source.slice(0, source.lastIndexOf("}"));
    const result = spawnSync("/bin/bash", ["-s"], {
      input: truncated,
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-home" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("拆拆 ChaiChai 安装程序");
  });

  it("previews the plan without touching the home directory", () => {
    const result = runBash(installer, ["--dry-run", "--version", "1.2.3"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("演练模式");
    expect(result.stdout).toContain(`${PRODUCT_IDENTITY.packageName}@1.2.3`);
    expect(result.stdout).toContain(
      `/nonexistent-home/.chaichai/bin/${PRODUCT_IDENTITY.cliBinary}`,
    );
  });

  it("rejects an invalid version before doing any work", () => {
    const result = runBash(installer, ["--version", "latest; rm -rf ~"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("版本号格式不对");
  });

  it("installs the package the product identity names", async () => {
    const source = await readFile(installer, "utf8");
    expect(source).toContain(`PACKAGE="${PRODUCT_IDENTITY.packageName}"`);
    expect(source).toContain("REA_REGISTRATION_LAUNCHER=");
  });

  it("does not uninstall without confirmation when no terminal is attached", async () => {
    // A detached child has no controlling terminal, like `curl | bash` in CI.
    const child = spawn("/bin/bash", [uninstaller], {
      env: { PATH: "/usr/bin:/bin", HOME: "/nonexistent-home" },
      stdio: ["ignore", "ignore", "pipe"],
      detached: true,
    });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const [code] = (await once(child, "close")) as [number | null];
    expect(code).toBe(1);
    expect(stderr).toContain("--yes");
  });
  it("never deletes a directory the installer did not mark as its own", async () => {
    const home = await createTestTempDirectory("chaichai-uninstall-guard-");
    const documents = join(home, "Documents");
    await mkdir(documents);
    await writeFile(join(documents, "homework.txt"), "keep");
    const result = spawnSync("/bin/bash", [uninstaller, "--yes"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: home, CHAICHAI_HOME: documents },
    });
    expect(result.status).toBe(1);
    expect(await readFile(join(documents, "homework.txt"), "utf8")).toBe(
      "keep",
    );
  });

  it("keeps a shell profile whose ChaiChai block was edited", async () => {
    const home = await createTestTempDirectory("chaichai-uninstall-profile-");
    const profile = join(home, ".zshrc");
    const edited =
      '# >>> chaichai >>>\nexport PATH="$HOME/.chaichai/bin:$PATH"\nalias mine="ls"\n';
    await writeFile(profile, edited);
    const result = spawnSync("/bin/bash", [uninstaller, "--yes"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin", HOME: home },
    });
    expect(result.status).toBe(0);
    expect(await readFile(profile, "utf8")).toBe(edited);
  });
  it("explains that Intel Macs are not supported", async () => {
    const home = await createTestTempDirectory("chaichai-intel-");
    const bin = join(home, "bin");
    await mkdir(bin);
    // Simulate an Intel Mac: Darwin kernel without Apple silicon.
    await writeFile(join(bin, "uname"), "#!/bin/sh\necho Darwin\n", {
      mode: 0o755,
    });
    await writeFile(join(bin, "sysctl"), "#!/bin/sh\necho 0\n", {
      mode: 0o755,
    });
    await writeFile(join(bin, "id"), "#!/bin/sh\necho 501\n", { mode: 0o755 });
    const result = spawnSync("/bin/bash", [installer, "--no-setup"], {
      encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Apple 芯片");
  });
});

// Run the public release entrypoint with isolated files and external command
// fixtures. No command below can contact GitHub/npm or change user settings.
const runRelease = async (
  args: readonly string[],
  options: {
    pushUrl?: string;
    mirrorExists?: boolean;
    npmLoggedIn?: boolean;
  } = {},
) => {
  const root = await createTestTempDirectory("chaichai-release-");
  const scripts = join(root, "scripts");
  const bin = join(root, "bin");
  const log = join(root, "commands.log");
  await Promise.all([
    mkdir(scripts),
    mkdir(bin),
    mkdir(join(root, "docs")),
    writeFile(log, ""),
    writeFile(join(root, "package.json"), '{"version":"1.0.0"}\n'),
  ]);
  await copyFile(releaseScript, join(scripts, "release.sh"));
  await writeFile(join(root, "docs/installation.md"), "chaichai-ai@1.0.0\n");
  await writeFile(
    join(scripts, "pack-release.sh"),
    '#!/bin/sh\nmkdir -p "$1"\nfor file in chaichai-ai.tgz chaichai-ai.tgz.sha256 chaichai-ai-1.0.1.tgz chaichai-ai-1.0.1.tgz.sha256; do printf fixture > "$1/$file"; done\n',
  );
  const git = [
    "#!/bin/sh",
    'printf "git %s\\n" "$*" >> "$RELEASE_TEST_LOG"',
    'if [ "$1" = -C ]; then shift 2; fi',
    'case "$1" in',
    '  remote) if [ "$2" = get-url ]; then case " $* " in *" --push "*) printf "%s\\n" "$RELEASE_TEST_PUSH" ;; *) printf "%s\\n" https://github.com/17lijunyi/chaichai.git ;; esac; fi ;;',
    '  config) case "${2:-}" in user.name) printf "Fixture\\n" ;; user.email) printf "fixture@example.com\\n" ;; esac ;;',
    '  rev-parse) if [ "$2" = --abbrev-ref ]; then printf "main\\n"; else printf "fixture-head\\n"; fi ;;',
    '  ls-remote) exit "$RELEASE_TEST_BRANCH_STATUS" ;;',
    '  clone) for argument in "$@"; do target="$argument"; done; mkdir -p "$target" ;;',
    "  diff) exit 1 ;;",
    "esac",
    "exit 0",
    "",
  ].join("\n");
  const npm = [
    "#!/bin/sh",
    'printf "npm %s\\n" "$*" >> "$RELEASE_TEST_LOG"',
    'if [ "$1" = whoami ]; then exit "$RELEASE_TEST_NPM_STATUS"; fi',
    'if [ "$1" = version ]; then "$RELEASE_TEST_NODE" -e \'const fs=require("node:fs");fs.writeFileSync("package.json",JSON.stringify({version:"1.0.1"}));\'; fi',
    "exit 0",
    "",
  ].join("\n");
  const recorder = (name: string) =>
    `#!/bin/sh\nprintf "${name} %s\\n" "$*" >> "$RELEASE_TEST_LOG"\nexit 0\n`;
  await Promise.all([
    writeFile(join(bin, "git"), git, { mode: 0o755 }),
    writeFile(join(bin, "npm"), npm, { mode: 0o755 }),
    writeFile(join(bin, "gh"), recorder("gh"), { mode: 0o755 }),
    writeFile(join(bin, "curl"), recorder("curl"), { mode: 0o755 }),
    writeFile(
      join(bin, "node"),
      '#!/bin/sh\nexec "$RELEASE_TEST_NODE" "$@"\n',
      {
        mode: 0o755,
      },
    ),
  ]);
  const result = spawnSync(
    "/bin/bash",
    [join(scripts, "release.sh"), ...args],
    {
      encoding: "utf8",
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        TMPDIR: root,
        RELEASE_TEST_LOG: log,
        RELEASE_TEST_NODE: process.execPath,
        RELEASE_TEST_PUSH:
          options.pushUrl ?? "https://github.com/17lijunyi/chaichai.git",
        RELEASE_TEST_BRANCH_STATUS: options.mirrorExists ? "0" : "2",
        RELEASE_TEST_NPM_STATUS: options.npmLoggedIn === false ? "1" : "0",
      },
    },
  );
  return { ...result, commands: await readFile(log, "utf8") };
};

describe("student release script", () => {
  it("rejects an extra foreign push URL before running any publishing command", async () => {
    const result = await runRelease([], {
      pushUrl:
        "https://github.com/17lijunyi/chaichai.git\nhttps://github.com/hubooooooo/chaichai.git",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("origin 的获取和推送地址都必须指向");
    expect(result.commands).not.toContain("gh ");
    expect(result.commands).not.toContain("npm ");
    expect(result.commands).not.toContain("git push");
  });

  it("defaults to GitHub-only and continues the existing releases branch without force", async () => {
    const result = await runRelease([], { mirrorExists: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.commands).toContain("gh release create v1.0.1");
    expect(result.commands).toContain("--repo 17lijunyi/chaichai");
    expect(result.commands).toContain("git clone -q --branch releases");
    expect(result.commands).toContain(
      "push -q origin HEAD:refs/heads/releases",
    );
    expect(result.commands).not.toContain("npm whoami");
    expect(result.commands).not.toContain("npm publish");
    expect(result.commands).not.toMatch(/(?:--force|\s-f\s)/u);
  });

  it("requires npm login before version changes when npm publishing is requested", async () => {
    const result = await runRelease(["--npm"], { npmLoggedIn: false });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("已指定 --npm");
    expect(result.commands).toContain("npm whoami");
    expect(result.commands).not.toContain("npm version");
    expect(result.commands).not.toContain("gh release create");
  });

  it("publishes npm only with the explicit flag and safely creates a missing mirror branch", async () => {
    const result = await runRelease(["patch", "--npm"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.commands).toContain("npm publish ");
    expect(result.commands).toContain("init -q -b releases");
    expect(result.commands).toContain(
      "remote add origin https://github.com/17lijunyi/chaichai.git",
    );
    expect(result.commands).not.toContain("git clone");
    expect(result.commands).not.toMatch(/(?:--force|\s-f\s)/u);
  });
});
