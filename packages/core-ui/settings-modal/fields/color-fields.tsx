import { useEffect, useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/packages/components/utils';
import { Button } from '@/packages/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/packages/components/ui/dialog';
import { AppTooltip } from '../../app-tooltip';
import { DisabledSettingControlTooltip } from '../../disabled-setting-control-tooltip';
import { IconPalette } from '@tabler/icons-react';
import { DEFAULT_CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_TINT_COLOR } from '../../../shared/ghostex-settings';
import { SettingModificationProps } from '../types';
import { SettingsInput, SettingRow } from './primitives';
import { clampNumber } from './basic-fields';

/**
 * CDXC:Settings 2026-09-21 WHY:
 * The picker pulls in html2canvas for an eyedropper this field hides, about 260 KB that Settings parsed before its first paint for a dialog most opens never show. Load it when the Pick Color dialog opens.
 */
type ColorPickerComponent = typeof import('react-best-gradient-color-picker').default;
let loadedColorPicker: ColorPickerComponent | undefined;

/** Not React.lazy: React holds content that resolves behind a Suspense fallback for about 300 ms, so the picker would appear late in an already open dialog. */
function useColorPicker(isNeeded: boolean): ColorPickerComponent | undefined {
  const [, setLoadRevision] = useState(0);
  useEffect(() => {
    if (!isNeeded || loadedColorPicker) {
      return;
    }
    let isCurrent = true;
    void import('react-best-gradient-color-picker').then((module) => {
      loadedColorPicker = module.default;
      if (isCurrent) {
        setLoadRevision((revision) => revision + 1);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isNeeded]);
  return loadedColorPicker;
}

export function ColorField({
  dependent,
  advanced,
  description,
  disabled,
  disabledReason,
  isModified,
  label,
  onChange,
  onResetToDefault,
  value,
}: {
  dependent?: boolean;
  advanced?: boolean;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
} & SettingModificationProps) {
  const id = useId();
  const colorValue = normalizeColorInputValue(value);
  return (
    <SettingRow
      advanced={advanced}
      dependent={dependent}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={disabled ? undefined : onResetToDefault}
    >
      <DisabledSettingControlTooltip disabled={disabled === true} reason={disabledReason}>
        <div
          className={cn(
            'settings-control-lane grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3',
            disabled && 'opacity-50'
          )}
        >
          <SettingsInput
            aria-label={`${label} picker`}
            disabled={disabled}
            className='h-8 cursor-pointer rounded-none p-1'
            onChange={(event) => {
              if (!disabled) onChange(event.currentTarget.value);
            }}
            type='color'
            value={colorValue}
          />
          <SettingsInput
            id={id}
            disabled={disabled}
            className='h-8 px-3'
            onChange={(event) => {
              if (!disabled) onChange(event.currentTarget.value);
            }}
            value={value}
          />
        </div>
      </DisabledSettingControlTooltip>
    </SettingRow>
  );
}

export const SIDEBAR_TITLEBAR_TINT_SWATCHES: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'White', value: '#ffffff' },
  { label: 'Neutral Gray', value: '#808080' },
  { label: 'Black', value: '#000000' },
  { label: 'Steel', value: '#4f6672' },
  { label: 'Red', value: '#884444' },
  { label: 'Orange', value: '#8a5330' },
  { label: 'Amber', value: '#8a6a2f' },
  { label: 'Olive', value: '#657a3f' },
  { label: 'Green', value: '#3f7a5f' },
  { label: 'Teal', value: '#2f7d66' },
  { label: 'Cyan', value: '#287c7f' },
  { label: 'Blue', value: '#336699' },
  { label: 'Indigo', value: '#4f5f96' },
  { label: 'Violet', value: '#6c4f8f' },
  { label: 'Pink', value: '#854f7a' },
  { label: 'Rose', value: '#8a4f5f' },
];

export function WebColorPickerField({
  dependent,
  advanced,
  description,
  isModified,
  label,
  onChange,
  onCommit,
  onResetToDefault,
  value,
}: {
  dependent?: boolean;
  advanced?: boolean;
  description?: string;
  label: string;
  onChange: (value: string) => void;
  onCommit?: (value: string) => void;
  value: string;
} & SettingModificationProps) {
  const id = useId();
  const savedColorValue = normalizeColorInputValue(value, DEFAULT_CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_TINT_COLOR);
  const [colorText, setColorText] = useState(savedColorValue);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ColorPicker = useColorPicker(pickerOpen);
  const [pickerValue, setPickerValue] = useState(savedColorValue);
  const colorValue = normalizePickerColorValue(colorText, savedColorValue);

  useEffect(() => {
    setColorText(savedColorValue);
    setPickerValue(savedColorValue);
  }, [savedColorValue]);

  const previewColor = (nextColor: string) => {
    const normalizedColor = normalizePickerColorValue(nextColor, DEFAULT_CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_TINT_COLOR);
    setColorText(normalizedColor);
    setPickerValue(nextColor);
    onChange(normalizedColor);
    return normalizedColor;
  };

  const commitColor = (nextColor: string) => {
    const normalizedColor = previewColor(nextColor);
    onCommit?.(normalizedColor);
  };
  const commitColorAfterClosingPicker = (nextColor: string) => {
    /*
     * CDXC:Theming 2026-06-19-19:51:
     * The custom tint picker is a nested Base UI dialog inside Settings.
     * Close the dialog before the final setting commit so native settings
     * hydration cannot re-render while the picker still owns modal focus.
     */
    flushSync(() => {
      setPickerOpen(false);
    });
    commitColor(nextColor);
  };

  return (
    <SettingRow
      dependent={dependent}
      advanced={advanced}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
      wide
    >
      {/*
        CDXC:Theming 2026-06-15-15:28:
        Background Tint must be a web picker, not input[type=color], so the
        macOS color panel never opens. Use swatches plus a hex field and let
        shared settings normalize the saved color.

        CDXC:Theming 2026-06-15-16:04:
        The first tint picker rendered as a full-width framed popover trigger,
        which made the Settings section look like an empty bordered slab. Keep
        the control inline and compact: swatches first, hex value second, no
        extra container chrome.

        CDXC:Theming 2026-06-15-16:13:
        Users need both more tint presets and a way to pick any tint color.
        Keep presets inline, and put the full web picker behind a compact
        swatch trigger so the Settings row does not regain the oversized
        framed surface that was removed.

        CDXC:Theming 2026-06-15-16:13:
        Picker dragging should preview immediately from local color state while
        the saved tint setting still uses the existing debounced Settings write
        path before native sidebar/titlebar chrome is updated.

        CDXC:Theming 2026-06-15-17:34:
        Replace the hand-built hue picker with the same
        react-best-gradient-color-picker control used in Sharptabs. Keep this
        setting solid-color only, and expose it as a simple Pick Color dialog
        rather than showing technical hue/saturation labels in the Settings row.

        CDXC:Theming 2026-06-19-13:44:
        Background Tint presets should scan as neutrals first and then a hue-wheel sequence. Keep only fifteen presets by removing near-duplicate Sky and Purple stops, and use compact row spacing so the custom picker and hex field remain on the same row.

        CDXC:Theming 2026-06-19-14:20:
        Add Black to the neutral preset group because white, gray, and black are all valid untinted chrome choices. Keep the input two character cells narrower than the first compact layout so the added swatch does not force the hex field onto a second row.

        CDXC:Theming 2026-06-19-14:36:
        The hex field should use exactly the remaining first-row width after the swatches and custom picker. Use a zero-basis flexible input instead of a fixed character width so it fills the right-side remainder without wrapping to a second line.
      */}
      <div className='flex flex-wrap items-center gap-1.5'>
        {SIDEBAR_TITLEBAR_TINT_SWATCHES.map((swatch) => {
          const isSelected = colorValue === swatch.value;
          return (
            <AppTooltip content={swatch.label} key={swatch.value}>
              <Button
                aria-label={`Use ${swatch.label} tint`}
                aria-pressed={isSelected}
                className={cn(
                  'size-7 min-w-0 shrink-0 border p-0',
                  isSelected ? 'border-ring ring-2 ring-ring/45' : 'border-border/80'
                )}
                onClick={() => commitColor(swatch.value)}
                style={{ backgroundColor: swatch.value }}
                type='button'
                variant='ghost'
              />
            </AppTooltip>
          );
        })}
        <AppTooltip content='Pick custom tint color'>
          <Button
            aria-label={`${label} custom color picker`}
            className='h-8 min-w-0 gap-2 px-2'
            onClick={() => {
              setPickerValue(colorValue);
              setPickerOpen(true);
            }}
            type='button'
            variant='outline'
          >
            <span
              aria-hidden='true'
              className='size-4 shrink-0 border border-border'
              style={{ backgroundColor: colorValue }}
            />
            <IconPalette aria-hidden='true' data-icon='inline-end' />
          </Button>
        </AppTooltip>
        <Dialog
          open={pickerOpen}
          onOpenChange={(open) => {
            if (!open) {
              commitColorAfterClosingPicker(colorValue);
              return;
            }
            setPickerOpen(open);
          }}
        >
          <DialogContent className='w-[22rem] gap-4 p-4' showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Pick Color</DialogTitle>
            </DialogHeader>
            <div className='mx-auto min-h-[294px] w-[294px]'>
              {ColorPicker ? (
                <ColorPicker
                  hideAdvancedSliders
                  hideColorGuide
                  hideColorTypeBtns
                  hideEyeDrop
                  hideGradientAngle
                  hideGradientControls
                  hideGradientStop
                  hideGradientType
                  hideInputType
                  hideOpacity
                  hidePresets
                  idSuffix='sidebar-titlebar-tint'
                  onChange={previewColor}
                  value={pickerValue}
                  width={294}
                />
              ) : null}
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  commitColorAfterClosingPicker(colorValue);
                }}
                type='button'
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <SettingsInput
          aria-label={`${label} hex color`}
          className='h-8 min-w-0 flex-1 px-2 font-mono uppercase'
          id={id}
          inputMode='text'
          onBlur={() => commitColor(colorText)}
          onChange={(event) => {
            const nextValue = event.currentTarget.value;
            setColorText(nextValue);
            if (/^#[0-9a-f]{6}$/iu.test(nextValue.trim())) {
              onChange(nextValue.trim().toLowerCase());
            }
          }}
          placeholder={DEFAULT_CUSTOM_SIDEBAR_TITLEBAR_BACKGROUND_TINT_COLOR}
          spellCheck={false}
          value={colorText}
        />
      </div>
    </SettingRow>
  );
}

export function normalizeColorInputValue(value: string, fallback = '#121212'): string {
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/u.test(normalized) ? normalized : fallback;
}

export function normalizePickerColorValue(value: string, fallback = '#121212'): string {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/u.test(normalized)) {
    return normalized;
  }
  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/u.exec(
    normalized
  );
  if (!rgbMatch) {
    return fallback;
  }
  return rgbToHexColor({
    blue: Number(rgbMatch[3] ?? 0),
    green: Number(rgbMatch[2] ?? 0),
    red: Number(rgbMatch[1] ?? 0),
  });
}

export function rgbToHexColor(color: { blue: number; green: number; red: number }): string {
  const toHexComponent = (component: number) => clampNumber(component, 0, 255).toString(16).padStart(2, '0');
  return `#${toHexComponent(color.red)}${toHexComponent(color.green)}${toHexComponent(color.blue)}`;
}
