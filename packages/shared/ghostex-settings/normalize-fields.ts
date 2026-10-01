import { clampCompletionSoundPreference } from '../completion-sound';
import { getGhosttyFontFamilyForPreset, normalizeTerminalFontPreset } from '../terminal-font-preset';
import { DEFAULT_ghostex_SETTINGS } from './defaults';
import {
  AGENTBOX_PROVIDER_IDS,
  AUTO_SLEEP_IDLE_MINUTE_OPTIONS,
  CHAT_FILE_OPEN_VIEW_SET,
  DEFAULT_CHAT_FILE_OPEN_VIEW,
  DEFAULT_MEDIA_FILE_OPEN_TARGET,
  DEFAULT_WEB_LINK_OPEN_TARGET,
  KEEP_AWAKE_DURATION_OPTIONS,
  MAX_WINDOW_GLASS_BLUR_RADIUS,
  MAX_WINDOW_GLASS_LIVE_BRIGHTNESS,
  MAX_WINDOW_GLASS_LIVE_SPEED,
  MIN_WINDOW_GLASS_BLUR_RADIUS,
  MIN_WINDOW_GLASS_LIVE_BRIGHTNESS,
  MIN_WINDOW_GLASS_LIVE_SPEED,
  MEDIA_FILE_OPEN_TARGET_SET,
  WEB_LINK_OPEN_TARGET_SET,
  WINDOW_GLASS_LIVE_STYLE_OPTIONS,
} from './option-tables';
import { clampNumber, isRecord, readLooseString, readNumber, readString } from './primitives';
import { normalizeSessionCardHoverButtons, type SessionCardHoverButtonItem } from '../session-card-hover-actions';
import {
  type AutoSleepIdleMinutes,
  type ChatFileOpenView,
  type CommandsPanelSide,
  type MediaFileOpenTarget,
  type WindowGlassMode,
  type WindowGlassLiveStyle,
  type WindowGlassSource,
  type WindowGlassImagePlacement,
  type PanelAnimationSpeed,
  type DefaultEditorCommand,
  type GhosttyConfirmCloseSurface,
  type GhosttyCopyOnSelect,
  type GhosttyScrollbar,
  type KeepAwakeDurationMinutes,
  type PortlessProtocol,
  type PreferredAgentInterface,
  type PromptEditorBackend,
  type SidebarSpaceSwitchBehavior,
  type SidebarVisibilityMemory,
  type TerminalBackgroundImageFit,
  type TerminalBackgroundMode,
  type TerminalCursorStyle,
  type TerminalViewWidthMode,
  type WebLinkOpenTarget,
  clampWindowGlassSidebarOpacityPercent,
  clampWindowGlassWorkAreaTintPercent,
  migrateWindowGlassWorkAreaTintPercent,
  type ghostexSettings,
} from './types';

export const MIN_GHOSTTY_MOUSE_SCROLL_MULTIPLIER = 0.25;
export const MAX_GHOSTTY_MOUSE_SCROLL_MULTIPLIER = 8;
export const MIN_GHOSTTY_SCROLLBACK_LIMIT_MB = 1;
export const MAX_GHOSTTY_SCROLLBACK_LIMIT_MB = 200;

export function normalizeTitlebarProjectSelectionMap(candidate: unknown): Record<string, string> {
  if (!isRecord(candidate)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [rawProjectId, rawSelection] of Object.entries(candidate).slice(0, 256)) {
    const projectId = rawProjectId.trim();
    const selection = typeof rawSelection === 'string' ? rawSelection.trim() : '';
    if (projectId.length === 0 || projectId.length > 512 || selection.length === 0 || selection.length > 512) {
      continue;
    }
    normalized[projectId] = selection;
  }
  return normalized;
}

export function normalizeTerminalViewWidthMode(source: Record<string, unknown>): TerminalViewWidthMode {
  const candidate = source.terminalViewWidthMode;
  if (candidate === 'full' || candidate === 'match-chat' || candidate === 'custom') {
    return candidate;
  }
  // The removed boolean had only two states. Preserve its explicit narrow
  // state as Custom; its old default false migrates to the current default.
  return source.terminalNarrowerViewEnabled === true ? 'custom' : DEFAULT_ghostex_SETTINGS.terminalViewWidthMode;
}

export function normalizeManageAdditionalDocsFolders(value: string | undefined): string {
  /*
   * CDXC:Docs 2026-06-30-19:47:
   * The Projects setting is typed as comma-separated text because folder names may contain spaces. Settings normalizes on every keystroke, so preserve the user's draft text here and let native trim comma boundaries and reject unsafe path shapes when scanning.
   */
  return (value ?? '').replace(/\0/gu, '').replace(/\r?\n/gu, ', ').slice(0, 1_000);
}

/*
 * CDXC:Projects 2026-08-02:
 * Each Global Default normalizes exactly like the per-project field it backs, so
 * a value that is valid globally is also valid when a project stores it. The
 * worktree cap matches the 16384-byte limit gxserver enforces on the project
 * field, and the ticket key matches the three-character A-Z0-9 shape the
 * Projects page already forces while typing.
 */
export function normalizeGlobalWorktreeCommand(value: string | undefined): string {
  return (value ?? '').replace(/\0/gu, '').slice(0, 16_384);
}

export function normalizeGlobalBeadsDisplayKey(value: string | undefined): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/gu, '')
    .slice(0, 3);
}

export function normalizeGlobalBeadsDirectory(value: string | undefined): string {
  return (value ?? '').replace(/\0/gu, '').trim().slice(0, 1_000);
}

/*
 * CDXC:Docs 2026-08-09:
 * The Docs directory normalizes exactly like the Beads directory it sits next
 * to: one absolute folder path, trimmed, with no embedded NULs.
 */
export function normalizeGlobalDocsDirectory(value: string | undefined): string {
  return (value ?? '').replace(/\0/gu, '').trim().slice(0, 1_000);
}

/**
 * Settings files written before 2026-09-12 carry the `showCloseButtonOnSessionCards` boolean instead of the
 * hover-button strip. A saved `false` there meant "no hover buttons at all", so every button starts disabled;
 * anything else keeps the shipped default. The strip wins whenever it is present.
 */
export function normalizeSessionCardHoverButtonsSetting(
  source: Record<string, unknown>
): readonly SessionCardHoverButtonItem[] {
  if (Array.isArray(source.sessionCardHoverButtons)) {
    return normalizeSessionCardHoverButtons(source.sessionCardHoverButtons);
  }
  if (source.showCloseButtonOnSessionCards === false) {
    return normalizeSessionCardHoverButtons([]);
  }
  return DEFAULT_ghostex_SETTINGS.sessionCardHoverButtons;
}

export function normalizeTerminalCursorStyle(value: string | undefined): TerminalCursorStyle {
  return value === 'block' || value === 'underline' ? value : 'bar';
}

export function normalizeWindowsWslDistribution(value: string | undefined): string {
  return (value ?? '').replace(/\0/gu, '').replace(/\r?\n/gu, '').trim().slice(0, 128);
}

export function normalizeDefaultEditorCommand(value: string | undefined): DefaultEditorCommand {
  return value === 'code-insiders' ||
    value === 'zed' ||
    value === 'zeditor' ||
    value === 'cursor' ||
    value === 'windsurf' ||
    value === 'codium' ||
    value === 'subl' ||
    value === 'other'
    ? value
    : DEFAULT_ghostex_SETTINGS.defaultEditorCommand;
}

export function normalizeCustomDefaultEditorCommand(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 240);
}

/*
 * CDXC:Icons 2026-06-26-23:42:
 * Empty string means default icon; otherwise the persisted id must remain a
 * filename-only value that round-trips exactly after native confirms it. Reject
 * invalid/path-like ids instead of slicing or otherwise rewriting them.
 */
export function normalizeAppIconSourceId(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  if (normalized.length === 0) {
    return '';
  }
  if (normalized.length > 255) {
    return '';
  }
  if (normalized === '.' || normalized === '..') {
    return '';
  }
  if (normalized.includes('/') || normalized.includes('\\') || normalized.includes('\0')) {
    return '';
  }
  return normalized;
}

export function normalizeDefaultPromptAgentId(value: string | undefined): string {
  return ((value ?? '').trim() || DEFAULT_ghostex_SETTINGS.defaultPromptAgentId).slice(0, 120);
}

/** A remote Docker alias agentbox accepts (`agentbox remote-docker add <alias> <ssh>`). */
const AGENTBOX_REMOTE_DOCKER_ALIAS_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * `local`, `agentbox:<provider>` for a known provider, or `agentbox:docker:<alias>`; anything
 * else is `local`. The desktop reads the same rule in `normalize_agentbox_location`
 * (apps/desktop/src/shared_settings/normalize.rs).
 */
export function normalizeAgentboxDefaultLocation(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed.startsWith('agentbox:')) {
    return DEFAULT_ghostex_SETTINGS.agentboxDefaultLocation;
  }
  const provider = trimmed.slice('agentbox:'.length);
  if ((AGENTBOX_PROVIDER_IDS as readonly string[]).includes(provider)) {
    return trimmed;
  }
  if (provider.startsWith('docker:') && AGENTBOX_REMOTE_DOCKER_ALIAS_PATTERN.test(provider.slice('docker:'.length))) {
    return trimmed;
  }
  return DEFAULT_ghostex_SETTINGS.agentboxDefaultLocation;
}

/*
 * CDXC:Navigation 2026-08-19:
 * Two settings answered "where does this web link open" and could disagree:
 * the Browser toggle openTerminalLinksInApp (default on) and the Dev Servers
 * dropdown terminalDevServerOpenTarget (default system browser). They merge
 * into one target, so migration has to pick a winner for existing installs.
 * The toggle wins: it is the switch users actually flipped and the one the
 * in-app toast points at, while nearly every install carries the dev-server
 * default it never chose. Reading that field first would silently move
 * everyone off the embedded browser.
 */
export function normalizeWebLinkOpenTarget(source: Record<string, unknown>): WebLinkOpenTarget {
  const value = readLooseString(source.webLinkOpenTarget);
  if (WEB_LINK_OPEN_TARGET_SET.has(value as WebLinkOpenTarget)) {
    return value as WebLinkOpenTarget;
  }

  const legacyOpenLinksInApp = source.openTerminalLinksInApp;
  if (typeof legacyOpenLinksInApp === 'boolean') {
    return legacyOpenLinksInApp ? 'internal-browser' : 'system-default-browser';
  }

  const legacyDevServerTarget = readLooseString(source.terminalDevServerOpenTarget);
  if (WEB_LINK_OPEN_TARGET_SET.has(legacyDevServerTarget as WebLinkOpenTarget)) {
    return legacyDevServerTarget as WebLinkOpenTarget;
  }

  /*
   * readLooseString returns "" for a missing key, not undefined, so this has to
   * test for content. The predecessor compared against undefined and therefore
   * matched every install; it went unnoticed only because it returned the value
   * that was already the default.
   */
  if (readLooseString(source.terminalDevServerDefaultBrowserId).length > 0) {
    return 'system-default-browser';
  }

  return DEFAULT_WEB_LINK_OPEN_TARGET;
}

export function normalizeMediaFileOpenTarget(value: unknown): MediaFileOpenTarget {
  const normalized = readLooseString(value);
  return MEDIA_FILE_OPEN_TARGET_SET.has(normalized as MediaFileOpenTarget)
    ? (normalized as MediaFileOpenTarget)
    : DEFAULT_MEDIA_FILE_OPEN_TARGET;
}

export function normalizeChatFileOpenView(value: unknown): ChatFileOpenView {
  const normalized = readLooseString(value);
  return CHAT_FILE_OPEN_VIEW_SET.has(normalized as ChatFileOpenView)
    ? (normalized as ChatFileOpenView)
    : DEFAULT_CHAT_FILE_OPEN_VIEW;
}

export function getDefaultEditorCommandForSettings(settings: ghostexSettings): string {
  const customCommand = settings.customDefaultEditorCommand.trim();
  return settings.defaultEditorCommand === 'other'
    ? customCommand || DEFAULT_ghostex_SETTINGS.defaultEditorCommand
    : settings.defaultEditorCommand;
}

export function normalizeCommandsPanelSide(value: string | undefined): CommandsPanelSide {
  return value === 'right' ? 'right' : DEFAULT_ghostex_SETTINGS.commandsPanelSide;
}

export function normalizeWindowGlassMode(value: string | undefined): WindowGlassMode {
  return value === 'frosted' || value === 'opaque' ? value : DEFAULT_ghostex_SETTINGS.windowGlass;
}

/**
 * CDXC:Theming 2026-09-26 WHY:
 * Glass shows no longer has a separate Video choice: the user's own video is a Live slot. A settings file saved with
 * Video becomes Live, and each mode that had a playable file keeps it as its own video (`normalizeWindowGlassLiveSlot`).
 */
export function normalizeWindowGlassSource(value: string | undefined): WindowGlassSource {
  if (value === 'video') {
    return 'live';
  }
  return value === 'wallpaper' || value === 'desktopAndWindows' || value === 'customImage' || value === 'live'
    ? value
    : DEFAULT_ghostex_SETTINGS.windowGlassSource;
}

/**
 * CDXC:Theming 2026-09-26 WHY:
 * A glass video is only a file the user picked. macOS's aerial wallpapers and the Ghostex video library were
 * removed, so a saved `aerial:<id>` or `library:<id>` is cleared: that mode's Live slot shows its animation instead
 * (this migrates a removed value; it is not a runtime fallback).
 */
export function normalizeWindowGlassVideoPath(value: string | undefined): string {
  const path = (value ?? '').trim();
  return path.startsWith('aerial:') || path.startsWith('library:') ? '' : path;
}

/** One mode's Live slot: an animation, or `video` for the user's own file (carried over from the retired Video choice). */
export function normalizeWindowGlassLiveSlot(
  source: Record<string, unknown>,
  appearance: 'Dark' | 'Light'
): WindowGlassLiveStyle {
  const fallback = DEFAULT_ghostex_SETTINGS[`windowGlassLiveStyle${appearance}`];
  const saved = readString(source, `windowGlassLiveStyle${appearance}`, fallback);
  if (readString(source, 'windowGlassSource', '') === 'video') {
    const video = normalizeWindowGlassVideoPath(readString(source, `windowGlassVideo${appearance}`, ''));
    if (video) {
      return 'video';
    }
  }
  if (saved === 'video') {
    return 'video';
  }
  return WINDOW_GLASS_LIVE_STYLE_OPTIONS.some((option) => option.value === saved)
    ? (saved as WindowGlassLiveStyle)
    : fallback;
}

/** Live glass brightness, 10 to 100 percent in whole steps. */
export function normalizeWindowGlassLiveBrightness(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ghostex_SETTINGS.windowGlassLiveBrightness;
  }
  return Math.round(Math.min(MAX_WINDOW_GLASS_LIVE_BRIGHTNESS, Math.max(MIN_WINDOW_GLASS_LIVE_BRIGHTNESS, value)));
}

/** Glass and menu blur radius, 0 to 100 points in whole steps. */
export function normalizeWindowGlassBlurRadius(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(Math.min(MAX_WINDOW_GLASS_BLUR_RADIUS, Math.max(MIN_WINDOW_GLASS_BLUR_RADIUS, value)));
}

/** Live glass speed, 0.25 to 2 in quarter steps. */
export function normalizeWindowGlassLiveSpeed(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ghostex_SETTINGS.windowGlassLiveSpeed;
  }
  const clamped = Math.min(MAX_WINDOW_GLASS_LIVE_SPEED, Math.max(MIN_WINDOW_GLASS_LIVE_SPEED, value));
  return Math.round(clamped * 4) / 4;
}

export function normalizeWindowGlassImagePlacement(value: string | undefined): WindowGlassImagePlacement {
  return value === 'static' || value === 'desktop' ? value : DEFAULT_ghostex_SETTINGS.windowGlassImagePlacement;
}

export function normalizePanelAnimationSpeed(value: string | undefined): PanelAnimationSpeed {
  return value === 'off' || value === 'slow' || value === 'normal' || value === 'fast'
    ? value
    : DEFAULT_ghostex_SETTINGS.panelAnimationSpeed;
}

export function normalizeSidebarSpaceSwitchBehavior(value: string | undefined): SidebarSpaceSwitchBehavior {
  return value === 'restore' || value === 'keep' ? value : DEFAULT_ghostex_SETTINGS.sidebarSpaceSwitchBehavior;
}

export function normalizeSidebarVisibilityMemory(value: string | undefined): SidebarVisibilityMemory {
  return value === 'shared' || value === 'perView' ? value : DEFAULT_ghostex_SETTINGS.sidebarVisibilityMemory;
}

/* Both spellings are real user choices: normalizing "terminal" to the default
   would silently re-enable the automatic Chat handoff for a user who explicitly
   turned it off. Only unknown or missing values fall back to the default. */
export function normalizePreferredAgentInterface(value: string | undefined): PreferredAgentInterface {
  return value === 'chat' || value === 'terminal' ? value : DEFAULT_ghostex_SETTINGS.preferredAgentInterface;
}

/* Per-agent overrides are user-visible state that a user can also hand-edit, so
   normalization drops anything it does not recognize instead of substituting a
   default. An unrecognized value must not become "chat": that would force an
   agent into a view the user never chose. Keys are kept verbatim because they
   are agent ids, including ids of custom agents this build has never seen. */
export function normalizePreferredAgentInterfaceOverrides(
  value: unknown
): Readonly<Record<string, PreferredAgentInterface>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return DEFAULT_ghostex_SETTINGS.preferredAgentInterfaceOverrides;
  }
  const normalized: Record<string, PreferredAgentInterface> = {};
  for (const [agentId, preferredInterface] of Object.entries(value as Record<string, unknown>)) {
    if (agentId.trim().length === 0) {
      continue;
    }
    if (preferredInterface === 'chat' || preferredInterface === 'terminal') {
      normalized[agentId] = preferredInterface;
    }
  }
  return normalized;
}

export function normalizeKeepAwakeDurationMinutes(value: number): KeepAwakeDurationMinutes {
  return KEEP_AWAKE_DURATION_OPTIONS.some((option) => option.value === value)
    ? (value as KeepAwakeDurationMinutes)
    : DEFAULT_ghostex_SETTINGS.keepAwakeDefaultDurationMinutes;
}

export function normalizeAutoSleepIdleMinutes(
  source: Record<string, unknown>,
  idleMinutesKey: string,
  legacyEnabledKey: string,
  fallback: AutoSleepIdleMinutes,
  legacyEnabledFallback: AutoSleepIdleMinutes
): AutoSleepIdleMinutes {
  const legacyEnabled = source[legacyEnabledKey];
  if (legacyEnabled === false) {
    return 0;
  }
  const effectiveFallback = legacyEnabled === true ? legacyEnabledFallback : fallback;
  const storedValue = source[idleMinutesKey];
  const value = typeof storedValue === 'number' && Number.isFinite(storedValue) ? storedValue : effectiveFallback;
  return AUTO_SLEEP_IDLE_MINUTE_OPTIONS.some((option) => option.value === value)
    ? (value as AutoSleepIdleMinutes)
    : effectiveFallback;
}

export function normalizeKeepAwakeBatteryThresholdPercent(source: Record<string, unknown>): number {
  if (source.keepAwakeDeactivateBelowBatteryThreshold === false) {
    return 0;
  }
  const fallback = source.keepAwakeDeactivateBelowBatteryThreshold === true ? 20 : 0;
  const value = readNumber(source, 'keepAwakeBatteryThresholdPercent', fallback);
  return value === 0 ? 0 : clampNumber(value, 10, 90, fallback || 20);
}

export function normalizeCompletionSoundPreference(source: Record<string, unknown>) {
  if (source.completionBellEnabled === false) {
    return 'off' as const;
  }
  return clampCompletionSoundPreference(
    readString(source, 'completionSound', DEFAULT_ghostex_SETTINGS.completionSound)
  );
}

export function normalizePromptEditorBackend(source: Record<string, unknown>): PromptEditorBackend {
  const backend = readString(source, 'promptEditorBackend', '');
  if (backend === 'inherit' || backend === 'monaco') {
    return backend;
  }
  if (backend === 'gte' || backend === 'custom') {
    return 'inherit';
  }
  if (source.useGteForCtrlGPromptEditing === true || source.richPromptEditingWithGte === true) {
    return 'inherit';
  }
  return DEFAULT_ghostex_SETTINGS.promptEditorBackend;
}

export function normalizeGhosttyTheme(value: string | undefined): string {
  if (!value || value === '__ghostex_ghostty_theme_unmanaged__') {
    return '';
  }
  return /[\r\n\0]/u.test(value) ? '' : value.trim();
}

export function normalizeGhosttyFontFamily(value: string | undefined): string {
  const trimmedValue = (value ?? '').trim();
  if (!trimmedValue) {
    return '';
  }
  const legacyPreset = normalizeTerminalFontPreset(trimmedValue);
  if (legacyPreset === trimmedValue) {
    return getGhosttyFontFamilyForPreset(legacyPreset);
  }
  return trimmedValue;
}

export function normalizeGhosttyCopyOnSelect(value: string | undefined): GhosttyCopyOnSelect {
  return value === 'true' || value === 'clipboard' ? value : DEFAULT_ghostex_SETTINGS.terminalCopyOnSelect;
}

export function normalizeGhosttyConfirmCloseSurface(value: string | undefined): GhosttyConfirmCloseSurface {
  return value === 'false' || value === 'true' || value === 'always'
    ? value
    : DEFAULT_ghostex_SETTINGS.terminalConfirmCloseSurface;
}

export function normalizeGhosttyScrollbar(value: string | undefined): GhosttyScrollbar {
  return value === 'never' ? 'never' : 'system';
}

export function normalizeTerminalBackgroundImageFit(value: string | undefined): TerminalBackgroundImageFit {
  return value === 'contain' || value === 'stretch' || value === 'natural'
    ? value
    : DEFAULT_ghostex_SETTINGS.terminalBackgroundImageFit;
}

export function normalizePortlessProtocol(value: string | undefined): PortlessProtocol {
  return value === 'http' || value === 'https' ? value : DEFAULT_ghostex_SETTINGS.portlessProtocol;
}

/**
 * The work area's glass tint. Settings saved before the sidebar and work area tints were made
 * independent hold `windowGlassMainOpacity*`, an extra layer over the sidebar tint; the combined
 * coverage becomes the work area's own tint so its look carries over unchanged.
 */
export function normalizeWindowGlassWorkAreaTint(
  source: Record<string, unknown>,
  appearance: 'Dark' | 'Light'
): number {
  const key = `windowGlassWorkAreaTint${appearance}` as const;
  const fallback = DEFAULT_ghostex_SETTINGS[key];
  if (typeof source[key] === 'number') {
    return clampWindowGlassWorkAreaTintPercent(source[key], fallback);
  }
  const extra = source[`windowGlassMainOpacity${appearance}`];
  if (typeof extra !== 'number' || !Number.isFinite(extra)) {
    return fallback;
  }
  const sidebarKey = `windowGlassSidebarOpacity${appearance}` as const;
  const sidebar = clampWindowGlassSidebarOpacityPercent(
    readNumber(source, sidebarKey, DEFAULT_ghostex_SETTINGS[sidebarKey]),
    DEFAULT_ghostex_SETTINGS[sidebarKey]
  );
  return clampWindowGlassWorkAreaTintPercent(migrateWindowGlassWorkAreaTintPercent(sidebar, extra), fallback);
}

/** SEE-ALSO: `terminal_background_mode` in apps/desktop/src/shared_settings/normalize.rs applies the same migration. */
export function normalizeTerminalBackgroundMode(source: Record<string, unknown>): TerminalBackgroundMode {
  const value = source.terminalBackgroundMode;
  if (value === 'pure' || value === 'theme' || value === 'custom') {
    return value;
  }
  const legacyColor = normalizeTerminalBackgroundSetting(readString(source, 'workspaceBackgroundColor', ''));
  return legacyColor === '' ? DEFAULT_ghostex_SETTINGS.terminalBackgroundMode : 'custom';
}

/** `workspaceBackgroundColor`: the Custom terminal background; the retired default #010101 reads as unset. */
export function normalizeTerminalBackgroundSetting(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === '#010101' ? '' : trimmed;
}
