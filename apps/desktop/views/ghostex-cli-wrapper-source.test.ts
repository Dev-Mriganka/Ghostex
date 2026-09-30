import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// tooling/release-ghostex.mjs keeps main(); the cask renderer lives in release-ghostex-homebrew.mjs.
const releaseGhostexHomebrewSource = readFileSync(
  new URL('../../../tooling/release-ghostex-homebrew.mjs', import.meta.url),
  'utf8'
);
const releaseGhostexSource = [
  'release-ghostex.mjs',
  'release-ghostex-config.mjs',
  'release-ghostex-process.mjs',
  'release-ghostex-github.mjs',
  'release-ghostex-signing.mjs',
  'release-ghostex-terminal.mjs',
  'release-ghostex-preflight.mjs',
  'release-ghostex-build.mjs',
  'release-ghostex-notes.mjs',
  'release-ghostex-publish.mjs',
  'release-ghostex-homebrew.mjs',
]
  .map((file) => readFileSync(new URL(`../../../tooling/${file}`, import.meta.url), 'utf8'))
  .join('\n');

function sourceFrom(source: string, start: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  return source.slice(startIndex);
}

describe('Ghostex CLI command wrappers', () => {
  test('Homebrew cask generation installs wrappers instead of CLI binary aliases', () => {
    /*
     * CDXC:Cli 2026-06-12-09:31:
     * Release automation must not reintroduce Homebrew binary stanzas for
     * ghostex/gx, because those stanzas create symlinks back into Ghostex.app.
     */
    // renderGhostexCaskForTap through validateGhostexCask close release-ghostex-homebrew.mjs, which
    // is the span the renderer assertions covered before main() stayed behind in release-ghostex.mjs.
    const renderer = sourceFrom(releaseGhostexHomebrewSource, 'function renderGhostexCaskForTap');

    expect(renderer).toContain('function renderGhostexCask');
    expect(renderer).toContain('function validateGhostexCask');
    // Homebrew 7.0.6 shape (CDXC:Release 2026-09-21): command_wrapper stanzas and *_steps blocks.
    expect(renderer).toContain('postflight_steps do');
    expect(renderer).toContain('command_wrapper "ghostex", content: <<~EOS');
    expect(renderer).toContain('command_wrapper "gx", content: <<~EOS');
    expect(renderer).toContain('exec "#{appdir}/ghostex.app/Contents/Resources/CLI/ghostex" "$@"');
    for (const command of ['ghostex', 'gx']) {
      for (const attribute of ['com.apple.provenance', 'com.apple.quarantine']) {
        expect(renderer).toContain(`["-d", "${attribute}", "{{HOMEBREW_PREFIX}}/bin/${command}"]`);
      }
    }
    expect(renderer).toContain('uninstall_preflight_steps do');
    expect(renderer).toContain('Ghostex cask must install wrapper files, not Homebrew binary aliases.');
    expect(releaseGhostexSource).not.toContain('--except-cops Homebrew/OSDependsOn');
    expect(releaseGhostexSource).toContain('HOMEBREW_NO_INSTALL_FROM_API=1 brew style --fix');
    expect(releaseGhostexSource).toContain('depends_on macos: :ventura');
    expect(releaseGhostexSource).not.toContain('depends_on macos: ">= :ventura"');
    expect(renderer).not.toContain('const ghostexBinary');
    expect(renderer).not.toContain('const gxBinary');
  });
});
