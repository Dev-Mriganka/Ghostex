//! The Settings modal's search rows, option tables, defaults and ranges, read from the catalog the
//! Help generator writes from the React Settings sources.
//!
//! CDXC:Settings 2026-09-28 WHY:
//! `packages/core-ui/settings-modal/search-catalog.ts` stays the one source of the Settings search rows (the Help generator reads it too), so the native modal embeds `catalog/settings-catalog.generated.json` instead of a Rust copy that could drift. `cargo xtask help-generate` rewrites it and `cargo xtask typecheck` fails while it is stale. The file keeps the macOS catalog whole and the leaf values that differ on Windows and Linux, which are applied here for the platform this binary was built for.
//! SEE-ALSO: tooling/ghostex-help/settings-catalog-export.ts, tooling/ghostex-help/generate.ts, docs/2026-09-28/gpui-modals-migration/SETTINGS-ARCH.md.
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("catalog/settings-catalog.generated.json");

/// The generated module names under `modules` in the catalog.
pub(crate) mod module {
    pub(crate) const SEARCH_CATALOG: &str = "core-ui/settings-modal/search-catalog";
    pub(crate) const SETTINGS_TYPES: &str = "core-ui/settings-modal/types";
    pub(crate) const COMPLETION_SOUND: &str = "shared/completion-sound";
    pub(crate) const SETTINGS: &str = "shared/ghostex-settings";
    pub(crate) const GHOSTTY_CONFIG_ACTIONS: &str = "shared/ghostty-config-actions";
    pub(crate) const PETS: &str = "shared/pets";
    pub(crate) const SESSION_CARD_HOVER_ACTIONS: &str = "shared/session-card-hover-actions";
    pub(crate) const SESSION_TAGS: &str = "shared/session-tags";
    pub(crate) const SIDEBAR_AGENT_ACCEPT_ALL: &str = "shared/sidebar-agent-accept-all";
    pub(crate) const SIDEBAR_AGENTS: &str = "shared/sidebar-agents";
    pub(crate) const SIDEBAR_COMMANDS: &str = "shared/sidebar-commands";
    pub(crate) const TERMINAL_FONT_PRESET: &str = "shared/terminal-font-preset";
    pub(crate) const AGENT_ACCOUNTS: &str = "shared/agent-accounts";
    pub(crate) const OFFICIAL_EXTENSIONS: &str = "shared/ghostex-official-extensions";
    pub(crate) const PROJECT_VIEWS: &str = "shared/ghostex-settings/project-views";
}

/// One `{ label, value }` option. Numeric option values are kept as the string the React
/// select used (`String(option.value)`).
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct SettingOption {
    pub(crate) label: String,
    pub(crate) value: String,
}

/// One searchable row (`SettingSearchDefinition`).
#[derive(Clone, Debug)]
pub(crate) struct SettingRowDef {
    pub(crate) key: String,
    pub(crate) title: String,
    pub(crate) subtitle: String,
    pub(crate) options: Vec<SettingOption>,
    pub(crate) advanced: bool,
}

/// A titled list of searchable rows: a General section, or one section of another page.
#[derive(Clone, Debug)]
pub(crate) struct SearchSectionDef {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) settings: Vec<SettingRowDef>,
}

/// A General rail group (`MAIN_SETTINGS_GROUP_SECTIONS`).
#[derive(Clone, Debug)]
pub(crate) struct GeneralGroupDef {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) sections: Vec<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct NavItemDef {
    pub(crate) id: String,
    pub(crate) title: String,
}

/// A searchable page other than General, Theme and Hotkeys (`EXTRA_SETTINGS_TAB_SEARCH_SECTIONS`).
#[derive(Clone, Debug)]
pub(crate) struct ExtraTabDef {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) sections: Vec<SearchSectionDef>,
}

/// One hotkey action (`GHOSTEX_HOTKEY_DEFINITIONS`), with its default formatted for this platform.
#[derive(Clone, Debug)]
pub(crate) struct HotkeyDef {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) default_key: String,
    pub(crate) default_key_label: String,
    pub(crate) windows_linux_default_key: Option<String>,
}

pub(crate) struct SettingsCatalog {
    pub(crate) general_sections: Vec<SearchSectionDef>,
    pub(crate) general_groups: Vec<GeneralGroupDef>,
    /// The General rail groups in rendered order.
    pub(crate) general_navigation: Vec<NavItemDef>,
    pub(crate) extra_tabs: Vec<ExtraTabDef>,
    pub(crate) hotkeys: Vec<HotkeyDef>,
    modules: Map<String, Value>,
    labels: Map<String, Value>,
    defaults: Map<String, Value>,
    advanced_keys: HashSet<String>,
}

/// The catalog for this build's platform, parsed once.
pub(crate) fn settings_catalog() -> &'static SettingsCatalog {
    static CATALOG: OnceLock<SettingsCatalog> = OnceLock::new();
    CATALOG.get_or_init(|| SettingsCatalog::parse(CATALOG_JSON))
}

fn current_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

/// `String(value)` for a JSON option value.
pub(crate) fn js_value_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => js_number_string(number.as_f64().unwrap_or_default()),
        Value::Bool(flag) => flag.to_string(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// `String(number)` for the finite numbers the settings use.
pub(crate) fn js_number_string(number: f64) -> String {
    if number.fract() == 0.0 && number.abs() < 1e15 {
        format!("{}", number as i64)
    } else {
        let text = format!("{number}");
        if text.contains('e') {
            text
        } else {
            text.trim_end_matches('0').trim_end_matches('.').to_string()
        }
    }
}

fn text(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn parse_options(value: Option<&Value>) -> Vec<SettingOption> {
    value
        .and_then(Value::as_array)
        .map(|options| {
            options
                .iter()
                .filter_map(|option| {
                    Some(SettingOption {
                        label: text(option.get("label")),
                        value: js_value_string(option.get("value")?),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_rows(value: Option<&Value>) -> Vec<SettingRowDef> {
    value
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .map(|row| SettingRowDef {
                    key: text(row.get("key")),
                    title: text(row.get("title")),
                    subtitle: text(row.get("subtitle")),
                    options: parse_options(row.get("options")),
                    advanced: row.get("advanced").and_then(Value::as_bool) == Some(true),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_sections(value: Option<&Value>) -> Vec<SearchSectionDef> {
    value
        .and_then(Value::as_array)
        .map(|sections| {
            sections
                .iter()
                .map(|section| SearchSectionDef {
                    id: text(section.get("id")),
                    title: text(section.get("title")),
                    settings: parse_rows(section.get("settings")),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Replaces the value at `path` (object keys and array indexes) with `replacement`.
fn apply_override(root: &mut Value, path: &[Value], replacement: Value) {
    let mut target = root;
    for segment in path {
        let next = match (segment, target) {
            (Value::String(key), Value::Object(object)) => object.get_mut(key),
            (Value::Number(index), Value::Array(items)) => index
                .as_u64()
                .and_then(|index| items.get_mut(index as usize)),
            _ => None,
        };
        let Some(next) = next else {
            return;
        };
        target = next;
    }
    *target = replacement;
}

impl SettingsCatalog {
    fn parse(json: &str) -> Self {
        let mut root: Value = serde_json::from_str(json).unwrap_or(Value::Null);
        let mut base = root.get_mut("base").map(Value::take).unwrap_or(Value::Null);
        if let Some(overrides) = root
            .get("platforms")
            .and_then(|platforms| platforms.get(current_platform()))
            .and_then(Value::as_array)
        {
            for entry in overrides {
                let Some(path) = entry.get(0).and_then(Value::as_array) else {
                    continue;
                };
                let replacement = entry.get(1).cloned().unwrap_or(Value::Null);
                apply_override(&mut base, path, replacement);
            }
        }
        let general = base.get("general");
        let modules = base
            .get("modules")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let defaults = modules
            .get(module::SETTINGS)
            .and_then(|settings| settings.get("DEFAULT_ghostex_SETTINGS"))
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let advanced_keys = modules
            .get(module::SETTINGS_TYPES)
            .and_then(|types| types.get("ADVANCED_MAIN_SETTING_KEYS"))
            .and_then(Value::as_array)
            .map(|keys| {
                keys.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        Self {
            general_sections: parse_sections(general.and_then(|general| general.get("sections"))),
            general_groups: general
                .and_then(|general| general.get("groups"))
                .and_then(Value::as_array)
                .map(|groups| {
                    groups
                        .iter()
                        .map(|group| GeneralGroupDef {
                            id: text(group.get("id")),
                            title: text(group.get("title")),
                            sections: group
                                .get("sections")
                                .and_then(Value::as_array)
                                .map(|ids| {
                                    ids.iter()
                                        .filter_map(Value::as_str)
                                        .map(str::to_string)
                                        .collect()
                                })
                                .unwrap_or_default(),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            general_navigation: general
                .and_then(|general| general.get("navigation"))
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(|item| NavItemDef {
                            id: text(item.get("id")),
                            title: text(item.get("title")),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            extra_tabs: base
                .get("extraTabs")
                .and_then(Value::as_array)
                .map(|tabs| {
                    tabs.iter()
                        .map(|tab| ExtraTabDef {
                            id: text(tab.get("id")),
                            title: text(tab.get("title")),
                            sections: parse_sections(tab.get("sections")),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            hotkeys: base
                .get("hotkeys")
                .and_then(|hotkeys| hotkeys.get("definitions"))
                .and_then(Value::as_array)
                .map(|definitions| {
                    definitions
                        .iter()
                        .map(|definition| HotkeyDef {
                            id: text(definition.get("id")),
                            title: text(definition.get("title")),
                            description: text(definition.get("description")),
                            default_key: text(definition.get("defaultKey")),
                            default_key_label: text(definition.get("defaultKeyLabel")),
                            windows_linux_default_key: definition
                                .get("windowsLinuxDefaultKey")
                                .and_then(Value::as_str)
                                .map(str::to_string),
                        })
                        .collect()
                })
                .unwrap_or_default(),
            labels: base
                .get("labels")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            modules,
            defaults,
            advanced_keys,
        }
    }

    /// A data export of one of the generated modules (`module::*`), by its TypeScript name.
    pub(crate) fn module_value(&self, module: &str, name: &str) -> Option<&Value> {
        self.modules.get(module)?.get(name)
    }

    /// An option table (`*_OPTIONS`) of a generated module.
    pub(crate) fn options(&self, module: &str, name: &str) -> Vec<SettingOption> {
        parse_options(self.module_value(module, name))
    }

    /// A numeric constant (`MIN_*`, `MAX_*`, `*_STEP*`) of a generated module; 0 when missing.
    pub(crate) fn number(&self, module: &str, name: &str) -> f64 {
        self.module_value(module, name)
            .and_then(Value::as_f64)
            .unwrap_or_default()
    }

    pub(crate) fn flag(&self, module: &str, name: &str) -> bool {
        self.module_value(module, name).and_then(Value::as_bool) == Some(true)
    }

    pub(crate) fn text(&self, module: &str, name: &str) -> String {
        text(self.module_value(module, name))
    }

    /// `formatSidebarHotkeyLabel(hotkey)` for the few labels General prints (`labels` in the catalog).
    pub(crate) fn hotkey_label(&self, hotkey: &str) -> String {
        text(self.labels.get(hotkey))
    }

    /// `DEFAULT_ghostex_SETTINGS`.
    pub(crate) fn defaults(&self) -> &Map<String, Value> {
        &self.defaults
    }

    pub(crate) fn default_value(&self, key: &str) -> Option<&Value> {
        self.defaults.get(key)
    }

    /// `isAdvancedMainSetting` (`ADVANCED_MAIN_SETTING_KEYS`).
    pub(crate) fn is_advanced(&self, key: &str) -> bool {
        self.advanced_keys.contains(key)
    }

    pub(crate) fn general_section(&self, id: &str) -> Option<&SearchSectionDef> {
        self.general_sections
            .iter()
            .find(|section| section.id == id)
    }

    pub(crate) fn general_group(&self, id: &str) -> Option<&GeneralGroupDef> {
        self.general_groups.iter().find(|group| group.id == id)
    }

    pub(crate) fn extra_tab(&self, id: &str) -> Option<&ExtraTabDef> {
        self.extra_tabs.iter().find(|tab| tab.id == id)
    }

    /// A string list or string-keyed record of string lists from a generated module
    /// (`MAIN_SETTINGS_SECTION_SETTING_KEYS[group]`, and the like).
    pub(crate) fn string_list(&self, module: &str, name: &str, key: Option<&str>) -> Vec<String> {
        let value = self.module_value(module, name);
        let value = match key {
            Some(key) => value.and_then(|value| value.get(key)),
            None => value,
        };
        value
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    }
}
