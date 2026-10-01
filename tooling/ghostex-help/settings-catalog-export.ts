/*
 * CDXC:Settings 2026-09-28 WHY:
 * The native GPUI Settings modal reads the same search rows, option tables, defaults and ranges as the React one, so nothing is hand-copied into Rust. This script prints them as JSON for one platform (`bun settings-catalog-export.ts macos|windows|linux`); `generate.ts` runs it for each platform and writes `apps/desktop/src/app/window/settings_modal/catalog/settings-catalog.generated.json` (the macOS catalog plus the leaf values that differ on Windows and Linux), and `cargo xtask help-check` (part of `cargo xtask typecheck`) fails when that file is stale.
 * SEE-ALSO: packages/core-ui/settings-modal/search-catalog.ts, packages/core-ui/settings-modal/search.ts, apps/desktop/src/app/window/settings_modal/catalog.rs, docs/2026-09-28/gpui-modals-migration/SETTINGS-ARCH.md.
 */
import './settings-catalog-platform';
import * as agentAccounts from '../../packages/shared/agent-accounts';
import * as completionSound from '../../packages/shared/completion-sound';
import * as ghostexAgentSkills from '../../packages/shared/ghostex-agent-skills';
import * as ghosttyConfigActions from '../../packages/shared/ghostty-config-actions';
import * as ghostexHotkeys from '../../packages/shared/ghostex-hotkeys';
import * as ghostexOfficialExtensions from '../../packages/shared/ghostex-official-extensions';
import * as ghostexSettings from '../../packages/shared/ghostex-settings';
import * as projectViews from '../../packages/shared/ghostex-settings/project-views';
import {
  CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_CALIBRATION_COLOR,
  CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_DARK_TINTS,
  CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_LIGHT_TINTS,
  CUSTOM_SIDEBAR_TITLEBAR_LIGHT_BACKGROUND_CALIBRATION_COLOR,
} from '../../packages/shared/ghostex-settings/titlebar-color';
import * as pets from '../../packages/shared/pets';
import * as sessionCardHoverActions from '../../packages/shared/session-card-hover-actions';
import * as sessionTags from '../../packages/shared/session-tags';
import * as sidebarAgentAcceptAll from '../../packages/shared/sidebar-agent-accept-all';
import * as sidebarAgents from '../../packages/shared/sidebar-agents';
import * as sidebarCommands from '../../packages/shared/sidebar-commands';
import * as terminalFontPreset from '../../packages/shared/terminal-font-preset';
import * as workspaceOpenTargets from '../../packages/shared/workspace-open-targets';
import * as settingsSearch from '../../packages/core-ui/settings-modal/search';
import * as settingsSearchCatalog from '../../packages/core-ui/settings-modal/search-catalog';
import * as settingsTypes from '../../packages/core-ui/settings-modal/types';
import { formatSidebarHotkeyLabel } from '../../packages/shared/hotkey-label';

const GENERATOR_PATH = 'tooling/ghostex-help/settings-catalog-export.ts';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A JSON copy of `value`, or undefined when it holds a function or class instance other than Set/Map. */
function toJson(value: unknown): Json | undefined {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value instanceof Set) {
    return toJson([...value]);
  }
  if (value instanceof Map) {
    return toJson(Object.fromEntries(value));
  }
  if (Array.isArray(value)) {
    const items: Json[] = [];
    for (const item of value) {
      const json = toJson(item);
      if (json === undefined) {
        return undefined;
      }
      items.push(json);
    }
    return items;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) {
        continue;
      }
      const json = toJson(item);
      if (json === undefined) {
        return undefined;
      }
      record[key] = json;
    }
    return record;
  }
  return undefined;
}

/** Every data export of a module (constants, option tables, sets), sorted by name; functions are left out. */
function moduleData(module: Record<string, unknown>): { [key: string]: Json } {
  const data: { [key: string]: Json } = {};
  for (const name of Object.keys(module).sort()) {
    const json = toJson(module[name]);
    if (json !== undefined) {
      data[name] = json;
    }
  }
  return data;
}

function sectionRows(settings: readonly settingsTypes.SettingSearchDefinition[]) {
  return settings.map((setting) => ({
    key: setting.key,
    title: setting.title,
    ...(setting.subtitle ? { subtitle: setting.subtitle } : {}),
    ...(setting.options?.length
      ? { options: setting.options.map((option) => ({ label: option.label, value: option.value })) }
      : {}),
    ...(setting.advanced ? { advanced: true } : {}),
  }));
}

const generalDefinitions = settingsSearchCatalog.getSettingsSearchSectionDefinitions();
const generalSearch = settingsSearchCatalog.getSettingsSearchSections('', ghostexSettings.DEFAULT_ghostex_SETTINGS);
const generalNavigation = settingsSearchCatalog.getMainSettingsSectionNavigation(
  settingsSearchCatalog.getMainSettingsGroupSearch('', generalSearch)
);

const catalog = {
  version: 1,
  generatedBy: GENERATOR_PATH,
  platform: process.argv[2],
  general: {
    sections: Object.entries(generalDefinitions).map(([id, section]) => ({
      id,
      title: section.title,
      settings: sectionRows(section.settings),
    })),
    groups: Object.entries(settingsSearchCatalog.MAIN_SETTINGS_GROUP_SECTIONS).map(([id, group]) => ({
      id,
      title: group.title,
      sections: [...group.sections],
    })),
    navigation: generalNavigation.map((item) => ({ id: item.id, title: item.title })),
  },
  extraTabs: Object.entries(settingsSearch.EXTRA_SETTINGS_TAB_SEARCH_SECTIONS).map(([id, tab]) => ({
    id,
    title: tab.title,
    sections: tab.sections.map((section) => ({
      id: section.id,
      title: section.title,
      settings: sectionRows(section.settings),
    })),
  })),
  hotkeys: {
    definitions: ghostexHotkeys.GHOSTEX_HOTKEY_DEFINITIONS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      description: definition.description,
      defaultKey: definition.defaultKey,
      defaultKeyLabel: definition.defaultKey ? formatSidebarHotkeyLabel(definition.defaultKey) : '',
      ...(definition.windowsLinuxDefaultKey ? { windowsLinuxDefaultKey: definition.windowsLinuxDefaultKey } : {}),
    })),
  },
  modules: {
    'core-ui/settings-modal/search-catalog': moduleData(settingsSearchCatalog),
    'core-ui/settings-modal/types': moduleData(settingsTypes),
    'shared/agent-accounts': moduleData(agentAccounts),
    'shared/completion-sound': moduleData(completionSound),
    'shared/ghostex-agent-skills': moduleData(ghostexAgentSkills),
    'shared/ghostex-hotkeys': moduleData(ghostexHotkeys),
    'shared/ghostex-official-extensions': moduleData(ghostexOfficialExtensions),
    'shared/ghostex-settings': moduleData(ghostexSettings),
    'shared/ghostex-settings/project-views': moduleData(projectViews),
    // The chrome tint calibration the native Theme page draws its colour squares and preview with.
    'shared/ghostex-settings/titlebar-color': moduleData({
      CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_CALIBRATION_COLOR,
      CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_DARK_TINTS,
      CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_LIGHT_TINTS,
      CUSTOM_SIDEBAR_TITLEBAR_LIGHT_BACKGROUND_CALIBRATION_COLOR,
    }),
    'shared/ghostty-config-actions': moduleData(ghosttyConfigActions),
    'shared/pets': moduleData(pets),
    'shared/session-card-hover-actions': moduleData(sessionCardHoverActions),
    'shared/session-tags': moduleData(sessionTags),
    'shared/sidebar-agent-accept-all': moduleData(sidebarAgentAcceptAll),
    'shared/sidebar-agents': moduleData(sidebarAgents),
    'shared/sidebar-commands': moduleData(sidebarCommands),
    'shared/terminal-font-preset': moduleData(terminalFontPreset),
    'shared/workspace-open-targets': moduleData(workspaceOpenTargets),
  },
  labels: {
    'cmd+shift+,': formatSidebarHotkeyLabel('cmd+shift+,'),
    'ctrl+g': formatSidebarHotkeyLabel('ctrl+g'),
    'alt+p': formatSidebarHotkeyLabel('alt+p'),
  },
};

process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
