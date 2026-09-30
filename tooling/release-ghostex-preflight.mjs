import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { logStep, run, capture } from './release-ghostex-process.mjs';
import {
  repoRoot,
  config,
  releaseTimeouts,
  remoteGxserverLinuxPackageConfigs,
  ReleaseError,
  missingRemoteGxserverLinuxPackageResources,
  shellQuote,
} from './release-ghostex-config.mjs';
import { renderGhostexCaskForTap } from './release-ghostex-homebrew.mjs';
import {
  runOptionalHomebrewHostValidation,
  ensureGhAuthForRelease,
  ensureCleanWorktree,
  ensureReleaseBranchSynced,
  ensureTagMissing,
  ensureReleaseMissing,
} from './release-ghostex-github.mjs';
import { extractChangelogSection } from './release-ghostex-notes.mjs';
import { ensureSigningIdentity, ensureNotaryProfile } from './release-ghostex-signing.mjs';

export async function verifyHomebrewReleaseReadiness(version) {
  logStep('Preflight Homebrew cask rendering');
  const tapDir = await mkdtemp(path.join(tmpdir(), `ghostex-${version}-homebrew-preflight-`));
  try {
    await run(`git clone ${shellQuote(config.tapRepo)} ${shellQuote(tapDir)}`);
    const caskFile = path.join(tapDir, config.caskPath);
    const currentCask = await readFile(caskFile, 'utf8');
    const placeholderSha = currentCask.match(/sha256\s+"([0-9a-f]{64})"/)?.[1] ?? 'a'.repeat(64);
    const renderedCask = renderGhostexCaskForTap(currentCask, {
      sha256: placeholderSha,
      version,
    });
    await writeFile(caskFile, renderedCask);
    await run(`ruby -c ${shellQuote(config.caskPath)}`, { cwd: tapDir });
    /*
     * CDXC:Release 2026-06-14-09:07:
     * Homebrew readiness must run before GitHub/Sparkle publication so a host
     * with an unusable Homebrew/Xcode/CLT setup fails while the release is still
     * reversible. Use a rendered placeholder cask and syntax/audit probes that
     * do not depend on the future DMG URL already existing.
     */
    await runOptionalHomebrewHostValidation(
      `HOMEBREW_NO_INSTALL_FROM_API=1 brew audit --cask --skip-style ${shellQuote(config.caskPath)}`,
      {
        cwd: tapDir,
        timeoutMs: releaseTimeouts.brewFetchMs,
      }
    );
  } finally {
    await rm(tapDir, { recursive: true, force: true });
  }
}

export async function ensureAndroidReleaseReadiness(version, buildVersion, options) {
  if (options.noPush || options.skipAndroid) {
    return;
  }
  if (!existsSync(config.androidSigningEnvFile)) {
    throw new ReleaseError(`Android signing env file is missing: ${config.androidSigningEnvFile}`);
  }
  const script = `
set -euo pipefail
set -a
source ${shellQuote(config.androidSigningEnvFile)}
set +a
export GHOSTEX_ANDROID_VERSION_NAME=${shellQuote(version)}
export GHOSTEX_ANDROID_VERSION_CODE=${shellQuote(String(buildVersion))}
export GHOSTEX_ANDROID_APK_VERSION_TAG=${shellQuote(`v${version}`)}
export GHOSTEX_ANDROID_REQUIRE_RELEASE_SIGNING=1
: "\${GHOSTEX_ANDROID_SIGNING_STORE_FILE:?}"
: "\${GHOSTEX_ANDROID_SIGNING_STORE_PASSWORD:?}"
: "\${GHOSTEX_ANDROID_SIGNING_KEY_ALIAS:?}"
: "\${GHOSTEX_ANDROID_SIGNING_KEY_PASSWORD:?}"
test -f "$GHOSTEX_ANDROID_SIGNING_STORE_FILE"
test -f "$PWD/mobile/package.json"
case "$GHOSTEX_ANDROID_SIGNING_STORE_FILE" in
  "$PWD/mobile"|"$PWD/mobile"/*) exit 42 ;;
esac
android_tool_found() {
  local tool="$1"
  local root
  for root in "\${ANDROID_HOME:-$HOME/Library/Android/sdk}" "$HOME/Library/Android/sdk" /opt/homebrew/share/android-commandlinetools; do
    [[ -d "$root" ]] || continue
    [[ -n "$(find "$root" -path "*/build-tools/*/$tool" -print -quit 2>/dev/null)" ]] && return 0
  done
  return 1
}
android_tool_found apksigner
android_tool_found aapt
`;
  /*
   * CDXC:Release 2026-06-14-09:07:
   * Android upload is now part of the standard release flow. Validate signing
   * material and build-tool availability before macOS publication so a missing
   * keystore or SDK tool does not leave the release needing manual APK repair.
   */
  try {
    await run(`/bin/zsh -lc ${shellQuote(script)}`, { timeoutMs: 30_000 });
  } catch (error) {
    const message = String(error.message ?? error);
    if (message.includes('exit 42')) {
      throw new ReleaseError('Android signing keystore must live outside the React Native mobile checkout.');
    }
    throw error;
  }
}

function remoteGxserverLinuxPackageBuildHint() {
  return [
    'Build the Ubuntu remote gxserver packages on Ubuntu/Linux CI with:',
    '  bun run gxserver:remote-linux',
    'Then run the release again from macOS so build/remote-gxserver-linux/x64/package and build/remote-gxserver-linux/arm64/package can be bundled.',
  ].join('\n');
}

async function remoteGxserverLinuxPackageIdentity(packageDir) {
  try {
    return JSON.parse(await readFile(path.join(packageDir, 'build-identity.json'), 'utf8'));
  } catch {
    return null;
  }
}

export async function ensureRemoteGxserverLinuxPackagesReady() {
  const expectedRevision = await capture('git rev-parse HEAD');
  const failures = [];
  for (const packageConfig of remoteGxserverLinuxPackageConfigs) {
    const missingResources = missingRemoteGxserverLinuxPackageResources(packageConfig.defaultPackageDir);
    if (missingResources.length > 0) {
      failures.push(
        `${packageConfig.packageLabel} (${packageConfig.arch}) at ${packageConfig.defaultPackageDir} is missing: ${missingResources.join(', ')}`
      );
      continue;
    }
    const identity = await remoteGxserverLinuxPackageIdentity(packageConfig.defaultPackageDir);
    if (!identity?.sourceRevision) {
      failures.push(
        `${packageConfig.packageLabel} (${packageConfig.arch}) at ${packageConfig.defaultPackageDir} was built without sourceRevision metadata. Rebuild it with the current package script.`
      );
      continue;
    }
    if (identity.sourceRevision !== expectedRevision) {
      failures.push(
        `${packageConfig.packageLabel} (${packageConfig.arch}) at ${packageConfig.defaultPackageDir} was built from ${identity.sourceRevision}, but the release source is ${expectedRevision}.`
      );
    }
    if (identity.sourceDirty) {
      failures.push(
        `${packageConfig.packageLabel} (${packageConfig.arch}) at ${packageConfig.defaultPackageDir} was built from a dirty worktree.`
      );
    }
  }
  if (failures.length > 0) {
    throw new ReleaseError(
      [
        'Remote Ubuntu gxserver packages are required for Ghostex releases.',
        ...failures,
        remoteGxserverLinuxPackageBuildHint(),
      ].join('\n')
    );
  }
}

async function latestSparkleVersion() {
  let maxVersion = 0;
  const xml = await readFile(path.join(repoRoot, config.armFeed), 'utf8');
  for (const match of xml.matchAll(/<sparkle:version>(\d+)<\/sparkle:version>/g)) {
    maxVersion = Math.max(maxVersion, Number.parseInt(match[1], 10));
  }
  return maxVersion;
}

async function findSparkleBinDir() {
  /*
   CDXC:Release 2026-06-10-09:47:
   New macOS releases are arm64-only, so Sparkle appcast generation should first
   use the arm64 SwiftPM artifact directory. Keep older fallback paths only so
   already-cached local tooling can still be found without rebuilding.
   */
  const searchRoots = [
    path.join(repoRoot, 'build/arm64/SourcePackages/artifacts/sparkle'),
    path.join(repoRoot, 'build/SourcePackages/artifacts/sparkle'),
    '/tmp/ghostex-xcodebuild/SourcePackages/artifacts/sparkle',
    path.join(process.env.HOME ?? '', 'Library/Developer/Xcode/DerivedData'),
  ];
  const command = [
    'find',
    ...searchRoots.map((root) => shellQuote(root)),
    "-path '*/Sparkle/bin/generate_appcast' -print -quit 2>/dev/null | xargs dirname",
  ].join(' ');
  const sparkleBinDir = await capture(command);
  if (!sparkleBinDir) {
    throw new ReleaseError('Could not find Sparkle generate_appcast. Build once so SwiftPM downloads Sparkle.');
  }
  for (const tool of ['generate_appcast', 'sign_update', 'generate_keys']) {
    const toolPath = path.join(sparkleBinDir, tool);
    if (!existsSync(toolPath)) {
      throw new ReleaseError(`Missing Sparkle tool: ${toolPath}`);
    }
  }
  return sparkleBinDir;
}

export async function findAndVerifySparkleBinDir() {
  const sparkleBinDir = await findSparkleBinDir();
  const publicKey = await capture(`${shellQuote(path.join(sparkleBinDir, 'generate_keys'))} -p`);
  if (!publicKey.includes(config.sparklePublicKey)) {
    throw new ReleaseError('Sparkle public key does not match the expected app SUPublicEDKey.');
  }
  return sparkleBinDir;
}

export async function preflight(version, buildVersion, options) {
  logStep('Preflight');
  await ensureGhAuthForRelease();
  await ensureCleanWorktree();
  await ensureReleaseBranchSynced(options.releaseBranch);
  await ensureTagMissing(version);
  await extractChangelogSection(version);
  if (!options.noPush) {
    await ensureReleaseMissing(version);
    await verifyHomebrewReleaseReadiness(version);
    await ensureAndroidReleaseReadiness(version, buildVersion, options);
  }

  if (!options.skipSparkle) {
    const previousBuild = await latestSparkleVersion();
    if (buildVersion <= previousBuild) {
      throw new ReleaseError(
        `Build version ${buildVersion} must be greater than the latest Sparkle build ${previousBuild}.`
      );
    }
    /*
     * CDXC:Release 2026-08-23:
     * --gpui used to merge into repository-root appcast-gpui.xml, a separate
     * Sparkle feed for the GPUI app's own bundle id. That feed was retired
     * (deleted with appcast-x86_64.xml); the current pipeline publishes the
     * single appcast.xml through tooling/release-gpui instead. This whole
     * legacy --gpui publish path has no successor in this file, so fail fast
     * and explicitly rather than trying to merge into a feed that no longer
     * exists (see buildArch, which fails the same way for the same reason).
     */
    if (options.gpui) {
      throw new ReleaseError(
        `--gpui is unreachable: it published a separate ${config.gpuiFeed} Sparkle feed, retired on 2026-08-23. ` +
          "This script's macOS release pipeline has no successor for that feed; the current pipeline publishes " +
          'appcast.xml through tooling/release-gpui.'
      );
    }
  }

  try {
    await run('env -u GH_TOKEN -u GITHUB_TOKEN gh auth status -h github.com');
  } catch (error) {
    console.warn(
      `Warning: gh auth status failed in this shell; Terminal delegation may still succeed.\n${String(error.message ?? error)}`
    );
  }
  await ensureSigningIdentity();
  await ensureNotaryProfile();

  console.log(
    `Release timeouts: build ${Math.round(releaseTimeouts.buildArchMs / 60_000)}m/arch, notary ${Math.round(releaseTimeouts.notaryArchMs / 60_000)}m/arch, overall ${Math.round(releaseTimeouts.overallMs / 60_000)}m.`
  );

  if (!options.skipTypecheck) {
    await run('bun run typecheck', { timeoutMs: releaseTimeouts.typecheckMs });
  }
  if (options.withTests) {
    await run('bun run release:test', { timeoutMs: releaseTimeouts.testMs });
  }

  return {};
}
