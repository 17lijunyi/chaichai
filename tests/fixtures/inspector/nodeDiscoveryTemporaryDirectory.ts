import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";

import { createTestTempDirectory } from "../temporaryDirectory.js";

/** Own a POSIX fixture whose discovery path contains no lossy Node characters. */
export const createNodeDiscoveryTempDirectory = async (
  prefix: string,
): Promise<string> => {
  for (const parent of [tmpdir(), "/tmp"]) {
    const canonicalParent = await realpath(parent);
    // macOS's account-specific temporary directory can contain underscores.
    // Node discovery cannot distinguish those from replaced quotes/backslashes.
    if (/[_"\\]/u.test(canonicalParent)) continue;
    return createTestTempDirectory(prefix, canonicalParent);
  }
  throw new Error(
    "Node discovery fixtures need a temporary directory without underscores, quotes, or backslashes",
  );
};
