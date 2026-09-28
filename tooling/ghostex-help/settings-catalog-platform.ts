/**
 * CDXC:Settings 2026-09-28 WHY:
 * The native Settings catalog is exported once per desktop platform because the Settings modules compute platform text at module load (shortcut labels, the Windows terminal rows, the macOS copy-on-select options). Select the platform named on the command line before any Settings module is imported.
 */
const platform = process.argv[2];
const navigatorByPlatform: Record<string, { platform: string; userAgent: string }> = {
  linux: { platform: 'Linux x86_64', userAgent: 'Ghostex settings catalog (X11; Linux x86_64)' },
  macos: { platform: 'MacIntel', userAgent: 'Ghostex settings catalog (Macintosh)' },
  windows: { platform: 'Win32', userAgent: 'Ghostex settings catalog (Windows NT 10.0)' },
};
const selected = platform ? navigatorByPlatform[platform] : undefined;
if (!selected) {
  throw new Error(`settings-catalog-export: expected one of macos, windows, linux; got ${String(platform)}`);
}
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: selected,
});
export {};
