#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  repoRoot,
  config,
  onDemandAssetNames,
  releasePhaseNames,
  ReleaseError,
  usage,
  parseArgs,
  releaseBuildVersion,
  missingRemoteGxserverLinuxPackageResources,
  shellQuote,
} from './release-ghostex-config.mjs';
import {
  logStep,
  runWithHeartbeat,
  assertReleaseWithinOverallBudget,
  loadOrCreateReleaseState,
  runReleasePhase,
  printPhaseTimingSummary,
} from './release-ghostex-process.mjs';
import { isHomebrewHostToolchainVersionError, ensureCleanWorktree } from './release-ghostex-github.mjs';
import { agentShellCredentialsReady, delegateReleaseToTerminal } from './release-ghostex-terminal.mjs';
import {
  ensureRemoteGxserverLinuxPackagesReady,
  findAndVerifySparkleBinDir,
  preflight,
} from './release-ghostex-preflight.mjs';
import {
  bumpReleaseMetadata,
  buildAndPackage,
  selectLatestAndroidBuildTool,
  buildAndUploadAndroidRelease,
} from './release-ghostex-build.mjs';
import {
  extractChangelogSectionFromText,
  changelogNotesFormat,
  changelogNotesItems,
  validateMajorMinorReleaseNotes,
  buildGithubReleaseNotes,
} from './release-ghostex-notes.mjs';
import {
  updateSparkleFeeds,
  commitReleaseMetadata,
  createGithubRelease,
  updateGithubReleaseNotes,
  validateLiveSparkleAndAssets,
  resumeRelease,
} from './release-ghostex-publish.mjs';
import {
  updateHomebrew,
  renderGhostexCaskForTap,
  renderGhostexCask,
  validateGhostexCask,
} from './release-ghostex-homebrew.mjs';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage().trim());
    return;
  }

  process.chdir(repoRoot);
  const version = options.version;
  const buildVersion = releaseBuildVersion(version);

  console.log(`Ghostex local release: ${version}`);
  console.log(`Sparkle build version: ${buildVersion}`);
  const releaseStartedAt = Date.now();

  if (options.resume) {
    await resumeRelease(version, buildVersion, options);
    return;
  }

  await ensureCleanWorktree();

  if (
    !options.noTerminalDelegate &&
    !process.env.GHOSTEX_RELEASE_TERMINAL_DELEGATED &&
    !(await agentShellCredentialsReady())
  ) {
    console.warn('Agent shell cannot access Developer ID signing or notary credentials. Delegating to Terminal.app.');
    await delegateReleaseToTerminal(version, options);
    return;
  }

  const state = await loadOrCreateReleaseState(version, buildVersion, options);
  try {
    assertReleaseWithinOverallBudget(releaseStartedAt, 'preflight');
    await runReleasePhase(state, 'preflight', options, async () => {
      await preflight(version, buildVersion, options);
    });

    assertReleaseWithinOverallBudget(releaseStartedAt, 'prepare-remote-linux');
    await runReleasePhase(state, 'prepare-remote-linux', options, async () => {
      /*
       CDXC:Release 2026-07-02-14:10:
       The builder script exits quickly when both Ubuntu packages already match
       HEAD; when they are stale it runs the checked-in Zig cross-build recipe
       instead of failing with a rebuild-by-hand hint.
       */
      await runWithHeartbeat('bash tooling/build-remote-gxserver-linux-release.sh --arch all', {
        label: 'remote Linux package build',
        timeoutMs: 30 * 60 * 1000,
        /*
         CDXC:Telemetry 2026-08-26:
         The remote packages bake this into gxserver (server/build.rs), exactly
         like the GPUI leg does for the desktop crate. The gxserver crate's own
         Cargo version is a 0.1.0 placeholder, so without it every shipped remote
         daemon would report the same version forever.
         */
        env: { ...process.env, GHOSTEX_GPUI_MARKETING_VERSION: version },
      });
      await ensureRemoteGxserverLinuxPackagesReady();
    });

    assertReleaseWithinOverallBudget(releaseStartedAt, 'publish-macos');
    const macos = await runReleasePhase(state, 'publish-macos', options, async () => {
      await bumpReleaseMetadata(version, buildVersion, options);
      const { artifactDir, artifacts, gpuiArtifacts, onDemandAssets } = await buildAndPackage(
        version,
        buildVersion,
        options
      );
      const allArtifacts = [...artifacts, ...(gpuiArtifacts ?? [])];
      let sparkleBinDir = null;
      if (options.skipSparkle) {
        logStep('Skip Sparkle feeds');
        console.log('Sparkle appcasts were not updated for this release.');
      } else {
        sparkleBinDir = await findAndVerifySparkleBinDir();
        await updateSparkleFeeds(version, buildVersion, sparkleBinDir, allArtifacts);
      }
      const releaseCommit = await commitReleaseMetadata(version, options);
      let releaseUrl = '(not published; --no-push was used)';
      if (!options.noPush) {
        releaseUrl = await createGithubRelease(version, allArtifacts, options, {
          onDemandAssets,
          gpuiArtifact: gpuiArtifacts?.[0] ?? null,
        });
        if (!options.skipSparkle) {
          await validateLiveSparkleAndAssets(version, buildVersion, sparkleBinDir, allArtifacts);
        }
      }
      return { artifactDir, artifacts, gpuiArtifacts, onDemandAssets, releaseCommit, releaseUrl };
    });

    if (!options.noPush) {
      assertReleaseWithinOverallBudget(releaseStartedAt, 'publish-android');
      await runReleasePhase(state, 'publish-android', options, async () => {
        let androidArtifact = null;
        if (options.skipAndroid) {
          logStep('Skip Android release');
        } else {
          androidArtifact = await buildAndUploadAndroidRelease(version, buildVersion);
        }
        await updateGithubReleaseNotes(version, macos.artifacts, {
          androidArtifact,
          onDemandAssets: macos.onDemandAssets,
          gpuiArtifact: macos.gpuiArtifacts?.[0] ?? null,
        });
        return { androidArtifact };
      });

      assertReleaseWithinOverallBudget(releaseStartedAt, 'publish-homebrew');
      const brew = await runReleasePhase(state, 'publish-homebrew', options, async () => {
        const brewResult = await updateHomebrew(version, macos.artifacts, options);
        return { dmgCachePath: brewResult.dmgCachePath ?? null, tapCommit: brewResult.tapCommit };
      });

      assertReleaseWithinOverallBudget(releaseStartedAt, 'verify-live');
      await runReleasePhase(state, 'verify-live', options, async () => {
        const localDmg = macos.artifacts?.find((entry) => entry.arch === 'arm64')?.finalDmg;
        const dmgPath = [brew.dmgCachePath, localDmg].find((candidate) => candidate && existsSync(candidate)) ?? null;
        const verifyCommand = [
          'node tooling/release-final-verify.mjs',
          shellQuote(version),
          '--skip-brew-fetch',
          ...(dmgPath ? ['--dmg', shellQuote(dmgPath)] : []),
          ...(options.skipAndroid ? ['--skip-android'] : []),
          ...(options.skipSparkle ? ['--skip-sparkle'] : []),
        ].join(' ');
        await runWithHeartbeat(verifyCommand, { label: 'final live verification', timeoutMs: 20 * 60 * 1000 });
        return { dmgPath };
      });
    }

    logStep('Release complete');
    console.log(`Release URL: ${macos.releaseUrl}`);
    console.log(`Release commit: ${macos.releaseCommit}`);
    const brewOutputs = state.phases['publish-homebrew']?.outputs;
    console.log(`Homebrew tap commit: ${brewOutputs?.tapCommit ?? '(not updated)'}`);
    console.log(`Artifact directory: ${macos.artifactDir}`);
    for (const artifact of [...(macos.artifacts ?? []), ...(macos.gpuiArtifacts ?? [])]) {
      console.log(`${artifact.kind === 'gpui' ? 'gpui-' : ''}${artifact.arch}:`);
      console.log(`  DMG: ${artifact.finalDmg}`);
      console.log(`  SHA256: ${artifact.sha256}`);
      console.log(`  Notary: ${artifact.notarySubmissionId} (${artifact.notaryStatus})`);
    }
    for (const asset of macos.onDemandAssets ?? []) {
      console.log(`On-demand asset: ${asset.name} (SHA256 ${asset.sha256})`);
    }
    console.log(`Install: ${config.installCommand}`);
  } finally {
    printPhaseTimingSummary(state);
  }
}

export {
  ReleaseError,
  buildGithubReleaseNotes,
  changelogNotesFormat,
  changelogNotesItems,
  extractChangelogSectionFromText,
  isHomebrewHostToolchainVersionError,
  missingRemoteGxserverLinuxPackageResources,
  onDemandAssetNames,
  releaseBuildVersion,
  releasePhaseNames,
  renderGhostexCask,
  renderGhostexCaskForTap,
  selectLatestAndroidBuildTool,
  validateGhostexCask,
  validateMajorMinorReleaseNotes,
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('');
    console.error(error instanceof ReleaseError ? error.message : error);
    process.exitCode = 1;
  });
}
