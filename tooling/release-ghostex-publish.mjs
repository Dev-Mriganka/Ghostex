import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { logStep, run, capture } from './release-ghostex-process.mjs';
import {
  repoRoot,
  config,
  releaseTimeouts,
  releaseArchitectures,
  onDemandAssetNames,
  ReleaseError,
  isPrereleaseVersion,
  shellQuote,
} from './release-ghostex-config.mjs';
import { extractChangelogSection, buildGithubReleaseNotes } from './release-ghostex-notes.mjs';
import {
  runGitNetwork,
  ensureGhAuthForRelease,
  ensureCleanWorktree,
  ensureReleaseBranchSynced,
  ensureReleaseExists,
  ensureTagExists,
  readGithubRelease,
  parseGithubAssetSha,
  githubReleaseArtifactFromAssets,
  gpuiArtifactFromAssets,
  androidArtifactFromAssets,
} from './release-ghostex-github.mjs';
import {
  onDemandAssetsDir,
  readOnDemandBuildManifest,
  uploadOnDemandAssets,
  onDemandAssetsFromReleaseAssets,
  buildAndUploadAndroidRelease,
} from './release-ghostex-build.mjs';
import { updateHomebrew, validateGhostexCask } from './release-ghostex-homebrew.mjs';
import { verifyHomebrewReleaseReadiness, ensureAndroidReleaseReadiness } from './release-ghostex-preflight.mjs';

async function generateAppcast(version, buildVersion, sparkleBinDir, artifact) {
  logStep(`Generate Sparkle feed ${artifact.feed}`);
  const workDir = await mkdtemp(path.join(tmpdir(), `ghostex-${version}-${artifact.arch}-appcast-`));
  const appcastPath = path.join(repoRoot, artifact.feed);
  const workAppcast = path.join(workDir, 'appcast.xml');
  const workDmg = path.join(workDir, path.basename(artifact.finalDmg));

  await run(`cp ${shellQuote(appcastPath)} ${shellQuote(workAppcast)}`);
  await run(`cp ${shellQuote(artifact.finalDmg)} ${shellQuote(workDmg)}`);
  const changelogNotes = await writeSparkleReleaseNotes(version, workDmg, artifact.releaseNotesTitle ?? 'Ghostex');
  await run(
    [
      shellQuote(path.join(sparkleBinDir, 'generate_appcast')),
      '--download-url-prefix',
      shellQuote(`https://github.com/${config.githubRepo}/releases/download/v${version}/`),
      '--full-release-notes-url',
      shellQuote(`https://github.com/${config.githubRepo}/releases/tag/v${version}`),
      '--embed-release-notes',
      '--maximum-versions 6',
      '-o',
      shellQuote(workAppcast),
      shellQuote(workDir),
    ].join(' ')
  );
  await run(`cp ${shellQuote(workAppcast)} ${shellQuote(appcastPath)}`);
  await run(`xmllint --noout ${shellQuote(appcastPath)}`);
  await run(`${shellQuote(path.join(sparkleBinDir, 'sign_update'))} ${shellQuote(appcastPath)}`);
  /*
   CDXC:Release 2026-06-03-20:28:
   Sparkle verification must prove the appcast enclosure signature validates
   the generated DMG artifact, not merely that the XML feed can be signed.
   Use namespace-agnostic XPath because appcast namespace prefixes can vary
   across generated feeds.
   */
  const enclosureSignature = await capture(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='enclosure']/@*[local-name()='edSignature'])[1])" ${shellQuote(appcastPath)}`
  );
  await run(
    `${shellQuote(path.join(sparkleBinDir, 'sign_update'))} --verify ${shellQuote(artifact.finalDmg)} ${shellQuote(enclosureSignature)}`
  );
  await run(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='version'])[1])" ${shellQuote(appcastPath)} | grep -Fx ${shellQuote(String(buildVersion))}`
  );
  await run(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='shortVersionString'])[1])" ${shellQuote(appcastPath)} | grep -Fx ${shellQuote(version)}`
  );
  const embeddedReleaseNotesFormat = await capture(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='description']/@*[local-name()='format'])[1])" ${shellQuote(appcastPath)}`
  );
  if (embeddedReleaseNotesFormat.trim() !== 'markdown') {
    throw new ReleaseError(`Sparkle feed ${artifact.feed} did not embed markdown release notes for ${version}.`);
  }
  const embeddedReleaseNotes = await capture(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='description'])[1])" ${shellQuote(appcastPath)}`
  );
  if (!embeddedReleaseNotes.includes(changelogNotes.trim())) {
    throw new ReleaseError(`Sparkle feed ${artifact.feed} is missing the CHANGELOG.md notes for ${version}.`);
  }
  await run(
    `rg ${shellQuote(`${path.basename(artifact.finalDmg)}|sparkle:version|sparkle:shortVersionString|sparkle:edSignature|sparkle-signatures`)} ${shellQuote(appcastPath)} -g '!node_modules/**' -g '!dist/**' -g '!build/**' -g '!coverage/**' -g '!.git/**'`
  );

  await rm(workDir, { recursive: true, force: true });
}

async function writeSparkleReleaseNotes(version, workDmg, releaseNotesTitle = 'Ghostex') {
  const changelogNotes = await extractChangelogSection(version);
  const parsedDmg = path.parse(workDmg);
  const releaseNotesPath = path.join(parsedDmg.dir, `${parsedDmg.name}.md`);
  /*
   CDXC:Release 2026-06-08-10:07:
   Sparkle's update dialog does not render `sparkle:fullReleaseNotesLink`; it
   shows changelog text only from a per-item description or releaseNotesLink.
   Write same-basename markdown beside each DMG and force embedding so the
   update menu shows CHANGELOG.md notes without depending on a separate notes
   asset or browser fallback.
   */
  const releaseNotes = [
    `# ${releaseNotesTitle} ${version}`,
    '',
    changelogNotes,
    '',
    `[Full release notes](https://github.com/${config.githubRepo}/releases/tag/v${version})`,
    '',
  ].join('\n');
  await writeFile(releaseNotesPath, releaseNotes, 'utf8');
  return changelogNotes;
}

export async function updateSparkleFeeds(version, buildVersion, sparkleBinDir, artifacts) {
  for (const artifact of artifacts) {
    await generateAppcast(version, buildVersion, sparkleBinDir, artifact);
  }
}

export async function commitReleaseMetadata(version, options) {
  logStep('Commit release metadata');
  const metadataFiles = ['package.json'];
  if (!options.skipSparkle) {
    metadataFiles.push(config.armFeed);
    if (options.gpui) {
      metadataFiles.push(config.gpuiFeed);
    }
  }
  await run(`git add ${metadataFiles.map(shellQuote).join(' ')}`);
  await run(`git commit -m ${shellQuote(`chore: release ${version}`)}`);

  if (!options.noPush) {
    await runGitNetwork(`git push origin HEAD:${shellQuote(options.releaseBranch)}`);
    await run(`git tag -a ${shellQuote(`v${version}`)} -m ${shellQuote(`Release v${version}`)}`);
    await runGitNetwork(`git push origin ${shellQuote(`v${version}`)}`);
  }

  return capture('git rev-parse HEAD');
}

export async function createGithubRelease(
  version,
  artifacts,
  options,
  { onDemandAssets = [], gpuiArtifact = null } = {}
) {
  logStep('Create GitHub release');
  const notesPath = path.join(await mkdtemp(path.join(tmpdir(), `ghostex-${version}-notes-`)), 'notes.md');
  const notes = await buildGithubReleaseNotes(version, artifacts, { onDemandAssets, gpuiArtifact });

  await writeFile(notesPath, notes);
  const assets = artifacts.map((entry) => shellQuote(entry.finalDmg)).join(' ');
  await run(
    [
      'gh release create',
      shellQuote(`v${version}`),
      assets,
      '--repo',
      shellQuote(config.githubRepo),
      '--title',
      shellQuote(`Ghostex ${version}`),
      '--notes-file',
      shellQuote(notesPath),
      ...(options.githubPrerelease || isPrereleaseVersion(version) ? ['--prerelease'] : []),
    ].join(' ')
  );
  await uploadOnDemandAssets(version, onDemandAssets);

  return `https://github.com/${config.githubRepo}/releases/tag/v${version}`;
}

export async function updateGithubReleaseNotes(version, artifacts, releaseAssets) {
  logStep('Update GitHub release notes');
  const notesPath = path.join(await mkdtemp(path.join(tmpdir(), `ghostex-${version}-final-notes-`)), 'notes.md');
  await writeFile(notesPath, await buildGithubReleaseNotes(version, artifacts, releaseAssets));
  await run(
    [
      'gh release edit',
      shellQuote(`v${version}`),
      '--repo',
      shellQuote(config.githubRepo),
      '--notes-file',
      shellQuote(notesPath),
    ].join(' ')
  );
}

export async function validateLiveSparkleAndAssets(version, buildVersion, sparkleBinDir, artifacts) {
  logStep('Validate live Sparkle feed and GitHub asset');
  /*
   CDXC:Release 2026-07-02-14:10:
   The 5.4.0 release downloaded the same ~800 MB DMG three times (here, brew
   fetch, final verification). This validation now proves the same facts
   without a download: the live appcast signature must verify against the
   exact local artifact bytes, and the GitHub API asset digest must equal the
   local artifact SHA256. Homebrew's arm fetch stays the single full live
   download of the release.
   */
  /*
   Live validation iterates the packaged
   artifacts themselves (macOS + optional GPUI) instead of the arch table so
   each artifact's own feed, feed URL, and DMG asset name are proven; the
   expected enclosure name comes from the artifact basename.
   */
  for (const artifact of artifacts ?? []) {
    if (!artifact?.finalDmg || !existsSync(artifact.finalDmg)) {
      throw new ReleaseError(
        `Local ${artifact?.arch ?? '(unknown)'} DMG is required for live validation: ${artifact?.finalDmg ?? '(missing)'}`
      );
    }
    const dmgAssetName = path.basename(artifact.finalDmg);
    const output = path.join(tmpdir(), `ghostex-live-${version}-${artifact.feed}`);
    await run(`curl -fsSL ${shellQuote(artifact.feedUrl)} -o ${shellQuote(output)}`);
    await run(`xmllint --noout ${shellQuote(output)}`);
    const liveSignature = await capture(
      `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='enclosure']/@*[local-name()='edSignature'])[1])" ${shellQuote(output)}`
    );
    const liveDmgUrl = await capture(
      `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='enclosure']/@url)[1])" ${shellQuote(output)}`
    );
    const expectedDmgUrl = `https://github.com/${config.githubRepo}/releases/download/v${version}/${dmgAssetName}`;
    if (liveDmgUrl !== expectedDmgUrl) {
      throw new ReleaseError(`Live appcast enclosure URL mismatch: ${liveDmgUrl} (expected ${expectedDmgUrl})`);
    }
    await run(
      `${shellQuote(path.join(sparkleBinDir, 'sign_update'))} --verify ${shellQuote(artifact.finalDmg)} ${shellQuote(liveSignature)}`
    );
    await run(
      `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='version'])[1])" ${shellQuote(output)} | grep -Fx ${shellQuote(String(buildVersion))}`
    );
    await run(
      `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='shortVersionString'])[1])" ${shellQuote(output)} | grep -Fx ${shellQuote(version)}`
    );
    await run(
      `rg ${shellQuote(`${dmgAssetName}|sparkle:version|sparkle:shortVersionString|sparkle-signatures`)} ${shellQuote(output)} -g '!node_modules/**' -g '!dist/**' -g '!build/**' -g '!coverage/**' -g '!.git/**'`
    );
    await run(`curl -I -L --fail ${shellQuote(expectedDmgUrl)} | sed -n '1,12p'`);

    const release = await readGithubRelease(version);
    const dmgAsset = release.assets.find((asset) => asset.name === dmgAssetName);
    if (!dmgAsset) {
      throw new ReleaseError(`GitHub release v${version} is missing ${dmgAssetName}.`);
    }
    const liveDigest = parseGithubAssetSha(dmgAsset);
    if (liveDigest) {
      if (liveDigest !== artifact.sha256) {
        throw new ReleaseError(
          `GitHub asset digest ${liveDigest} does not match local ${dmgAssetName} SHA256 ${artifact.sha256}.`
        );
      }
      console.log(
        `GitHub API digest matches local ${dmgAssetName} SHA256 (${artifact.sha256}); skipping duplicate download.`
      );
    } else {
      console.warn('GitHub API returned no asset digest; downloading the live DMG once to verify.');
      const liveDmgPath = path.join(tmpdir(), `ghostex-live-${version}-${dmgAssetName}`);
      await run(`curl -fsSL ${shellQuote(liveDmgUrl)} -o ${shellQuote(liveDmgPath)}`, {
        timeoutMs: releaseTimeouts.brewFetchMs,
      });
      const liveSha = await capture(`shasum -a 256 ${shellQuote(liveDmgPath)} | awk '{print $1}'`);
      if (liveSha !== artifact.sha256) {
        throw new ReleaseError(`Live DMG SHA256 ${liveSha} does not match local artifact ${artifact.sha256}.`);
      }
    }
  }
  await run(
    `gh release view ${shellQuote(`v${version}`)} --repo ${shellQuote(config.githubRepo)} --json tagName,name,url,assets --jq '{tagName,name,url,assets:[.assets[]|{name,size,digest,url}]}'`
  );
}

async function ensureLiveSparkleMatches(version, buildVersion) {
  if (isPrereleaseVersion(version)) {
    return;
  }
  const output = path.join(tmpdir(), `ghostex-live-${version}-${config.armFeed}`);
  await run(`curl -fsSL ${shellQuote(releaseArchitectures[0].feedUrl)} -o ${shellQuote(output)}`);
  await run(`xmllint --noout ${shellQuote(output)}`);
  await run(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='version'])[1])" ${shellQuote(output)} | grep -Fx ${shellQuote(String(buildVersion))}`
  );
  await run(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='shortVersionString'])[1])" ${shellQuote(output)} | grep -Fx ${shellQuote(version)}`
  );
  await run(
    `xmllint --xpath "string((//*[local-name()='item'][1]/*[local-name()='enclosure']/@url)[1])" ${shellQuote(output)} | grep -Fx ${shellQuote(`https://github.com/${config.githubRepo}/releases/download/v${version}/ghostex-${version}-arm64.dmg`)}`
  );
}

async function liveHomebrewCaskIsCurrent(version, sha256) {
  try {
    const liveCask = await capture(
      `curl -fsSL ${shellQuote(`https://raw.githubusercontent.com/maddada/homebrew-tap/main/${config.caskPath}`)}`,
      { timeoutMs: releaseTimeouts.brewFetchMs }
    );
    validateGhostexCask(liveCask, { version, sha256 });
    return true;
  } catch {
    return false;
  }
}

export async function resumeRelease(version, buildVersion, options) {
  logStep('Resume release');
  await ensureGhAuthForRelease();
  await ensureCleanWorktree();
  await ensureReleaseBranchSynced(options.releaseBranch);
  await ensureTagExists(version);
  await ensureReleaseExists(version);
  if (!options.skipSparkle) {
    await ensureLiveSparkleMatches(version, buildVersion);
  }

  const release = await readGithubRelease(version);
  const armArtifact = await githubReleaseArtifactFromAssets(version, release.assets);
  const artifacts = [armArtifact];
  const gpuiArtifact = await gpuiArtifactFromAssets(version, release.assets);
  let androidArtifact = await androidArtifactFromAssets(release.assets);

  let onDemandAssets = await onDemandAssetsFromReleaseAssets(release.assets);
  if (!onDemandAssets) {
    const buildManifest = await readOnDemandBuildManifest(version).catch(() => null);
    const uploadable = (buildManifest?.assets ?? []).filter((asset) => asset.path && existsSync(asset.path));
    if (uploadable.length === onDemandAssetNames.length) {
      await uploadOnDemandAssets(version, uploadable);
      onDemandAssets = uploadable.map(({ name, sha256 }) => ({ name, sha256 }));
    } else {
      throw new ReleaseError(
        `GitHub release v${version} is missing on-demand assets (${onDemandAssetNames.join(', ')}) and no local tarballs exist under ${onDemandAssetsDir(version)} to re-upload. Repair with --from publish-macos.`
      );
    }
  }
  if (onDemandAssets.some((asset) => !asset.sha256)) {
    throw new ReleaseError(
      `GitHub did not report digests for the on-demand assets of v${version}; cannot rebuild release notes safely.`
    );
  }

  if (!(await liveHomebrewCaskIsCurrent(version, armArtifact.sha256))) {
    await verifyHomebrewReleaseReadiness(version);
    await updateHomebrew(version, artifacts, options);
  } else {
    console.log(`Homebrew cask is already current for ${version}.`);
  }

  if (!options.skipAndroid) {
    if (androidArtifact) {
      console.log(`Android release asset ${config.androidApkAssetName} is already present.`);
    } else {
      await ensureAndroidReleaseReadiness(version, buildVersion, options);
      androidArtifact = await buildAndUploadAndroidRelease(version, buildVersion);
    }
  }
  await updateGithubReleaseNotes(version, artifacts, { androidArtifact, onDemandAssets, gpuiArtifact });

  logStep('Resume complete');
  console.log(`Release URL: https://github.com/${config.githubRepo}/releases/tag/v${version}`);
}
