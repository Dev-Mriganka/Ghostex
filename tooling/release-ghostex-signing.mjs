import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { logStep, run, capture } from './release-ghostex-process.mjs';
import { config, ReleaseError, shellQuote } from './release-ghostex-config.mjs';

async function recoverKeychainVisibility() {
  logStep('Recover keychain visibility for signing');
  const keychains = await releaseKeychainSearchList();
  if (keychains.length > 0) {
    await run(`security list-keychains -d user -s ${keychains.map(shellQuote).join(' ')} 2>/dev/null || true`);
  }
  const loginKeychain = path.join(process.env.HOME ?? '', 'Library/Keychains/login.keychain-db');
  await run(`security default-keychain -d user -s ${shellQuote(loginKeychain)} 2>/dev/null || true`);
  if (existsSync(loginKeychain)) {
    await run(`security unlock-keychain ${shellQuote(loginKeychain)} 2>/dev/null`, { timeoutMs: 3000 }).catch(() => {});
  }
}

async function configuredUserKeychains() {
  try {
    const output = await capture('security list-keychains -d user 2>/dev/null');
    return output
      .split('\n')
      .map((line) => line.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function releaseKeychainSearchList() {
  const home = process.env.HOME ?? '';
  const candidates = [
    ...(await configuredUserKeychains()),
    path.join(home, 'Library/Keychains/login.keychain-db'),
    path.join(home, 'Library/Keychains/iCloud.keychain-db'),
    '/Library/Keychains/System.keychain',
  ];
  return [...new Set(candidates.filter((keychain) => keychain && existsSync(keychain)))];
}

export function releaseSigningIdentity() {
  return process.env.GHOSTEX_CODE_SIGN_IDENTITY?.trim() || config.signingIdentity;
}

export function gpuiReleaseSigningIdentity() {
  return process.env.GHOSTEX_GPUI_SIGN_IDENTITY?.trim() || releaseSigningIdentity();
}

/**
 * CDXC:Release 2026-05-23-13:10:
 * Release builds must use the Developer ID identity from ghostex-release-to-brew,
 * not ad-hoc detection, and preflight should fail with actionable keychain guidance
 * when the login keychain is locked or the certificate is missing.
 */
async function listCodeSigningIdentities() {
  /*
   CDXC:Release 2026-05-23-16:01:
   Developer ID certificates are not guaranteed to live only in login.keychain-db.
   Release preflight must inspect the aggregate keychain view and configured user keychains before deciding signing is unavailable.
   */
  const chunks = [];
  try {
    chunks.push(`== aggregate ==\n${await capture('security find-identity -v -p codesigning 2>/dev/null')}`);
  } catch (error) {
    chunks.push(`== aggregate failed ==\n${String(error.message ?? error)}`);
  }
  for (const keychain of await releaseKeychainSearchList()) {
    try {
      chunks.push(
        `== ${keychain} ==\n${await capture(`security find-identity -v -p codesigning ${shellQuote(keychain)} 2>/dev/null`)}`
      );
    } catch (error) {
      chunks.push(`== ${keychain} failed ==\n${String(error.message ?? error)}`);
    }
  }
  return chunks.join('\n');
}

function signingIdentityIsVisible(identities) {
  return Boolean(matchingSigningIdentityLine(identities));
}

function matchingSigningIdentityLine(identities) {
  const identity = releaseSigningIdentity();
  return identities.split('\n').find((line) => line.includes(`"${identity}"`) || line.includes(identity));
}

export async function ensureSigningIdentity() {
  await recoverKeychainVisibility();
  const identity = releaseSigningIdentity();
  const identities = await listCodeSigningIdentities();
  if (!signingIdentityIsVisible(identities)) {
    throw new ReleaseError(
      [
        `No valid code signing identity found for release: ${identity}`,
        '',
        identities.trim() || '(security find-identity returned no valid identities)',
      ].join('\n')
    );
  }
  await ensureSigningIdentityCanSign(identity);
}

/**
 * CDXC:Release 2026-05-25-18:22:
 * `security find-identity` can see a Developer ID certificate even when the
 * embedded agent shell cannot use the private key. Probe `codesign` directly so
 * the release delegates to Terminal.app before a long build fails on CEF files
 * with errSecInternalComponent.
 */
async function ensureSigningIdentityCanSign(identity) {
  const probeDir = await mkdtemp(path.join(tmpdir(), 'ghostex-codesign-probe-'));
  const probePath = path.join(probeDir, 'probe.sh');
  try {
    await writeFile(probePath, '#!/bin/sh\nexit 0\n');
    await run(`chmod +x ${shellQuote(probePath)}`);
    await run(`/usr/bin/codesign --force --sign ${shellQuote(identity)} --timestamp=none ${shellQuote(probePath)}`);
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }
}

export async function ensureNotaryProfile() {
  try {
    await run(
      `/bin/zsh -lc ${shellQuote(`set -o pipefail; xcrun notarytool history --keychain-profile ${shellQuote(config.notaryProfile)} | head -n 8`)}`
    );
  } catch (error) {
    throw new ReleaseError(
      [
        `Notary profile ${config.notaryProfile} is unavailable.`,
        '',
        'Fix:',
        '1. Store Apple notarization credentials:',
        '   xcrun notarytool store-credentials notarytool-profile --key <AuthKey.p8> --key-id <KEY_ID> --issuer <ISSUER_ID>',
        '2. Unlock the login keychain, then re-run bun run release:local -- <version>.',
        '',
        String(error.message ?? error),
      ].join('\n')
    );
  }
}
