import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { logStep, run, capture } from './release-ghostex-process.mjs';
import { config, releaseTimeouts, ReleaseError, shellQuote } from './release-ghostex-config.mjs';
import {
  isHomebrewHostToolchainVersionError,
  runOptionalHomebrewHostValidation,
  runGitNetwork,
} from './release-ghostex-github.mjs';

export async function updateHomebrew(version, artifacts, options) {
  logStep('Update Homebrew tap');
  const tapDir = await mkdtemp(path.join(tmpdir(), `ghostex-${version}-homebrew-tap-`));
  await run(`git clone ${shellQuote(config.tapRepo)} ${shellQuote(tapDir)}`);

  const caskFile = path.join(tapDir, config.caskPath);
  const existingCask = await readFile(caskFile, 'utf8');
  const arm = artifacts.find((entry) => entry.arch === 'arm64');
  if (!arm) {
    throw new ReleaseError('arm64 release artifact is required for the Homebrew cask.');
  }

  let cask = renderGhostexCaskForTap(existingCask, { version, sha256: arm.sha256 });
  validateGhostexCask(cask, { version, sha256: arm.sha256 });

  await writeFile(caskFile, cask);
  await run(`ruby -c ${shellQuote(config.caskPath)}`, { cwd: tapDir });
  /*
   CDXC:Release 2026-05-29-19:30:
   Homebrew style can fail on autocorrectable blank-line offenses after the cask
   generator inserts the gx preflight block. Auto-fix those before the strict
   style check so a successful GitHub release is not blocked by formatting.

   CDXC:Release 2026-06-10-09:47:
   Homebrew's API install path can fail on macOS beta host identifiers before it
   reads the freshly pushed tap cask. Disable install-from-API for style/info/fetch
   validation and treat unrelated brew update failures as non-blocking once the
   Ghostex cask validates directly.

   CDXC:Release 2026-06-21-13:20:
   GitHub issue #49 showed current Homebrew treats `depends_on macos: :ventura`
   as the Ventura-or-newer floor and warns on the old comparison string, so the
   release renderer should use normal style validation and keep the symbol form.
   */
  const localStyleValidationAvailable = await runOptionalHomebrewHostValidation(
    `HOMEBREW_NO_INSTALL_FROM_API=1 brew style --fix ${shellQuote(config.caskPath)}`,
    { cwd: tapDir }
  );
  if (localStyleValidationAvailable) {
    await runOptionalHomebrewHostValidation(
      `HOMEBREW_NO_INSTALL_FROM_API=1 brew style ${shellQuote(config.caskPath)}`,
      { cwd: tapDir }
    );
  }
  cask = await readFile(caskFile, 'utf8');
  validateGhostexCask(cask, { version, sha256: arm.sha256 });
  await run(`git diff -- ${shellQuote(config.caskPath)}`, { cwd: tapDir });
  await run(`git add ${shellQuote(config.caskPath)}`, { cwd: tapDir });
  await run(`git commit -m ${shellQuote(`Update ghostex cask to ${version}`)}`, { cwd: tapDir });
  await runGitNetwork('git push origin main', { cwd: tapDir });
  const tapCommit = await capture('git rev-parse HEAD', { cwd: tapDir });

  if (!options.skipBrewFetch) {
    let localBrewValidationAvailable = true;
    let shouldValidateLiveCaskFromTap = false;
    try {
      await run('HOMEBREW_NO_INSTALL_FROM_API=1 brew update --force', { timeoutMs: releaseTimeouts.brewFetchMs });
    } catch (error) {
      if (isHomebrewHostToolchainVersionError(error)) {
        localBrewValidationAvailable = false;
        console.warn(
          "Warning: skipping local Homebrew fetch validation because this host's Xcode/CLT is below Homebrew's current minimum."
        );
      } else {
        console.warn(
          `Warning: brew update failed; continuing with direct Ghostex cask validation.\n${String(error.message ?? error)}`
        );
      }
    }
    if (localBrewValidationAvailable) {
      localBrewValidationAvailable = await runOptionalHomebrewHostValidation(
        'HOMEBREW_NO_INSTALL_FROM_API=1 brew info --cask maddada/tap/ghostex',
        {
          timeoutMs: releaseTimeouts.brewFetchMs,
        }
      );
    }
    if (localBrewValidationAvailable) {
      try {
        const liveCask = await capture('HOMEBREW_NO_INSTALL_FROM_API=1 brew cat --cask maddada/tap/ghostex', {
          timeoutMs: releaseTimeouts.brewFetchMs,
        });
        validateGhostexCask(liveCask, { version, sha256: arm.sha256 });
      } catch (error) {
        if (!isHomebrewHostToolchainVersionError(error)) {
          throw error;
        }
        localBrewValidationAvailable = false;
        console.warn(
          "Warning: skipping local Homebrew cask read because this host's Xcode/CLT is below Homebrew's current minimum."
        );
      }
    }
    let dmgCachePath = null;
    if (localBrewValidationAvailable) {
      const localFetchValidationAvailable = await runOptionalHomebrewHostValidation(
        'HOMEBREW_NO_INSTALL_FROM_API=1 brew fetch --force --cask --arch=arm maddada/tap/ghostex',
        {
          timeoutMs: releaseTimeouts.brewFetchMs,
        }
      );
      shouldValidateLiveCaskFromTap = !localFetchValidationAvailable;
      if (localFetchValidationAvailable) {
        /*
         CDXC:Release 2026-07-02-14:10:
         brew fetch is the release's single full live download. Reuse its
         cached artifact to prove the published bytes equal the local DMG and
         hand the path to final verification so nothing downloads the DMG
         again.
         */
        try {
          const cachedDownload = await capture(
            'HOMEBREW_NO_INSTALL_FROM_API=1 brew --cache --cask --arch=arm maddada/tap/ghostex',
            { timeoutMs: 60_000 }
          );
          if (cachedDownload && existsSync(cachedDownload)) {
            const cachedSha = await capture(`shasum -a 256 ${shellQuote(cachedDownload)} | awk '{print $1}'`);
            if (cachedSha !== arm.sha256) {
              throw new ReleaseError(
                `Homebrew-fetched DMG SHA256 ${cachedSha} does not match the released artifact ${arm.sha256}.`
              );
            }
            console.log(`Homebrew-fetched DMG matches release SHA256; cached at ${cachedDownload}.`);
            dmgCachePath = cachedDownload;
          }
        } catch (error) {
          if (error instanceof ReleaseError) {
            throw error;
          }
          console.warn(`Could not resolve the Homebrew download cache path: ${String(error.message ?? error)}`);
        }
      }
    } else {
      shouldValidateLiveCaskFromTap = true;
    }
    if (shouldValidateLiveCaskFromTap) {
      const liveCask = await capture(
        `curl -fsSL ${shellQuote(`https://raw.githubusercontent.com/maddada/homebrew-tap/main/${config.caskPath}`)}`,
        { timeoutMs: releaseTimeouts.brewFetchMs }
      );
      validateGhostexCask(liveCask, { version, sha256: arm.sha256 });
      console.warn('Validated the live Homebrew cask from the tap because local brew fetch validation is unavailable.');
    }
    return { dmgCachePath, tapCommit, tapDir };
  }

  return { dmgCachePath: null, tapCommit, tapDir };
}

/**
 * CDXC:Cli 2026-05-26-15:11:
 * Homebrew releases should install `ghostex` and the new `gx` short alias, not
 * the older `gtx` alias. Check for an existing non-Ghostex `gx` binary before
 * installing wrappers so setup does not silently claim a command name another
 * tool owns.
 *
 * CDXC:Cli 2026-06-12-09:31:
 * Homebrew must install ghostex/gx as wrapper files in HOMEBREW_PREFIX/bin,
 * not binary symlinks into Ghostex.app. Direct execution of app-bundled scripts
 * can be killed during macOS policy assessment before Node starts. Best-effort
 * clear provenance/quarantine xattrs from the wrappers because replaced
 * symlinks can carry policy metadata into the new files on some macOS builds.
 *
 * CDXC:Cli 2026-09-03 WHY:
 * The literal `CDXC:CliInstall 2026-06-12-09:31` in the cask body below is NOT
 * a comment tag. It is the on-disk ownership stamp the cask writes into
 * HOMEBREW_PREFIX/bin/{ghostex,gx} and reads back to tell its own wrapper from
 * a foreign command of the same name, so it is a compatibility contract with
 * every wrapper already installed on a user's machine. The 2026-09-03 area
 * rename swept it to `CDXC:Cli` in this file while the live tap and every
 * installed wrapper still carried the old spelling; preflight then read its own
 * wrapper as a foreign binary and `brew upgrade ghostex` would have failed with
 * "already exists" for every existing user. Renaming it requires accepting both
 * spellings for at least one release, not a search and replace.
 *
 * CDXC:Release 2026-06-14-09:07:
 * The Ghostex tap cask is owned release output, so render it from this canonical
 * template instead of regex-normalizing whatever shape is currently in the tap.
 * This keeps arm64-only distribution, the explicit Ventura floor, and wrapper
 * install hooks deterministic while still allowing the compatibility guard that
 * recognizes old Web/cli Ghostex-owned commands.
 */
export function renderGhostexCaskForTap(existingCask, release) {
  if (!/^\s*cask "ghostex" do/m.test(existingCask)) {
    throw new ReleaseError('Homebrew tap checkout does not contain the Ghostex cask.');
  }
  return renderGhostexCask(release);
}

export function renderGhostexCask({ version, sha256 }) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new ReleaseError(`Cannot render Ghostex cask for invalid version: ${version}`);
  }
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new ReleaseError(`Cannot render Ghostex cask with invalid sha256: ${sha256}`);
  }
  const cask = `cask "ghostex" do
  version "${version}"
  sha256 "${sha256}"

  url "https://github.com/maddada/Ghostex/releases/download/v#{version}/ghostex-#{version}-arm64.dmg"
  name "Ghostex"
  desc "Workspace and session UI for agent terminals"
  homepage "https://github.com/maddada/Ghostex"

  conflicts_with cask: "zmux"
  # CDXC:Release 2026-06-21-13:20: GitHub issue #49 showed current
  # Homebrew treats the symbol form as the Ventura-or-newer floor, so keep this
  # syntax to avoid a warning on every brew invocation.
  depends_on arch: :arm64
  depends_on macos: :ventura

  app "ghostex.app"
  # CDXC:Cli 2026-05-26-15:11: Install gx only when another tool does not already own that command name.
  # CDXC:Cli 2026-06-12-09:31: Homebrew writes wrapper files in
  # HOMEBREW_PREFIX/bin instead of binary symlinks into Ghostex.app because
  # macOS can kill direct app-bundled script execution during policy assessment.
  # CDXC:Release 2026-09-21 WHY: Homebrew 7.0.6 deprecated the Ruby
  # preflight/postflight blocks, so the wrappers are command_wrapper stanzas and
  # the checks are *_steps. Both need Homebrew 6.0.13 or newer.
  command_wrapper "ghostex", content: <<~EOS
    #!/bin/bash
    set -euo pipefail
    # CDXC:CliInstall 2026-06-12-09:31: Public PATH commands live outside Ghostex.app so macOS does not directly execute app-bundled shell scripts during policy assessment.
    exec "#{appdir}/ghostex.app/Contents/Resources/CLI/ghostex" "$@"
  EOS
  command_wrapper "gx", content: <<~EOS
    #!/bin/bash
    set -euo pipefail
    # CDXC:CliInstall 2026-06-12-09:31: Public PATH commands live outside Ghostex.app so macOS does not directly execute app-bundled shell scripts during policy assessment.
    exec "#{appdir}/ghostex.app/Contents/Resources/CLI/ghostex" "$@"
  EOS

  preflight_steps do
    write_file "ghostex-cli-conflict-check.sh", <<~SH, append_newline: true
      #!/bin/bash
      set -euo pipefail
      PREFIX="{{HOMEBREW_PREFIX}}"
      ghostex_owned() {
        local path="$1"
        local cmd="$2"
        local target=""
        local content=""
        if [[ -L "$path" ]]; then
          target=$(readlink "$path" || true)
        fi
        if [[ -f "$path" ]]; then
          content=$(cat "$path" 2>/dev/null || true)
        fi
        case "$content" in
          *"CDXC:CliInstall 2026-06-12-09:31"*)
            case "$content" in
              *"ghostex-cli.mjs"*|*"/Resources/CLI/ghostex"*) return 0 ;;
            esac
            ;;
        esac
        case "$target" in
          *"/Caskroom/ghostex/"*"/.homebrew-command-wrappers/$cmd") return 0 ;;
          *"ghostex.app/Contents/Resources/CLI/$cmd"*) return 0 ;;
          *"ghostex.app/Contents/Resources/Web/cli/$cmd"*) return 0 ;;
        esac
        if [[ "$cmd" == "ghostex" ]]; then
          case "$target" in
            *"ghostex.app/Contents/MacOS/ghostex"*) return 0 ;;
          esac
        fi
        return 1
      }
      for cmd in ghostex gx; do
        candidates=("$PREFIX/bin/$cmd")
        old_ifs="$IFS"
        IFS=":"
        for entry in $PATH; do
          [[ -n "$entry" ]] && candidates+=("$entry/$cmd")
        done
        IFS="$old_ifs"
        seen="|"
        for path in "\${candidates[@]}"; do
          case "$seen" in
            *"|$path|"*) continue ;;
          esac
          seen="\${seen}\${path}|"
          if [[ ! -e "$path" && ! -L "$path" ]]; then
            continue
          fi
          if ghostex_owned "$path" "$cmd"; then
            continue
          fi
          echo "Ghostex cannot install the $cmd CLI because $path already exists. Remove or rename the existing $cmd command, then reinstall Ghostex." >&2
          exit 1
        done
      done
    SH
    set_permissions "ghostex-cli-conflict-check.sh", "0755"
    run "{{staged_path}}/ghostex-cli-conflict-check.sh"
  end

  postflight_steps do
    run "/usr/bin/xattr", args:         ["-d", "com.apple.provenance", "{{HOMEBREW_PREFIX}}/bin/ghostex"],
                          must_succeed: false,
                          print_stderr: false
    run "/usr/bin/xattr", args:         ["-d", "com.apple.quarantine", "{{HOMEBREW_PREFIX}}/bin/ghostex"],
                          must_succeed: false,
                          print_stderr: false
    run "/usr/bin/xattr", args:         ["-d", "com.apple.provenance", "{{HOMEBREW_PREFIX}}/bin/gx"],
                          must_succeed: false,
                          print_stderr: false
    run "/usr/bin/xattr", args:         ["-d", "com.apple.quarantine", "{{HOMEBREW_PREFIX}}/bin/gx"],
                          must_succeed: false,
                          print_stderr: false
  end

  uninstall_preflight_steps do
    write_file "ghostex-cli-uninstall-wrappers.sh", <<~SH, append_newline: true
      #!/bin/bash
      set -euo pipefail
      PREFIX="{{HOMEBREW_PREFIX}}"
      for cmd in ghostex gx; do
        path="$PREFIX/bin/$cmd"
        if [[ -L "$path" || ! -f "$path" ]]; then
          continue
        fi
        content=$(cat "$path" 2>/dev/null || true)
        case "$content" in
          *"CDXC:CliInstall 2026-06-12-09:31"*)
            case "$content" in
              *"ghostex-cli.mjs"*|*"/Resources/CLI/ghostex"*) rm -f "$path" ;;
            esac
            ;;
        esac
      done
    SH
    set_permissions "ghostex-cli-uninstall-wrappers.sh", "0755"
    run "{{staged_path}}/ghostex-cli-uninstall-wrappers.sh", writable_paths: ["{{HOMEBREW_PREFIX}}/bin"]
  end

  zap trash: [
    "~/Library/Application Support/com.madda.zmux.host",
    "~/Library/Preferences/com.madda.zmux.host.plist",
    "~/Library/Saved Application State/com.madda.zmux.host.savedState",
  ]
end
`;
  validateGhostexCask(cask, { version, sha256 });
  return cask;
}

export function validateGhostexCask(cask, { version, sha256 }) {
  for (const required of [
    `version "${version}"`,
    `sha256 "${sha256}"`,
    'url "https://github.com/maddada/Ghostex/releases/download/v#{version}/ghostex-#{version}-arm64.dmg"',
    'depends_on arch: :arm64',
    'depends_on macos: :ventura',
    'command_wrapper "ghostex", content:',
    'command_wrapper "gx", content:',
    'CDXC:CliInstall 2026-06-12-09:31',
    'exec "#{appdir}/ghostex.app/Contents/Resources/CLI/ghostex" "$@"',
  ]) {
    if (!cask.includes(required)) {
      throw new ReleaseError(`Ghostex cask is missing required stanza: ${required}`);
    }
  }
  for (const block of ['preflight_steps', 'postflight_steps', 'uninstall_preflight_steps']) {
    if (!new RegExp(`^\\s*${block} do$`, 'm').test(cask)) {
      throw new ReleaseError(`Ghostex cask is missing required stanza: ${block} do`);
    }
  }
  if (/^\s*(?:preflight|postflight|uninstall_preflight) do$/m.test(cask)) {
    throw new ReleaseError('Ghostex cask still uses the Ruby preflight/postflight blocks Homebrew 7.0.6 deprecated.');
  }
  if (/^\s*binary\s+"/m.test(cask)) {
    throw new ReleaseError('Ghostex cask must install wrapper files, not Homebrew binary aliases.');
  }
  if (cask.includes('x86_64') || cask.includes('#{arch}') || cask.includes('intel:')) {
    throw new ReleaseError('Ghostex cask still contains Intel release distribution stanzas.');
  }
  return true;
}
