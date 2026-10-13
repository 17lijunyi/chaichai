import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CATALOG_IDENTITY } from "../dist/catalogIdentity.js";
import { PRODUCT_IDENTITY } from "../dist/identity.js";

import { exec } from "./lib/verify-package-core.mjs";
import { verifyPackedBridge } from "./verify-packed-bridge.mjs";

/** Create a tarball and assert production packaging constraints. */
export async function verifyPackagePack({ root, workspace }) {
  const packDirectory = join(workspace, "pack");
  await mkdir(packDirectory);
  const tarball = join(
    packDirectory,
    (
      await exec(
        "npm",
        ["pack", "--silent", "--pack-destination", packDirectory],
        {
          cwd: root,
        },
      )
    ).stdout.trim(),
  );
  const packedFiles = (await exec("tar", ["-tf", tarball])).stdout.split("\n");
  const packedManifest = JSON.parse(
    (await exec("tar", ["-xOf", tarball, "package/package.json"])).stdout,
  );
  if (
    packedManifest.scripts?.postinstall !== undefined ||
    packedManifest.dependencies?.["node-pty"] !== undefined ||
    packedManifest.dependencies?.["@lydell/node-pty"] !== "1.1.0"
  )
    throw new Error("package retained a lifecycle-dependent PTY installation");
  const sourceManifest = JSON.parse(
    await readFile(join(root, "package.json"), "utf8"),
  );
  const expectedBins = sourceManifest.bin;
  if (
    typeof expectedBins?.[PRODUCT_IDENTITY.cliBinary] !== "string" ||
    JSON.stringify(Object.entries(packedManifest.bin ?? {}).sort()) !==
      JSON.stringify(Object.entries(expectedBins).sort())
  )
    throw new Error(
      "package did not expose its declared CLI command entry points",
    );
  for (const [command, entry] of Object.entries(expectedBins))
    if (!packedFiles.includes(`package/${entry}`))
      throw new Error(`package omitted the declared ${command} entry point`);
  for (const field of [
    "name",
    "version",
    "repository",
    "homepage",
    "bugs",
    "mcpName",
  ])
    if (
      JSON.stringify(packedManifest[field]) !==
      JSON.stringify(sourceManifest[field])
    )
      throw new Error(`package did not retain its declared ${field} metadata`);
  if (packedFiles.some((path) => path.startsWith("package/.agents/")))
    throw new Error(
      "package included authored skill sources instead of only the generated bundle",
    );
  if (packedFiles.some((path) => path.startsWith("package/.cache/")))
    throw new Error("package included development cache or test metadata");
  const skill = (
    await exec("tar", [
      "-xOf",
      tarball,
      `package/skills/${PRODUCT_IDENTITY.skillName}/SKILL.md`,
    ])
  ).stdout;
  if (
    !skill.includes(
      `  tool_count: ${String(CATALOG_IDENTITY.counts.mcp_tools)}\n`,
    ) ||
    skill.includes("  catalog_digest:")
  )
    throw new Error(
      "packaged skill metadata did not match the catalog shipped in the package",
    );
  if (
    packedFiles.some(
      (path) => path.includes("__pycache__") || path.endsWith(".pyc"),
    )
  ) {
    throw new Error("package contained generated Python bytecode");
  }
  await verifyPackedBridge({ workspace, tarball, packedFiles });
  return { tarball };
}
