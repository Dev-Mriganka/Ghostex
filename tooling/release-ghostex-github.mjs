import { lookup } from 'node:dns/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, capture } from './release-ghostex-process.mjs';
import {
  config,
  releaseTimeouts,
  releaseArchitectures,
  gpuiReleaseEntry,
  ReleaseError,
  shellQuote,
} from './release-ghostex-config.mjs';

function isGitNetworkResolutionError(error) {
  const message = String(error?.message ?? error);
  return /Could not resolve host|unable to access/i.test(message);
}

export function isHomebrewHostToolchainVersionError(error) {
  const message = String(error?.message ?? error);
  return /Your Xcode .*too outdated/i.test(message) || /Your Command Line Tools are too outdated/i.test(message);
}

export async function runOptionalHomebrewHostValidation(command, options = {}) {
  /*
   * CDXC:Release 2026-06-16-20:32:
   * Homebrew can reject local audit/style/fetch commands on macOS beta hosts
   * when Xcode/CLT lags Homebrew's newest minimum, even though the Ghostex cask
   * can still be rendered, syntax-checked, pushed, and validated from the tap.
   * Treat only that host-toolchain diagnostic as a skippable local validation
   * gap; cask syntax, canonical cask validation, git push, GitHub assets, and
   * raw live-cask validation remain mandatory.
   *
   * CDXC:Release 2026-06-16-20:39:
   * Homebrew host-toolchain diagnostics are written to child stderr. Capture
   * optional Homebrew validation output so the classifier can distinguish that
   * local host issue from real cask failures before rethrowing.
   */
  try {
    const result = await run(command, { ...options, stdio: 'pipe' });
    if (result.stdout.trim()) {
      console.log(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    return true;
  } catch (error) {
    if (!isHomebrewHostToolchainVersionError(error)) {
      throw error;
    }
    console.warn(
      [
        "Warning: skipping local Homebrew validation because this host's Xcode/CLT is below Homebrew's current minimum.",
        `Skipped: ${command}`,
      ].join('\n')
    );
    return false;
  }
}

async function readGitHubHttpsCredentials() {
  const creds = await capture("printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill");
  const username = creds.match(/^username=(.+)$/m)?.[1];
  const password = creds.match(/^password=(.+)$/m)?.[1];
  if (!username || !password) {
    throw new ReleaseError('Could not read GitHub HTTPS credentials for git network commands.');
  }
  return { username, password };
}

/**
 * CDXC:Release 2026-05-23-12:55:
 * Some release environments resolve github.com for curl but not for git's libcurl.
 * Retry origin fetch/push/ls-remote through a Host-header HTTPS URL when DNS fails.
 */
async function resolveGitHubAddress() {
  try {
    return (await lookup('github.com', { family: 4 })).address;
  } catch {
    const output = await capture("nslookup github.com 2>/dev/null | awk '/^Address: / { print $2; exit }'");
    if (!output) {
      throw new ReleaseError('Could not resolve github.com for git network commands.');
    }
    return output;
  }
}

async function githubHttpsRemoteUrl(repoPath = config.githubRepo) {
  const { username, password } = await readGitHubHttpsCredentials();
  const address = await resolveGitHubAddress();
  return `https://${username}:${encodeURIComponent(password)}@${address}/${repoPath}.git`;
}

export async function runGitNetwork(command, options = {}) {
  try {
    await run(command, options);
    return;
  } catch (error) {
    if (!isGitNetworkResolutionError(error)) {
      throw error;
    }
  }

  const remoteUrl = await githubHttpsRemoteUrl();
  const translated = command.replace(/\borigin\b/g, shellQuote(remoteUrl));
  await run(
    `git -c http.sslVerify=false -c http.extraHeader=${shellQuote('Host: github.com')} ${translated.replace(/^git\s+/, '')}`,
    options
  );
}

async function ensureGhAuth() {
  const { password } = await readGitHubHttpsCredentials();
  if (!process.env.GH_TOKEN) {
    process.env.GH_TOKEN = password;
  }
  if (!process.env.GITHUB_TOKEN) {
    process.env.GITHUB_TOKEN = password;
  }
}

/**
 * CDXC:Release 2026-05-23-13:25:
 * Agent shells often inject stale GH_TOKEN values. Prefer the user's real gh
 * login-session auth before falling back to git credential fill for git push.
 */
export async function ensureGhAuthForRelease() {
  try {
    await run('env -u GH_TOKEN -u GITHUB_TOKEN gh auth status -h github.com');
    return;
  } catch {
    await run('env -u GH_TOKEN -u GITHUB_TOKEN gh auth setup-git -h github.com || true');
  }
  await ensureGhAuth();
}

export async function ensureCleanWorktree() {
  const status = await capture('git status --porcelain --untracked-files=all');
  if (status) {
    throw new ReleaseError(
      ['Working tree is not clean. Commit the agent/user changes before running the release script.', '', status].join(
        '\n'
      )
    );
  }
}

export async function ensureReleaseBranchSynced(releaseBranch) {
  const branch = await capture('git branch --show-current');
  const head = await capture('git rev-parse HEAD');
  await runGitNetwork(`git fetch origin ${shellQuote(releaseBranch)} --tags`);
  const originBranch = await capture(`git rev-parse ${shellQuote(`origin/${releaseBranch}`)}`);
  try {
    await run(`git merge-base --is-ancestor ${shellQuote(originBranch)} ${shellQuote(head)}`);
    if (head === originBranch) {
      console.log(`Local HEAD matches origin/${releaseBranch}.`);
    } else {
      console.log(`Local HEAD is ahead of origin/${releaseBranch}; continuing.`);
    }
    return;
  } catch {
    throw new ReleaseError(
      `Current HEAD on ${branch || '(detached HEAD)'} must include origin/${releaseBranch} before the script creates the release commit.`
    );
  }
}

async function captureGitNetwork(command, options = {}) {
  try {
    return await capture(command, options);
  } catch (error) {
    if (!isGitNetworkResolutionError(error)) {
      throw error;
    }
    const remoteUrl = await githubHttpsRemoteUrl();
    const translated = command.replace(/\borigin\b/g, shellQuote(remoteUrl));
    return await capture(
      `git -c http.sslVerify=false -c http.extraHeader=${shellQuote('Host: github.com')} ${translated.replace(/^git\s+/, '')}`,
      options
    );
  }
}

export async function ensureTagMissing(version) {
  const localTag = await capture(`git tag --list ${shellQuote(`v${version}`)}`);
  const remoteTag = await captureGitNetwork(`git ls-remote --tags origin ${shellQuote(`v${version}*`)}`);
  if (localTag || remoteTag) {
    throw new ReleaseError(`Tag v${version} already exists locally or remotely.`);
  }
}

export async function ensureReleaseMissing(version) {
  const command = `gh release view ${shellQuote(`v${version}`)} --repo ${shellQuote(config.githubRepo)}`;
  try {
    await capture(command);
  } catch {
    return;
  }
  throw new ReleaseError(`GitHub release v${version} already exists.`);
}

export async function ensureReleaseExists(version) {
  const command = `gh release view ${shellQuote(`v${version}`)} --repo ${shellQuote(config.githubRepo)}`;
  try {
    await capture(command);
  } catch {
    throw new ReleaseError(`GitHub release v${version} does not exist; cannot resume release repair.`);
  }
}

export async function ensureTagExists(version) {
  const localTag = await capture(`git tag --list ${shellQuote(`v${version}`)}`);
  const remoteTag = await captureGitNetwork(`git ls-remote --tags origin ${shellQuote(`refs/tags/v${version}`)}`);
  if (!localTag && !remoteTag) {
    throw new ReleaseError(`Tag v${version} does not exist locally or remotely; cannot resume release repair.`);
  }
}

export async function readGithubRelease(version) {
  const json = await capture(
    `gh release view ${shellQuote(`v${version}`)} --repo ${shellQuote(config.githubRepo)} --json tagName,name,url,isDraft,isPrerelease,assets`
  );
  return JSON.parse(json);
}

export function parseGithubAssetSha(asset) {
  const digest = asset?.digest;
  if (typeof digest === 'string' && digest.startsWith('sha256:')) {
    return digest.slice('sha256:'.length);
  }
  return null;
}

export async function githubReleaseArtifactFromAssets(version, assets) {
  const assetName = `ghostex-${version}-arm64.dmg`;
  const asset = assets.find((entry) => entry.name === assetName);
  if (!asset) {
    throw new ReleaseError(`GitHub release v${version} is missing ${assetName}.`);
  }
  let sha256 = parseGithubAssetSha(asset);
  if (!sha256) {
    const downloadPath = path.join(tmpdir(), assetName);
    await run(`curl -fsSL ${shellQuote(asset.url)} -o ${shellQuote(downloadPath)}`, {
      timeoutMs: releaseTimeouts.brewFetchMs,
    });
    sha256 = await capture(`shasum -a 256 ${shellQuote(downloadPath)} | awk '{print $1}'`);
  }
  return {
    ...releaseArchitectures[0],
    finalDmg: assetName,
    sha256,
  };
}

export async function gpuiArtifactFromAssets(version, assets) {
  const assetName = `ghostex-gpui-${version}-arm64.dmg`;
  const asset = assets.find((entry) => entry.name === assetName);
  if (!asset) {
    return null;
  }
  const sha256 = parseGithubAssetSha(asset);
  return sha256
    ? {
        ...gpuiReleaseEntry(version),
        finalDmg: assetName,
        sha256,
      }
    : null;
}

export async function androidArtifactFromAssets(assets) {
  const asset = assets.find((entry) => entry.name === config.androidApkAssetName);
  if (!asset) {
    return null;
  }
  let sha256 = parseGithubAssetSha(asset);
  if (!sha256 && asset.url) {
    const downloadPath = path.join(tmpdir(), config.androidApkAssetName);
    await run(`curl -fsSL ${shellQuote(asset.url)} -o ${shellQuote(downloadPath)}`, {
      timeoutMs: releaseTimeouts.brewFetchMs,
    });
    sha256 = await capture(`shasum -a 256 ${shellQuote(downloadPath)} | awk '{print $1}'`);
  }
  return sha256
    ? {
        name: config.androidApkAssetName,
        sha256,
      }
    : null;
}
