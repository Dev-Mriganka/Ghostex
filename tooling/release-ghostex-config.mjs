import { existsSync } from 'node:fs';
import path from 'node:path';

export const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

export const config = {
  githubRepo: 'maddada/Ghostex',
  tapRepo: 'https://github.com/maddada/homebrew-tap.git',
  caskPath: 'Casks/ghostex.rb',
  caskName: 'ghostex',
  appName: 'Ghostex',
  stagedAppName: 'ghostex.app',
  bundleId: 'com.madda.ghostex.host',
  signingIdentity: 'Developer ID Application: Mohamad Youssef (KTKP595G3B)',
  teamId: 'KTKP595G3B',
  notaryProfile: 'notarytool-profile',
  sparklePublicKey: 'AGWDPeMqfhmbjt8Pbk+VTC9fDfXAYq+cZoLGCYuGn70=',
  armFeed: 'appcast.xml',
  /*
   The GPUI app releases as a separate
   product (own bundle id, DMG asset, and Sparkle feed) behind the opt-in
   --gpui flag, riding the same version/tag as the macOS app. It signs with
   the same Developer ID certificate (user decision 2026-07-03) and the same
   Sparkle EdDSA key; GHOSTEX_GPUI_SIGN_IDENTITY overrides the identity.
   */
  gpuiAppName: 'Ghostex',
  gpuiStagedAppName: 'Ghostex.app',
  gpuiBundleId: 'com.madda.ghostex.gpui',
  gpuiFeed: 'appcast-gpui.xml',
  installCommand: 'brew install --cask maddada/tap/ghostex',
  androidSigningEnvFile: '/Users/madda/.config/ghostex/android/release-signing.env',
  androidApkAssetName: 'ghostex-android.apk',
};

/*
 CDXC:Release 2026-05-29-19:12:
 Public releases can spend many minutes in Xcode builds and Apple notarization.
 Use explicit step timeouts and heartbeat logs so release operators see progress
 instead of waiting on a silent shell for twenty-plus minutes.
 */
export const releaseTimeouts = {
  typecheckMs: 8 * 60 * 1000,
  testMs: 12 * 60 * 1000,
  buildArchMs: 50 * 60 * 1000,
  notaryArchMs: 45 * 60 * 1000,
  brewFetchMs: 15 * 60 * 1000,
  androidMs: 45 * 60 * 1000,
  overallMs: 150 * 60 * 1000,
  heartbeatMs: 60 * 1000,
};

/*
 CDXC:Release 2026-06-10-09:47:
 Future Ghostex macOS releases are Apple Silicon only. Keep the arm64 build,
 signing, notarization, Sparkle, GitHub, and Homebrew path intact, but stop
 generating new Intel DMGs or appcast entries. Existing v4.1.0 and older Intel
 tags, GitHub assets, appcast history, and Homebrew git history must remain
 untouched.
 */
export const releaseArchitectures = [
  {
    arch: 'arm64',
    brewArch: 'arm',
    feed: config.armFeed,
    feedUrl: 'https://raw.githubusercontent.com/maddada/Ghostex/main/appcast.xml',
  },
];

export function gpuiReleaseEntry(version) {
  return {
    arch: 'arm64',
    kind: 'gpui',
    appName: config.gpuiAppName,
    stagedAppName: config.gpuiStagedAppName,
    bundleId: config.gpuiBundleId,
    dmgName: `ghostex-gpui-${version}-arm64.dmg`,
    volumeName: 'ghostex-gpui',
    releaseNotesTitle: 'Ghostex',
    feed: config.gpuiFeed,
    feedUrl: `https://raw.githubusercontent.com/${config.githubRepo}/main/${config.gpuiFeed}`,
  };
}

/*
 CDXC:RemotePairing 2026-06-29-19:45:
 Public Ghostex releases must bundle first-run server packages for Ubuntu
 x64 and arm64. Validate the deterministic Linux CI outputs before mutating
 release metadata and force native app packaging to stage both resources so the
 remote installer cannot silently ship without Ubuntu x64 support.
 */
export const remoteGxserverLinuxPackageConfigs = [
  {
    arch: 'x64',
    defaultPackageDir: path.join(repoRoot, 'build', 'remote-gxserver-linux', 'x64', 'package'),
    packageLabel: 'LINUX_X64',
    resourceName: 'gxserver-linux-x64',
  },
  {
    arch: 'arm64',
    defaultPackageDir: path.join(repoRoot, 'build', 'remote-gxserver-linux', 'arm64', 'package'),
    packageLabel: 'LINUX_ARM64',
    resourceName: 'gxserver-linux-arm64',
  },
];

/*
 CDXC:RemotePairing 2026-07-13:
 The Linux remote package no longer ships portless (macOS launchd-only), the
 npm-style package.json manifest, or dist/protocol exports; nothing on the
 remote host consumes them and version identity lives in build-identity.json.
 */
const remoteGxserverLinuxRequiredPackageResources = ['bin/gxserver', 'bin/zmx', 'bin/ghostex', 'build-identity.json'];

/*
 CDXC:Release 2026-07-02-14:10:
 Public releases stop embedding the two Ubuntu remote gxserver payloads inside
 the DMG. The app build stages a sealed checksum manifest instead, and the
 release publishes the two tarballs as version-pinned GitHub release assets the
 app downloads on first use. Remote installs keep the Mac-then-scp flow.
 */
export const onDemandAssetNames = ['gxserver-linux-x64.tar.gz', 'gxserver-linux-arm64.tar.gz'];

/*
 CDXC:Release 2026-07-02-14:10:
 The release runs as named, individually resumable phases. Each phase records
 its outputs and duration in build/release-state/v<version>.json so a failed
 release can continue with --from <phase> instead of improvised recovery, and
 so every run ends with a phase timing table.
 */
export const releasePhaseNames = [
  'preflight',
  'prepare-remote-linux',
  'publish-macos',
  'publish-android',
  'publish-homebrew',
  'verify-live',
];

export class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseError';
  }
}

export function usage() {
  return `
Usage:
  bun run release:local -- <version> [options]
  node tooling/release-ghostex.mjs <version> [options]

Options:
  --with-tests        Run release-safe Vitest checks before building.
  --skip-typecheck   Skip bun run typecheck.
  --skip-brew-fetch  Skip final brew fetch checks.
  --skip-sparkle     Do not update or validate Sparkle appcasts.
  --skip-android     Do not build/upload the signed Android APK.
  --gpui             Retired 2026-08-23: fails fast with a ReleaseError. Used to
                     also build, sign, notarize, and publish the GPUI app
                     (ghostex-gpui-<version>-arm64.dmg + appcast-gpui.xml) on the
                     same version/tag. The current pipeline is tooling/release-gpui.
  --resume [version] Resume an already-created release and finish missing Homebrew/Android/notes steps.
  --from <phase>     Resume from a phase using build/release-state/v<version>.json.
                     Phases: preflight, prepare-remote-linux, publish-macos,
                     publish-android, publish-homebrew, verify-live.
  --only <phase>     Run a single phase, trusting recorded state for the rest.
  --github-prerelease
                     Mark the GitHub release as a prerelease.
  --release-branch <branch>
                     Branch that receives the release commit. Defaults to main.
  --no-push          Commit release metadata but do not push, tag, publish GitHub, or update Homebrew.
  --no-terminal-delegate
                     Fail instead of handing off to Terminal.app when the agent shell cannot see signing/notary credentials.
  --help             Show this help.

Expected state:
  Run this only after the agent/user has split-committed feature changes,
  updated CHANGELOG.md (and any local product notes you keep outside the repo), and pushed the release branch.

Timeouts and progress:
  Build steps log heartbeat updates about every minute.
  arm64 build timeout: 50 minutes.
  arm64 notarization timeout: 45 minutes.
  Overall release timeout: 150 minutes.
`;
}

/*
CDXC:Release 2026-08-09:
Product and review documentation is local-only under docs/ (gitignored) and is
no longer a release-branch requirement. CHANGELOG.md remains the tracked release
notes surface in the public repository.
*/

/*
CDXC:Release 2026-06-05-22:26:
Nightly beta releases must be installable from GitHub Releases and Homebrew without
advancing the Sparkle feeds that production users poll for automatic updates.
Keep beta controls explicit so the public release path still updates appcasts by
default while prerelease tags can target nightly and skip Sparkle entirely.
*/
export function parseArgs(argv) {
  const options = {
    withTests: false,
    skipTypecheck: false,
    skipBrewFetch: false,
    skipSparkle: false,
    skipAndroid: false,
    gpui: false,
    resume: false,
    fromPhase: null,
    onlyPhase: null,
    githubPrerelease: false,
    releaseBranch: 'main',
    noPush: false,
    noTerminalDelegate: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--with-tests') {
      options.withTests = true;
    } else if (arg === '--skip-typecheck') {
      options.skipTypecheck = true;
    } else if (arg === '--skip-brew-fetch') {
      options.skipBrewFetch = true;
    } else if (arg === '--skip-sparkle') {
      options.skipSparkle = true;
    } else if (arg === '--skip-android') {
      options.skipAndroid = true;
    } else if (arg === '--gpui') {
      options.gpui = true;
    } else if (arg === '--resume') {
      options.resume = true;
      const maybeVersion = argv[index + 1]?.trim();
      if (maybeVersion && !maybeVersion.startsWith('-')) {
        positional.push(maybeVersion);
        index += 1;
      }
    } else if (arg === '--from' || arg === '--only') {
      const phase = argv[index + 1]?.trim();
      if (!phase || !releasePhaseNames.includes(phase)) {
        throw new ReleaseError(`${arg} requires one of: ${releasePhaseNames.join(', ')}`);
      }
      if (arg === '--from') {
        options.fromPhase = phase;
      } else {
        options.onlyPhase = phase;
      }
      index += 1;
    } else if (arg === '--github-prerelease') {
      options.githubPrerelease = true;
    } else if (arg === '--release-branch') {
      const branch = argv[index + 1]?.trim();
      if (!branch || branch.startsWith('-')) {
        throw new ReleaseError('--release-branch requires a branch name.');
      }
      options.releaseBranch = branch;
      index += 1;
    } else if (arg === '--no-push') {
      options.noPush = true;
    } else if (arg === '--no-terminal-delegate') {
      options.noTerminalDelegate = true;
    } else if (arg.startsWith('-')) {
      throw new ReleaseError(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (options.help) {
    return { ...options, version: null };
  }

  if (positional.length !== 1) {
    throw new ReleaseError('Pass exactly one version, for example 3.9.2.');
  }

  const version = positional[0];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new ReleaseError(`Version must be semver-like x.y.z or x.y.z-prerelease. Received: ${version}`);
  }

  return { ...options, version };
}

export function releaseBuildVersion(version) {
  const [major, minor, patch] = version
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  return major * 10000 + minor * 100 + patch;
}

export function isPrereleaseVersion(version) {
  return version.includes('-');
}

export function missingRemoteGxserverLinuxPackageResources(packageDir, exists = existsSync) {
  return remoteGxserverLinuxRequiredPackageResources.filter((relativePath) => {
    return !exists(path.join(packageDir, relativePath));
  });
}

function timestampForComment(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function appleScriptString(value) {
  return `"${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
