import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validateMacosAppBundle } from './validate-macos-app-bundle.mjs';
import {
  repoRoot,
  config,
  releaseTimeouts,
  releaseArchitectures,
  gpuiReleaseEntry,
  remoteGxserverLinuxPackageConfigs,
  onDemandAssetNames,
  ReleaseError,
  shellQuote,
} from './release-ghostex-config.mjs';
import { logStep, run, capture, runWithHeartbeat } from './release-ghostex-process.mjs';
import { parseGithubAssetSha } from './release-ghostex-github.mjs';
import { gpuiReleaseSigningIdentity } from './release-ghostex-signing.mjs';

async function updatePackageJson(version) {
  const packagePath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  packageJson.version = version;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

export async function bumpReleaseMetadata(version, buildVersion, options) {
  logStep(`Bump release metadata to ${version} (${buildVersion})`);
  await updatePackageJson(version);
}

/*
 * CDXC:Release 2026-08-22:
 * buildArch used to invoke native/macos/ghostexHost/build-ghostex-host.sh, the
 * Xcode build for the Swift/AppKit macOS app. That app (and its ghostexHost
 * Xcode project) was removed on 2026-08-20; this legacy pipeline has no
 * successor in this file. macOS builds now run through tooling/release-gpui/macos.sh.
 * Fail fast and explicitly instead of leaving a stale path that would only
 * surface as an opaque "no such file" error from the shell.
 */
async function buildArch(version, entry) {
  throw new ReleaseError(
    `buildArch(${entry.arch}) for ${version} is unreachable: it built the deprecated Swift macOS app via ` +
      'native/macos/ghostexHost/build-ghostex-host.sh, removed with that app on 2026-08-20. ' +
      "This script's macOS build pipeline has no successor here; macOS builds run through tooling/release-gpui/macos.sh."
  );
}

async function validateBuiltApp(version, buildVersion, entry) {
  logStep(`Validate built ${entry.arch} app`);
  const infoCommand = [
    `plutil -p ${shellQuote(path.join(entry.appPath, 'Contents/Info.plist'))}`,
    '|',
    "rg 'CFBundleShortVersionString|CFBundleVersion|CFBundleIdentifier|SUFeedURL|SUPublicEDKey|GHOSTEX'",
  ].join(' ');
  await run(infoCommand);
  await run(
    `codesign -dv --verbose=4 ${shellQuote(entry.appPath)} 2>&1 | rg 'Authority|TeamIdentifier|Identifier|Timestamp|Runtime|Format'`
  );
  await run(`codesign --verify --deep --strict --verbose=2 ${shellQuote(entry.appPath)}`);
  await run(
    `lipo -archs ${shellQuote(path.join(entry.appPath, 'Contents/MacOS', config.appName))} | grep -Fx ${shellQuote(entry.arch)}`
  );
  await run(
    `lipo -archs ${shellQuote(path.join(entry.appPath, 'Contents/Frameworks/Chromium Embedded Framework.framework/Chromium Embedded Framework'))} | grep -Fx ${shellQuote(entry.arch)}`
  );
  try {
    await validateMacosAppBundle({
      allowLegacyBundleShape: true,
      appName: config.appName,
      appPath: entry.appPath,
      arch: entry.arch,
    });
  } catch (error) {
    throw new ReleaseError(error instanceof Error ? error.message : String(error));
  }
  const onDemandAssets = await validateOnDemandAssetStaging(version, entry);

  const info = await capture(
    `plutil -extract CFBundleShortVersionString raw ${shellQuote(path.join(entry.appPath, 'Contents/Info.plist'))}`
  );
  const bundleVersion = await capture(
    `plutil -extract CFBundleVersion raw ${shellQuote(path.join(entry.appPath, 'Contents/Info.plist'))}`
  );
  const feedUrl = await capture(
    `plutil -extract SUFeedURL raw ${shellQuote(path.join(entry.appPath, 'Contents/Info.plist'))}`
  );
  const publicKey = await capture(
    `plutil -extract SUPublicEDKey raw ${shellQuote(path.join(entry.appPath, 'Contents/Info.plist'))}`
  );

  if (info !== version || bundleVersion !== String(buildVersion)) {
    throw new ReleaseError(`${entry.arch} Info.plist version mismatch: ${info} (${bundleVersion})`);
  }
  if (feedUrl !== entry.feedUrl) {
    throw new ReleaseError(`${entry.arch} SUFeedURL mismatch: ${feedUrl}`);
  }
  if (publicKey !== config.sparklePublicKey) {
    throw new ReleaseError(`${entry.arch} SUPublicEDKey mismatch.`);
  }

  await validateLidSleepHelperSigning(entry);
  return onDemandAssets;
}

export function onDemandAssetsDir(version) {
  return path.join(repoRoot, 'build', 'on-demand-assets', version);
}

export async function readOnDemandBuildManifest(version) {
  const manifestPath = path.join(onDemandAssetsDir(version), 'assets.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new ReleaseError(
      `On-demand asset build manifest is missing or unreadable: ${manifestPath}. The app build with GHOSTEX_ON_DEMAND_ASSETS=1 writes it.\n${String(error?.message ?? error)}`
    );
  }
  if (manifest.version !== version || !Array.isArray(manifest.assets)) {
    throw new ReleaseError(`On-demand asset build manifest at ${manifestPath} does not describe version ${version}.`);
  }
  return manifest;
}

async function validateOnDemandAssetStaging(version, entry) {
  const webRoot = path.join(entry.appPath, 'Contents', 'Resources', 'Web');

  for (const packageConfig of remoteGxserverLinuxPackageConfigs) {
    const staleDir = path.join(webRoot, packageConfig.resourceName);
    if (existsSync(staleDir)) {
      throw new ReleaseError(
        `${entry.arch} app bundle still embeds ${packageConfig.resourceName}; on-demand releases must ship it as a GitHub release asset instead.`
      );
    }
  }

  const bundleManifestPath = path.join(webRoot, 'on-demand-resources.json');
  let bundleManifest;
  try {
    bundleManifest = JSON.parse(await readFile(bundleManifestPath, 'utf8'));
  } catch (error) {
    throw new ReleaseError(
      `${entry.arch} app bundle is missing the sealed on-demand manifest at ${bundleManifestPath}.\n${String(error?.message ?? error)}`
    );
  }
  if (bundleManifest.version !== version) {
    throw new ReleaseError(
      `${entry.arch} on-demand manifest records version ${bundleManifest.version}, expected ${version}.`
    );
  }

  const buildManifest = await readOnDemandBuildManifest(version);
  const uploads = [];
  for (const assetName of onDemandAssetNames) {
    const buildAsset = buildManifest.assets.find((asset) => asset.name === assetName);
    if (!buildAsset?.path || !existsSync(buildAsset.path)) {
      throw new ReleaseError(
        `On-demand asset tarball is missing for ${assetName} under ${onDemandAssetsDir(version)}.`
      );
    }
    const bundleAsset = Object.values(bundleManifest.assets ?? {}).find((asset) => asset?.name === assetName);
    if (!bundleAsset) {
      throw new ReleaseError(`${entry.arch} sealed on-demand manifest does not list ${assetName}.`);
    }
    if (!/^[0-9a-f]{64}$/.test(buildAsset.sha256 ?? '') || bundleAsset.sha256 !== buildAsset.sha256) {
      throw new ReleaseError(
        `On-demand asset checksum mismatch for ${assetName}: sealed ${bundleAsset.sha256} vs built ${buildAsset.sha256}.`
      );
    }
    const actualSha = await capture(`shasum -a 256 ${shellQuote(buildAsset.path)} | awk '{print $1}'`);
    if (actualSha !== buildAsset.sha256) {
      throw new ReleaseError(
        `On-demand asset file changed after manifest sealing for ${assetName}: manifest ${buildAsset.sha256}, file ${actualSha}.`
      );
    }
    uploads.push({ name: assetName, path: buildAsset.path, sha256: buildAsset.sha256 });
  }
  return uploads;
}

export async function uploadOnDemandAssets(version, onDemandAssets) {
  if (onDemandAssets.length === 0) {
    return;
  }
  logStep('Upload on-demand release assets');
  const assetPaths = onDemandAssets.map((asset) => shellQuote(asset.path)).join(' ');
  await run(
    `gh release upload ${shellQuote(`v${version}`)} ${assetPaths} --repo ${shellQuote(config.githubRepo)} --clobber`,
    { timeoutMs: releaseTimeouts.brewFetchMs }
  );
}

export async function onDemandAssetsFromReleaseAssets(assets) {
  const found = [];
  for (const assetName of onDemandAssetNames) {
    const asset = assets.find((entry) => entry.name === assetName);
    if (!asset) {
      return null;
    }
    const sha256 = parseGithubAssetSha(asset);
    found.push({ name: assetName, sha256 });
  }
  return found;
}

async function validateLidSleepHelperSigning(entry) {
  const helperName = `${entry.bundleId ?? config.bundleId}.LidSleepHelper`;
  const launchServicesHelper = path.join(entry.appPath, 'Contents/Library/LaunchServices', helperName);
  const resourcesHelper = path.join(entry.appPath, 'Contents/Resources', helperName);

  if (existsSync(resourcesHelper)) {
    throw new ReleaseError(
      `${entry.arch} still contains an unsigned Resources copy of ${helperName}. Release builds must ship only Contents/Library/LaunchServices/${helperName}.`
    );
  }
  if (!existsSync(launchServicesHelper)) {
    throw new ReleaseError(`${entry.arch} is missing bundled lid sleep helper: ${launchServicesHelper}`);
  }

  const signingDetails = await capture(`codesign -dv --verbose=4 ${shellQuote(launchServicesHelper)} 2>&1`);
  if (!/Developer ID Application:/.test(signingDetails)) {
    throw new ReleaseError(
      `${entry.arch} lid sleep helper is not Developer ID signed:\n${launchServicesHelper}\n${signingDetails}`
    );
  }
  if (!/Timestamp=/.test(signingDetails)) {
    throw new ReleaseError(`${entry.arch} lid sleep helper is missing a secure timestamp: ${launchServicesHelper}`);
  }
  if (!/flags=.*runtime/.test(signingDetails)) {
    throw new ReleaseError(`${entry.arch} lid sleep helper is missing hardened runtime: ${launchServicesHelper}`);
  }

  const entitlements = await capture(
    `codesign -d --entitlements :- ${shellQuote(launchServicesHelper)} 2>/dev/null | plutil -p - 2>/dev/null || true`
  );
  if (/get-task-allow/.test(entitlements)) {
    throw new ReleaseError(
      `${entry.arch} lid sleep helper still has get-task-allow and cannot be notarized: ${launchServicesHelper}`
    );
  }
}

async function buildGpuiArch(version, buildVersion, entry) {
  logStep('Build GPUI arm64 release app');
  /*
   The GPUI leg reuses the already-prepared
   remote Linux gxserver packages (prepare-remote-linux phase) and the Sparkle
   framework SwiftPM already downloaded for the macOS build, so it must run
   after both. GPUI still embeds the Linux packages in its bundle; the macOS
   app moved them to on-demand GitHub assets.
   */
  const env = {
    GHOSTEX_MACOS_ARCH: entry.arch,
    GHOSTEX_GPUI_SIGN_IDENTITY: gpuiReleaseSigningIdentity(),
    GHOSTEX_GPUI_SIGN_TIMESTAMP_FLAG: '--timestamp',
    GHOSTEX_GPUI_MARKETING_VERSION: version,
    GHOSTEX_GPUI_BUILD_VERSION: String(buildVersion),
    GHOSTEX_GPUI_SPARKLE_FEED_URL: entry.feedUrl,
    GHOSTEX_REQUIRE_REMOTE_GXSERVER_LINUX_PACKAGES: '1',
    GHOSTEX_REQUIRE_SPARKLE: '1',
  };
  await runWithHeartbeat('/bin/bash apps/desktop/scripts/build-macos-app.sh', {
    label: 'GPUI app build',
    env,
    timeoutMs: releaseTimeouts.buildArchMs,
  });
  const appPath = path.join(repoRoot, 'apps', 'desktop', 'build', 'macos.noindex', `${config.gpuiAppName}.app`);
  if (!existsSync(appPath)) {
    throw new ReleaseError(`GPUI build did not produce an app bundle at ${appPath}`);
  }
  return { ...entry, appPath };
}

async function validateGpuiBuiltApp(version, buildVersion, entry) {
  logStep('Validate built GPUI app');
  const infoPlist = path.join(entry.appPath, 'Contents/Info.plist');
  await run(
    `plutil -p ${shellQuote(infoPlist)} | rg 'CFBundleShortVersionString|CFBundleVersion|CFBundleIdentifier|SUFeedURL|SUPublicEDKey|GHOSTEX'`
  );
  await run(
    `codesign -dv --verbose=4 ${shellQuote(entry.appPath)} 2>&1 | rg 'Authority|TeamIdentifier|Identifier|Timestamp|Runtime|Format'`
  );
  await run(`codesign --verify --deep --strict --verbose=2 ${shellQuote(entry.appPath)}`);
  await run(
    `lipo -archs ${shellQuote(path.join(entry.appPath, 'Contents/MacOS', entry.appName))} | grep -Fx ${shellQuote(entry.arch)}`
  );
  // The cef-rs CEF distribution can be single-arch or universal; require the
  // release arch to be present without forbidding a fat framework.
  await run(
    `lipo -archs ${shellQuote(path.join(entry.appPath, 'Contents/Frameworks/Chromium Embedded Framework.framework/Chromium Embedded Framework'))} | grep -w ${shellQuote(entry.arch)}`
  );
  if (!existsSync(path.join(entry.appPath, 'Contents/Frameworks/Sparkle.framework'))) {
    throw new ReleaseError('GPUI release app is missing Sparkle.framework; auto-update would be dead.');
  }

  const info = await capture(`plutil -extract CFBundleShortVersionString raw ${shellQuote(infoPlist)}`);
  const bundleVersion = await capture(`plutil -extract CFBundleVersion raw ${shellQuote(infoPlist)}`);
  const bundleId = await capture(`plutil -extract CFBundleIdentifier raw ${shellQuote(infoPlist)}`);
  const feedUrl = await capture(`plutil -extract SUFeedURL raw ${shellQuote(infoPlist)}`);
  const publicKey = await capture(`plutil -extract SUPublicEDKey raw ${shellQuote(infoPlist)}`);
  if (info !== version || bundleVersion !== String(buildVersion)) {
    throw new ReleaseError(`GPUI Info.plist version mismatch: ${info} (${bundleVersion})`);
  }
  if (bundleId !== config.gpuiBundleId) {
    throw new ReleaseError(`GPUI bundle identifier mismatch: ${bundleId}`);
  }
  if (feedUrl !== entry.feedUrl) {
    throw new ReleaseError(`GPUI SUFeedURL mismatch: ${feedUrl}`);
  }
  if (publicKey !== config.sparklePublicKey) {
    throw new ReleaseError('GPUI SUPublicEDKey mismatch.');
  }

  await validateLidSleepHelperSigning(entry);
}

async function packageReleaseDmg(version, artifactDir, entry) {
  logStep(`Package ${entry.kind === 'gpui' ? 'GPUI ' : ''}${entry.arch} DMG`);
  const stagingRoot = path.join(tmpdir(), 'ghostex-release-staging.noindex');
  await mkdir(stagingRoot, { recursive: true });
  const stagingDir = await mkdtemp(
    path.join(stagingRoot, `ghostex-${version}-${entry.kind ?? 'macos'}-${entry.arch}-stage-`)
  );
  const finalDmg = path.join(artifactDir, entry.dmgName ?? `ghostex-${version}-${entry.arch}.dmg`);
  const stagedApp = path.join(stagingDir, entry.stagedAppName ?? config.stagedAppName);

  /*
   CDXC:Release 2026-06-17-09:54:
   Release DMG staging copies the signed app bundle after code-server and nested
   native payloads have been materialized. Use ditto for the bundle copy so a
   transient filesystem entry under a large packaged runtime cannot make cp -R
   abort after validation has already passed.
   */
  await run(`ditto ${shellQuote(entry.appPath)} ${shellQuote(stagedApp)}`);
  await run(`ln -s /Applications ${shellQuote(path.join(stagingDir, 'Applications'))}`);
  await run(
    `hdiutil create -volname ${shellQuote(entry.volumeName ?? 'ghostex')} -srcfolder ${shellQuote(stagingDir)} -format UDZO ${shellQuote(finalDmg)}`
  );
  const preStapleSha = await capture(`shasum -a 256 ${shellQuote(finalDmg)} | awk '{print $1}'`);
  await rm(stagingDir, { recursive: true, force: true });

  return {
    ...entry,
    finalDmg,
    preStapleSha,
  };
}

async function notarizeReleaseDmg(version, artifactDir, entry) {
  logStep(`Notarize ${entry.arch}`);
  const notaryLogPath = path.join(artifactDir, `ghostex-${version}-${entry.arch}-notary.log`);
  const notaryOutput = await runWithHeartbeat(
    `xcrun notarytool submit ${shellQuote(entry.finalDmg)} --keychain-profile ${shellQuote(config.notaryProfile)} --wait | tee ${shellQuote(notaryLogPath)}`,
    {
      label: `${entry.arch} notarization`,
      timeoutMs: releaseTimeouts.notaryArchMs,
    }
  );
  const submissionId = notaryOutput.match(/id:\s*([0-9a-f-]+)/)?.[1] ?? 'unknown';
  /*
   CDXC:Release 2026-05-23-13:58:
   `notarytool --wait` prints repeated `Current status: In Progress` lines
   before the final `status: Accepted`; parse the last status-like token so
   accepted submissions are not rejected after a long notarization wait.
   */
  const statusMatches = [...notaryOutput.matchAll(/(?:Current status:|status:)\s*([A-Za-z ]+)/g)];
  const status = statusMatches.at(-1)?.[1]?.trim() ?? 'unknown';
  if (status !== 'Accepted') {
    throw new ReleaseError(`${entry.arch} notarization did not finish Accepted. Status: ${status}`);
  }

  await run(`xcrun stapler staple ${shellQuote(entry.finalDmg)}`);
  await run(`xcrun stapler validate ${shellQuote(entry.finalDmg)}`);
  const sha256 = await capture(`shasum -a 256 ${shellQuote(entry.finalDmg)} | awk '{print $1}'`);
  const artifactKey = entry.kind === 'gpui' ? `gpui-${entry.arch}` : entry.arch;
  await writeFile(`/tmp/ghostex-${version.replaceAll('.', '')}-${artifactKey}-sha256`, `${sha256}\n`);
  await writeFile(`/tmp/ghostex-${version.replaceAll('.', '')}-${artifactKey}-final-dmg`, `${entry.finalDmg}\n`);

  return {
    ...entry,
    sha256,
    notaryLogPath,
    notarySubmissionId: submissionId,
    notaryStatus: status,
  };
}

async function validateMountedDmg(version, buildVersion, entry) {
  logStep(`Validate mounted ${entry.arch} DMG`);
  const mountRoot = path.join(tmpdir(), 'ghostex-dmg-mounts.noindex');
  await mkdir(mountRoot, { recursive: true });
  const mountPoint = await mkdtemp(path.join(mountRoot, `validate-${version}-${entry.arch}-`));
  await capture(
    `hdiutil attach -nobrowse -readonly -mountpoint ${shellQuote(mountPoint)} ${shellQuote(entry.finalDmg)}`
  );

  try {
    const appPath = path.join(mountPoint, entry.stagedAppName ?? config.stagedAppName);
    try {
      await run(`spctl --assess --type execute --verbose ${shellQuote(appPath)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Too many open files')) {
        throw error;
      }
      /*
       CDXC:Release 2026-06-12-12:35:
       Apple's spctl can fail with "Too many open files" while walking the
       mounted Ghostex app bundle even after notarytool accepts the DMG and
       stapler validates its ticket. Treat only that descriptor-exhaustion case
       as an assessment tool limitation, revalidate the stapled DMG ticket, and
       continue into the mounted app's codesign, architecture, and version
       checks so distribution validation still proves the shipped artifact.
      */
      console.warn(
        `Warning: spctl could not assess mounted ${entry.arch} app because it exhausted open files; validating the stapled DMG ticket and mounted app signature instead.`
      );
      await run(`xcrun stapler validate ${shellQuote(entry.finalDmg)}`);
    }
    await run(`codesign --verify --deep --strict --verbose=2 ${shellQuote(appPath)}`);
    await run(
      `lipo -archs ${shellQuote(path.join(appPath, 'Contents/MacOS', entry.appName ?? config.appName))} | grep -Fx ${shellQuote(entry.arch)}`
    );
    await run(
      `plutil -p ${shellQuote(path.join(appPath, 'Contents/Info.plist'))} | rg 'CFBundleShortVersionString|CFBundleVersion|CFBundleIdentifier|SUFeedURL|SUPublicEDKey'`
    );
    const shortVersion = await capture(
      `plutil -extract CFBundleShortVersionString raw ${shellQuote(path.join(appPath, 'Contents/Info.plist'))}`
    );
    const bundleVersion = await capture(
      `plutil -extract CFBundleVersion raw ${shellQuote(path.join(appPath, 'Contents/Info.plist'))}`
    );
    if (shortVersion !== version || bundleVersion !== String(buildVersion)) {
      throw new ReleaseError(`Mounted ${entry.arch} app version mismatch: ${shortVersion} (${bundleVersion})`);
    }
  } finally {
    await run(`hdiutil detach ${shellQuote(mountPoint)}`);
    await rm(mountPoint, { recursive: true, force: true });
  }
}

export async function buildAndPackage(version, buildVersion, options = {}) {
  logStep('Build arm64 release app');
  /*
   CDXC:Release 2026-06-10-09:47:
   Release automation intentionally builds only the Apple Silicon app. Do not
   add Intel release legs back here; old Intel artifacts remain available from
   their existing GitHub releases. The historical appcast-x86_64.xml feed that
   tracked them was retired on 2026-08-23.
   */
  const built = [];
  for (const entry of releaseArchitectures) {
    built.push(await buildArch(version, entry));
  }

  let onDemandAssets = [];
  for (const entry of built) {
    onDemandAssets = await validateBuiltApp(version, buildVersion, entry);
  }

  /*
   The optional GPUI leg builds after the
   macOS app because its Sparkle framework staging reuses the SwiftPM
   artifacts the macOS Xcode build downloads. GPUI artifacts stay in a
   separate array so arch-keyed macOS consumers (Homebrew, resume, notes
   arm-lookup) never accidentally select the GPUI DMG.
   */
  const gpuiBuilt = [];
  if (options.gpui) {
    const gpuiEntry = await buildGpuiArch(version, buildVersion, gpuiReleaseEntry(version));
    await validateGpuiBuiltApp(version, buildVersion, gpuiEntry);
    gpuiBuilt.push(gpuiEntry);
  }

  const artifactDir = await mkdtemp(path.join(tmpdir(), `ghostex-${version}-release-`));
  console.log(`Artifact directory: ${artifactDir}`);

  /*
   CDXC:Release 2026-06-10-09:47:
   The public macOS release artifact set contains one arm64 DMG. Keep the same
   signing, packaging, notarization, stapling, and mounted-DMG validation steps
   for that artifact so Apple Silicon update safety stays unchanged.
   */
  logStep('Package arm64 DMG');
  const packagedDmgs = [];
  for (const entry of built) {
    packagedDmgs.push(await packageReleaseDmg(version, artifactDir, entry));
  }
  const packagedGpuiDmgs = [];
  for (const entry of gpuiBuilt) {
    packagedGpuiDmgs.push(await packageReleaseDmg(version, artifactDir, entry));
  }

  logStep('Notarize arm64 DMG');
  const packaged = await Promise.all(packagedDmgs.map((entry) => notarizeReleaseDmg(version, artifactDir, entry)));
  const packagedGpui = await Promise.all(
    packagedGpuiDmgs.map((entry) => notarizeReleaseDmg(version, artifactDir, entry))
  );

  for (const entry of [...packaged, ...packagedGpui]) {
    await validateMountedDmg(version, buildVersion, entry);
  }

  return { artifactDir, artifacts: packaged, gpuiArtifacts: packagedGpui, onDemandAssets };
}

async function findAndroidBuildTool(tool) {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.HOME ?? '', 'Library/Android/sdk'),
    '/opt/homebrew/share/android-commandlinetools',
  ].filter(Boolean);
  const existingRoots = [...new Set(roots)].filter((root) => existsSync(root));
  const output =
    existingRoots.length === 0
      ? ''
      : await capture(
          `find ${existingRoots.map(shellQuote).join(' ')} -path '*/build-tools/*/${tool}' -print 2>/dev/null`
        );
  const toolPath = selectLatestAndroidBuildTool(output.split(/\r?\n/), tool);
  if (!toolPath) {
    throw new ReleaseError(`Could not find Android build tool: ${tool}`);
  }
  return toolPath;
}

export function selectLatestAndroidBuildTool(paths, tool) {
  const matches = paths
    .map((entry) => entry.trim())
    .filter((entry) => entry.endsWith(`/build-tools/${androidBuildToolVersion(entry, tool)}/${tool}`));
  matches.sort((left, right) => {
    const leftVersion = androidBuildToolVersion(left, tool);
    const rightVersion = androidBuildToolVersion(right, tool);
    return (
      leftVersion.localeCompare(rightVersion, undefined, { numeric: true, sensitivity: 'base' }) ||
      left.localeCompare(right)
    );
  });
  return matches.at(-1) ?? '';
}

function androidBuildToolVersion(toolPath, tool) {
  const marker = '/build-tools/';
  const markerIndex = toolPath.lastIndexOf(marker);
  if (markerIndex === -1 || !toolPath.endsWith(`/${tool}`)) {
    return '';
  }
  const versionStart = markerIndex + marker.length;
  const versionEnd = toolPath.indexOf('/', versionStart);
  return versionEnd === -1 ? '' : toolPath.slice(versionStart, versionEnd);
}

export async function buildAndUploadAndroidRelease(version, buildVersion) {
  logStep('Build and upload React Native Android APK');
  const script = [
    'set -euo pipefail',
    'set -a',
    `source ${shellQuote(config.androidSigningEnvFile)}`,
    'set +a',
    `cd ${shellQuote(path.join(repoRoot, 'apps', 'mobile', 'app'))}`,
    'bun install --frozen-lockfile',
    `cd ${shellQuote(repoRoot)}`,
    `tooling/release-gpui/android.sh ${shellQuote(version)}`,
  ].join('\n');
  await run(`/bin/zsh -lc ${shellQuote(script)}`, { timeoutMs: releaseTimeouts.androidMs });

  const apk = path.join(repoRoot, 'build/release-gpui', version, 'android', config.androidApkAssetName);
  if (!existsSync(apk)) {
    throw new ReleaseError(`React Native Android release APK was not produced: ${apk}`);
  }
  const apksigner = await findAndroidBuildTool('apksigner');
  const aapt = await findAndroidBuildTool('aapt');
  await run(
    `/bin/bash -lc ${shellQuote(`set -o pipefail; ${shellQuote(apksigner)} verify --verbose --print-certs ${shellQuote(apk)} | sed -n '1,80p'`)}`
  );
  await run(
    `${shellQuote(aapt)} dump badging ${shellQuote(apk)} | rg ${shellQuote(`package: name='io.ghostex' versionCode='${buildVersion}' versionName='${version}'`)}`
  );
  const sha256 = await capture(`shasum -a 256 ${shellQuote(apk)} | awk '{print $1}'`);
  const stableApk = path.join(tmpdir(), config.androidApkAssetName);
  /*
   * CDXC:Release 2026-06-14-09:07:
   * GitHub CLI upload labels were not reliable for the Android APK asset name
   * during the 4.12.0 release. Copy the signed universal APK to the stable
   * filename first, then upload that file directly so the public URL remains
   * ghostex-android.apk across releases.
   */
  await run(`cp ${shellQuote(apk)} ${shellQuote(stableApk)}`);
  await run(
    `gh release upload ${shellQuote(`v${version}`)} ${shellQuote(stableApk)} --repo ${shellQuote(config.githubRepo)} --clobber`,
    { timeoutMs: releaseTimeouts.brewFetchMs }
  );
  return {
    name: config.androidApkAssetName,
    path: stableApk,
    sha256,
  };
}
