import {
  resolveSettingsModalTabForVisibility,
  type SettingsModalTab,
  type SettingsModalTabVisibilityOptions,
} from '../settings-modal-tabs';
import { type SettingsModalNavigationState } from '../../shared/ghostex-settings';
import { getRememberedSettingsModalTab } from './navigation-memory';

export function getInitialSettingsModalTab(
  initialTab: SettingsModalTab,
  visibility: SettingsModalTabVisibilityOptions,
  storedNavigation: SettingsModalNavigationState,
  showAdvancedSettings: boolean
): SettingsModalTab {
  /**
   * CDXC:Settings 2026-05-11-09:06
   * Settings remembers the last selected tab during the current app session. A
   * non-default entry point such as Hotkeys still opens its requested tab, then
   * that tab becomes the remembered choice for later ordinary Settings opens.
   *
   * CDXC:Settings 2026-06-29-17:54:
   * Ordinary Settings opens should also restore the last closed Settings tab
   * from durable macOS settings storage after an app relaunch. Explicit entry
   * points still win so menu actions and deep links land on the requested page.
   */
  const rememberedTab = initialTab === 'settings' ? getRememberedSettingsModalTab(storedNavigation) : undefined;
  // A remembered Debugging page stays closed while Show Advanced hides it from the rail; `ghostex settings open --tab debugging` still opens it.
  const requestedTab =
    initialTab !== 'settings'
      ? initialTab
      : rememberedTab === 'debugging' && !showAdvancedSettings
        ? initialTab
        : (rememberedTab ?? initialTab);
  return resolveSettingsModalTabForVisibility(requestedTab, visibility);
}

export function hasActiveHotkeyRecorder(): boolean {
  return Boolean(document.querySelector("[data-hotkey-recorder='true'][data-recording='true']"));
}

export function isEditableSettingsModalEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function isEditableSettingsModalElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}
