import { readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { repoRoot, config, ReleaseError, shellQuote } from './release-ghostex-config.mjs';
import { releaseSigningIdentity, ensureSigningIdentity, ensureNotaryProfile } from './release-ghostex-signing.mjs';
import { logStep, run } from './release-ghostex-process.mjs';

function terminalReleasePaths(version) {
  return {
    logPath: `/tmp/ghostex-release-${version}.log`,
    runnerPath: `/tmp/ghostex-release-${version}.command`,
    startedPath: `/tmp/ghostex-release-${version}.started`,
    donePath: `/tmp/ghostex-release-${version}.done`,
    exitPath: `/tmp/ghostex-release-${version}.exit`,
  };
}

function releaseCommandArgs(version, options, extraArgs = []) {
  const args = [version, ...extraArgs];
  if (options.withTests) {
    args.push('--with-tests');
  }
  if (options.skipTypecheck) {
    args.push('--skip-typecheck');
  }
  if (options.skipBrewFetch) {
    args.push('--skip-brew-fetch');
  }
  if (options.skipSparkle) {
    args.push('--skip-sparkle');
  }
  if (options.skipAndroid) {
    args.push('--skip-android');
  }
  if (options.gpui) {
    args.push('--gpui');
  }
  if (options.resume) {
    args.push('--resume');
  }
  if (options.fromPhase) {
    args.push('--from', options.fromPhase);
  }
  if (options.onlyPhase) {
    args.push('--only', options.onlyPhase);
  }
  if (options.githubPrerelease) {
    args.push('--github-prerelease');
  }
  if (options.releaseBranch !== 'main') {
    args.push('--release-branch', options.releaseBranch);
  }
  if (options.noPush) {
    args.push('--no-push');
  }
  return args.map(shellQuote).join(' ');
}

async function writeTerminalReleaseRunner(version, options) {
  const { logPath, runnerPath, startedPath, donePath, exitPath } = terminalReleasePaths(version);
  const identity = releaseSigningIdentity();
  await rm(logPath, { force: true });
  await rm(startedPath, { force: true });
  await rm(donePath, { force: true });
  await rm(exitPath, { force: true });
  await writeFile(
    logPath,
    [
      `Ghostex release ${version} prepared for Terminal.app at ${new Date().toISOString()}`,
      `Runner: ${runnerPath}`,
      '',
    ].join('\n')
  );
  const runner = `#!/bin/zsh -l
set -uo pipefail
cd ${shellQuote(repoRoot)}
unset GH_TOKEN GITHUB_TOKEN
export GHOSTEX_CODE_SIGN_IDENTITY=${shellQuote(identity)}
export GHOSTEX_CODE_SIGN_TIMESTAMP_FLAG=--timestamp
export GHOSTEX_RELEASE_TERMINAL_DELEGATED=1
exec > >(tee -a ${shellQuote(logPath)}) 2>&1
echo "Ghostex release ${version} Terminal runner started at $(date)"
touch ${shellQuote(startedPath)}
release_status=0
{
  security list-keychains -d user -s "$HOME/Library/Keychains/login.keychain-db" "$HOME/Library/Keychains/iCloud.keychain-db" /Library/Keychains/System.keychain 2>/dev/null || true
  security default-keychain -d user -s "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null || true
  perl -e 'alarm 3; exec @ARGV' security unlock-keychain "$HOME/Library/Keychains/login.keychain-db" 2>/dev/null || true
  security find-identity -v -p codesigning | rg ${shellQuote('Developer ID Application: Mohamad Youssef \\(KTKP595G3B\\)')} || true
  xcrun notarytool history --keychain-profile ${shellQuote(config.notaryProfile)} | head -n 8
  gh auth status -h github.com
  bun run release:local -- ${releaseCommandArgs(version, options, ['--no-terminal-delegate'])}
} || {
  release_status=$?
}
if [ "$release_status" -eq 0 ]; then
  echo "Ghostex release ${version} finished at $(date)"
else
  echo "Ghostex release ${version} failed with status $release_status at $(date)"
fi
echo "$release_status" > ${shellQuote(exitPath)}
touch ${shellQuote(donePath)}
exit "$release_status"
`;
  await writeFile(runnerPath, runner, { mode: 0o755 });
  return { logPath, runnerPath, startedPath, donePath, exitPath };
}

async function launchTerminalReleaseRunner(runnerPath) {
  logStep('Launch release through login-session Terminal');
  /**
   * CDXC:Release 2026-05-23-14:05:
   * AppleScript's `do script` breaks when generated through osascript -e because
   * `script` is reserved. Opening the .command file in Terminal.app is the
   * reliable login-session handoff for release builds.
   */
  const attempts = [
    `open -a /System/Applications/Utilities/Terminal.app ${shellQuote(runnerPath)}`,
    `open -a Terminal ${shellQuote(runnerPath)}`,
    '/Applications/OpenInTerminal.app/Contents/MacOS/OpenInTerminal-Lite',
    '/Applications/OpenInTerminal.app/Contents/MacOS/OpenInTerminal',
  ].map((command) =>
    command.endsWith('OpenInTerminal-Lite') || command.endsWith('OpenInTerminal')
      ? `${shellQuote(command)} ${shellQuote(runnerPath)}`
      : command
  );

  let lastError;
  for (const attempt of attempts) {
    if (attempt.includes('OpenInTerminal') && !existsSync(attempt.split(' ')[0].replaceAll("'", ''))) {
      continue;
    }
    try {
      await run(attempt);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn('Could not open Terminal.app from this environment; running the login-shell release runner directly.');
  await run(`nohup /bin/zsh -l ${shellQuote(runnerPath)} </dev/null >/dev/null 2>&1 &`);
}

async function waitForReleaseStart(startedPath, logPath, runnerPath, timeoutMs = 60 * 1000) {
  const startedAt = Date.now();
  while (!existsSync(startedPath)) {
    if (Date.now() - startedAt > timeoutMs) {
      const log = existsSync(logPath) ? await readFile(logPath, 'utf8') : '(log file was not created)';
      throw new ReleaseError(
        [
          'Timed out waiting for Terminal.app to start the release runner.',
          `Runner: ${runnerPath}`,
          `Log: ${logPath}`,
          '',
          log.trim(),
        ].join('\n')
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function monitorTerminalReleaseLog(version, paths) {
  const { logPath, runnerPath, startedPath, donePath, exitPath } = paths;
  logStep(`Monitor Terminal release log (${logPath})`);
  await waitForReleaseStart(startedPath, logPath, runnerPath);
  let lastLength = 0;
  let stableFor = 0;
  while (true) {
    const log = existsSync(logPath) ? await readFile(logPath, 'utf8') : '';
    const nextChunk = log.slice(lastLength);
    if (nextChunk) {
      process.stdout.write(nextChunk);
      lastLength = log.length;
    }
    if (existsSync(donePath)) {
      const exitCode = existsSync(exitPath) ? (await readFile(exitPath, 'utf8')).trim() : 'unknown';
      if (exitCode === '0') {
        return;
      }
      throw new ReleaseError(log.trim() || `Terminal release failed with status ${exitCode}. See ${logPath}`);
    }
    stableFor = nextChunk ? 0 : stableFor + 1;
    if (stableFor >= 180) {
      throw new ReleaseError(`Terminal release appears stalled. See ${logPath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

export async function agentShellCredentialsReady() {
  try {
    await ensureSigningIdentity();
    await ensureNotaryProfile();
  } catch {
    return false;
  }
  return true;
}

export async function delegateReleaseToTerminal(version, options) {
  const paths = await writeTerminalReleaseRunner(version, options);
  await launchTerminalReleaseRunner(paths.runnerPath);
  await monitorTerminalReleaseLog(version, paths);
}
