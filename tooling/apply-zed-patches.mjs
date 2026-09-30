import { spawnSync } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Apply the local GPUI rendering change without replacing dependency edits. */
export function ensureZedShaderEffectPatch(repoRoot) {
  const checkout = path.join(repoRoot, ".dependencies", "zed");
  const patchDirectory = path.join(repoRoot, ".dependencies", "zed-patches");
  const patch = path.join(patchDirectory, "0001-terminal-shader-effects.patch");
  if (!existsSync(path.join(checkout, ".git"))) {
    throw new Error(
      "The Zed checkout is missing. Run git submodule update --init -- .dependencies/zed first.",
    );
  }
  const run = (args) =>
    spawnSync("git", ["-C", checkout, ...args], { encoding: "utf8" });
  const applied = run(["apply", "--reverse", "--check", patch]);
  if (applied.status === 0) return;

  const check = run(["apply", "--check", patch]);
  if (check.status !== 0) {
    const revision = run(["rev-parse", "HEAD"]).stdout?.trim() || "unknown";
    const expected = readFileSync(
      path.join(patchDirectory, "UPSTREAM"),
      "utf8",
    ).trim();
    throw new Error(
      `The GPUI shader patch cannot apply at ${revision} (reviewed against ${expected}). Check the revision and local edits. No files were changed.\n${check.stderr}`,
    );
  }
  const result = run(["apply", patch]);
  if (result.error || result.status !== 0) {
    throw (
      result.error ??
      new Error(`Could not apply the GPUI shader patch:\n${result.stderr}`)
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  ensureZedShaderEffectPatch(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );
}
