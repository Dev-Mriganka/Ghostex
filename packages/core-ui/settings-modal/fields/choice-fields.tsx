import { useId } from 'react';
import { SegmentedControl, SegmentedControlItem } from '@/packages/components/ui/segmented-control';
import { Switch } from '@/packages/components/ui/switch';
import {
  PANEL_ANIMATION_SPEED_OPTIONS,
  PREFERRED_AGENT_INTERFACE_OPTIONS,
  SESSION_CHAT_THEME_OPTIONS,
  SIDEBAR_SETTINGS_PRESETS,
  SIDEBAR_SPACES_ENABLED_OPTIONS,
  TERMINAL_VIEW_WIDTH_MODE_OPTIONS,
  type PanelAnimationSpeed,
  type PreferredAgentInterface,
  type SidebarSettingsPresetId,
  type TerminalViewWidthMode,
} from '../../../shared/ghostex-settings';
import { type SessionChatThemeSetting } from '../../../shared/session-chat';
import { SettingModificationProps } from '../types';
import { SettingSwitch, SettingRow } from './primitives';

export function SidebarPresetField({
  activePresetId,
  advanced,
  description,
  isModified,
  label,
  onChange,
  onResetToDefault,
}: {
  activePresetId?: SidebarSettingsPresetId;
  advanced?: boolean;
  description?: string;
  label: string;
  onChange: (presetId: SidebarSettingsPresetId) => void;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      advanced={advanced}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <div className='flex items-center gap-3'>
        {activePresetId ? null : <span className='text-[13px] text-muted-foreground'>Custom</span>}
        <SegmentedControl
          aria-label={label}
          onValueChange={(nextPresetId) => {
            onChange(nextPresetId as SidebarSettingsPresetId);
          }}
          value={activePresetId ?? ''}
        >
          {SIDEBAR_SETTINGS_PRESETS.map((preset, index) => (
            <SegmentedControlItem
              aria-label={preset.label}
              id={index === 0 ? id : undefined}
              key={preset.id}
              value={preset.id}
            >
              {preset.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>
    </SettingRow>
  );
}

export function TerminalViewWidthModeField({
  advanced,
  description,
  isModified,
  label,
  onChange,
  onResetToDefault,
  value,
}: {
  advanced?: boolean;
  description?: string;
  label: string;
  onChange: (value: TerminalViewWidthMode) => void;
  value: TerminalViewWidthMode;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      advanced={advanced}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <SegmentedControl
        aria-label={label}
        onValueChange={(nextValue) => onChange(nextValue as TerminalViewWidthMode)}
        value={value}
      >
        {TERMINAL_VIEW_WIDTH_MODE_OPTIONS.map((option, index) => (
          <SegmentedControlItem
            aria-label={option.label}
            id={index === 0 ? id : undefined}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </SettingRow>
  );
}

/*
 * CDXC:Spaces 2026-08-28:
 * Spaces is a feature switch rather than a density tweak, so it reads as the
 * same combined button the Preset row above it uses instead of the small toggle
 * the per-row visibility settings use.
 */
export function SidebarSpacesField({
  advanced,
  description,
  isModified,
  label,
  onChange,
  onResetToDefault,
  value,
}: {
  advanced?: boolean;
  description?: string;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      advanced={advanced}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <SegmentedControl
        aria-label={label}
        onValueChange={(nextValue) => {
          onChange(nextValue === 'on');
        }}
        value={value ? 'on' : 'off'}
      >
        {SIDEBAR_SPACES_ENABLED_OPTIONS.map((option, index) => (
          <SegmentedControlItem
            aria-label={option.label}
            id={index === 0 ? id : undefined}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </SettingRow>
  );
}

export function PanelAnimationSpeedField({
  advanced,
  description,
  isModified,
  label,
  onChange,
  onResetToDefault,
  value,
}: {
  advanced?: boolean;
  description?: string;
  label: string;
  onChange: (value: PanelAnimationSpeed) => void;
  value: PanelAnimationSpeed;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      advanced={advanced}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <SegmentedControl
        aria-label={label}
        onValueChange={(nextValue) => {
          onChange(nextValue as PanelAnimationSpeed);
        }}
        value={value}
      >
        {PANEL_ANIMATION_SPEED_OPTIONS.map((option, index) => (
          <SegmentedControlItem
            aria-label={option.label}
            id={index === 0 ? id : undefined}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </SettingRow>
  );
}

export function PreferredAgentInterfaceField({
  description,
  isModified,
  label,
  onChange,
  onResetToDefault,
  value,
}: {
  description?: string;
  label: string;
  onChange: (value: PreferredAgentInterface) => void;
  value: PreferredAgentInterface;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <SegmentedControl
        aria-label={label}
        onValueChange={(nextInterface) => {
          onChange(nextInterface as PreferredAgentInterface);
        }}
        value={value}
      >
        {PREFERRED_AGENT_INTERFACE_OPTIONS.map((option, index) => (
          <SegmentedControlItem
            aria-label={option.label}
            id={index === 0 ? id : undefined}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </SettingRow>
  );
}

export function SessionChatThemeField({
  description,
  isModified,
  label,
  onChange,
  onResetToDefault,
  value,
}: {
  description?: string;
  label: string;
  onChange: (value: SessionChatThemeSetting) => void;
  value: SessionChatThemeSetting;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <SegmentedControl
        aria-label={label}
        onValueChange={(nextValue) => {
          onChange(nextValue as SessionChatThemeSetting);
        }}
        value={value}
      >
        {SESSION_CHAT_THEME_OPTIONS.map((option, index) => (
          <SegmentedControlItem
            aria-label={option.label}
            id={index === 0 ? id : undefined}
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </SettingRow>
  );
}

export function ToggleField({
  dependent,
  advanced,
  experimental,
  checked,
  description,
  disabled,
  disabledReason,
  isModified,
  label,
  onChange,
  onResetToDefault,
  subtitle,
}: {
  dependent?: boolean;
  advanced?: boolean;
  experimental?: boolean;
  checked: boolean;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onChange: (checked: boolean) => void;
  subtitle?: string;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      dependent={dependent}
      advanced={advanced}
      experimental={experimental}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
      subtitle={subtitle}
    >
      {disabled && disabledReason ? (
        <SettingSwitch checked={checked} disabled disabledReason={disabledReason} id={id} onCheckedChange={onChange} />
      ) : (
        <Switch checked={checked} disabled={disabled} id={id} onCheckedChange={onChange} />
      )}
    </SettingRow>
  );
}
