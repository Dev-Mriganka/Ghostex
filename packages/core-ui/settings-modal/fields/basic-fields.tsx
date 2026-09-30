import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/packages/components/utils';
import { Button } from '@/packages/components/ui/button';
import { SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/packages/components/ui/select';
import { Slider } from '@/packages/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/packages/components/ui/tooltip';
import { IconFolderOpen } from '@tabler/icons-react';
import { PET_OPTIONS, type PetId } from '../../../shared/pets';
import { PetAvatar } from '../../pet-avatar';
import { SettingModificationProps } from '../types';
import { SettingsInput, SettingsTextarea, SettingsSelect, SettingsSelectContent, SettingRow } from './primitives';

export function SliderNumberField({
  dependent,
  advanced,
  description,
  isModified,
  label,
  max,
  min,
  onChange,
  onCommit,
  onResetToDefault,
  step,
  value,
}: {
  dependent?: boolean;
  advanced?: boolean;
  description?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  step: number;
  value: number;
} & SettingModificationProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState(() => formatSliderNumber(value, step));
  const valueText = formatSliderNumber(value, step);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputText(valueText);
    }
  }, [valueText]);

  const updateValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      return value;
    }
    const clampedValue = clampNumber(snapNumberToStep(nextValue, min, step), min, max);
    onChange(clampedValue);
    return clampedValue;
  };

  const commitValue = (nextValue: number) => {
    const clampedValue = Number.isFinite(nextValue)
      ? clampNumber(snapNumberToStep(nextValue, min, step), min, max)
      : value;
    setInputText(formatSliderNumber(clampedValue, step));
    onCommit(clampedValue);
  };

  const updateInputText = (nextText: string) => {
    setInputText(nextText);
    const nextValue = Number(nextText);
    if (nextText.trim() === '' || !Number.isFinite(nextValue) || nextValue < min || nextValue > max) {
      return;
    }
    onChange(clampNumber(snapNumberToStep(nextValue, min, step), min, max));
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
    >
      <div className='settings-slider-number grid grid-cols-[minmax(0,1fr)_4.75rem] items-center gap-3'>
        <Slider
          aria-label={label}
          max={max}
          min={min}
          onValueCommit={([nextValue]) => commitValue(nextValue ?? value)}
          onValueChange={([nextValue]) => updateValue(nextValue ?? value)}
          step={step}
          value={[value]}
        />
        <SettingsInput
          id={id}
          className='h-8 px-3 tabular-nums'
          onBlur={(event) => commitValue(Number(event.currentTarget.value))}
          onChange={(event) => updateInputText(event.currentTarget.value)}
          onFocus={(event) => event.currentTarget.select()}
          max={max}
          min={min}
          ref={inputRef}
          step={step}
          type='number'
          value={inputText}
        />
      </div>
    </SettingRow>
  );
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function snapNumberToStep(value: number, min: number, step: number): number {
  /**
   * CDXC:Settings 2026-04-29-08:56
   * Slider-backed numeric settings must persist the same step increments the
   * UI presents. This keeps Ghostty scroll multipliers on 0.25 increments even
   * when users type values into the adjacent number field.
   */
  const decimals = Math.max(0, step.toString().split('.')[1]?.length ?? 0);
  const scaledValue = Math.round((value - min) / step) * step + min;
  return Number(scaledValue.toFixed(decimals));
}

export function formatSliderNumber(value: number, step: number): string {
  if (Number.isInteger(step)) {
    return String(Math.round(value));
  }
  const decimals = Math.max(0, step.toString().split('.')[1]?.length ?? 0);
  return value.toFixed(decimals);
}

export function ActionButtonField({
  advanced,
  children,
  description,
  label,
  onClick,
}: {
  advanced?: boolean;
  children: ReactNode;
  description?: string;
  label: string;
  onClick: () => void;
}) {
  const id = useId();
  return (
    <SettingRow advanced={advanced} description={description} htmlFor={id} label={label}>
      <Button className='h-8 px-3' id={id} onClick={onClick} type='button'>
        {children}
      </Button>
    </SettingRow>
  );
}

export function ActionButtonPairField({
  advanced,
  actions,
  description,
  label,
}: {
  advanced?: boolean;
  actions: ReadonlyArray<{ label: string; onClick: () => void }>;
  description?: string;
  label: string;
}) {
  const id = useId();
  return (
    <SettingRow advanced={advanced} description={description} htmlFor={id} label={label}>
      <div className='flex flex-wrap justify-end gap-2'>
        {actions.map((action, index) => (
          <Button
            className='h-8 px-3'
            id={index === 0 ? id : undefined}
            key={action.label}
            onClick={action.onClick}
            type='button'
            variant='outline'
          >
            {action.label}
          </Button>
        ))}
      </div>
    </SettingRow>
  );
}

export function SelectField({
  dependent,
  advanced,
  contentClassName,
  description,
  disabled,
  disabledReason,
  isModified,
  label,
  onChange,
  onResetToDefault,
  options,
  showScrollButtons,
  supportingContent,
  triggerWidth,
  value,
}: {
  dependent?: boolean;
  advanced?: boolean;
  contentClassName?: string;
  description?: string;
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  showScrollButtons?: boolean;
  supportingContent?: ReactNode;
  /**
   * Per-row override of the standard list-row dropdown width (a CSS length), for rows whose
   * option labels do not fit the standard width. The popup follows the trigger automatically.
   */
  triggerWidth?: string;
  value: string;
} & SettingModificationProps) {
  const id = useId();
  return (
    <SettingRow
      dependent={dependent}
      advanced={advanced}
      description={description}
      htmlFor={id}
      isModified={isModified}
      label={label}
      onResetToDefault={onResetToDefault}
    >
      <SettingsSelect
        disabled={disabled}
        disabledReason={disabledReason}
        disabledTooltipClassName='w-full'
        items={options}
        onValueChange={onChange}
        value={value}
      >
        <SelectTrigger
          className='h-8 w-full px-3'
          disabled={disabled}
          id={id}
          style={triggerWidth ? ({ '--settings-select-width': triggerWidth } as CSSProperties) : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SettingsSelectContent
          className={cn('settings-list-select-content', contentClassName)}
          showScrollButtons={showScrollButtons}
        >
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SettingsSelectContent>
      </SettingsSelect>
      {supportingContent}
    </SettingRow>
  );
}

export function StaticNoteField({
  advanced,
  description,
  label,
  surface = 'boxed',
  value = 'Not available',
}: {
  advanced?: boolean;
  description?: string;
  label: string;
  surface?: 'boxed' | 'plain';
  value?: string;
}) {
  const id = useId();
  return (
    <SettingRow advanced={advanced} description={description} htmlFor={id} label={label}>
      <div
        className={
          surface === 'plain'
            ? 'text-sm text-muted-foreground'
            : 'rounded-none border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground'
        }
        id={id}
      >
        {value}
      </div>
    </SettingRow>
  );
}

export function PetPickerField({
  advanced,
  isModified,
  onChange,
  onResetToDefault,
  value,
}: {
  advanced?: boolean;
  onChange: (value: PetId) => void;
  value: PetId;
} & SettingModificationProps) {
  const id = useId();
  const selectedPet = PET_OPTIONS.find((option) => option.id === value) ?? PET_OPTIONS[0]!;
  return (
    <SettingRow
      advanced={advanced}
      description='Choose the pet sprite.'
      htmlFor={id}
      isModified={isModified}
      label='Pet'
      onResetToDefault={onResetToDefault}
    >
      <div className='settings-control-lane flex min-w-0 items-center gap-3'>
        <div className='flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-none border border-border bg-muted/30'>
          <PetAvatar className='scale-[0.42]' petId={selectedPet.id} />
        </div>
        <div className='flex min-w-0 flex-1 flex-col gap-2'>
          <SettingsSelect onValueChange={(nextValue) => onChange(nextValue as PetId)} value={value}>
            <SelectTrigger className='h-8 w-full px-3' id={id}>
              <SelectValue />
            </SelectTrigger>
            <SettingsSelectContent>
              <SelectGroup>
                {PET_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SettingsSelectContent>
          </SettingsSelect>
          <div className='truncate text-[13px] text-muted-foreground'>{selectedPet.description}</div>
        </div>
      </div>
    </SettingRow>
  );
}

export function TextField({
  dependent,
  advanced,
  browseLabel,
  description,
  isModified,
  label,
  onBrowse,
  onChange,
  onResetToDefault,
  placeholder,
  value,
}: {
  dependent?: boolean;
  advanced?: boolean;
  browseLabel?: string;
  description?: string;
  label: string;
  onBrowse?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
} & SettingModificationProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    /*
     * CDXC:Settings 2026-06-19-16:53:
     * Immediate-save Settings text fields must keep the user's focused edit
     * buffer while native settings hydration echoes persisted values back into
     * the modal host. Sync external values only when the field is not actively
     * editing so Font Family and command fields do not repaint focus back to
     * Settings search after the first typed character.
     */
    if (inputRef.current?.ownerDocument.activeElement === inputRef.current) {
      return;
    }
    setInputValue(value);
  }, [value]);

  const updateInputValue = (nextValue: string) => {
    setInputValue(nextValue);
    onChange(nextValue);
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
    >
      {onBrowse ? (
        <div className='settings-control-lane grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2'>
          <SettingsInput
            id={id}
            className='h-8 px-3'
            onBlur={(event) => updateInputValue(event.currentTarget.value)}
            onChange={(event) => updateInputValue(event.currentTarget.value)}
            placeholder={placeholder}
            ref={inputRef}
            value={inputValue}
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={browseLabel ?? `Browse for ${label}`}
                  className='size-8 rounded-none'
                  onClick={onBrowse}
                  size='icon'
                  type='button'
                  variant='outline'
                >
                  <IconFolderOpen aria-hidden='true' className='size-4' />
                </Button>
              }
            />
            <TooltipContent sideOffset={6}>{browseLabel ?? 'Browse…'}</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <SettingsInput
          id={id}
          className='settings-control-lane h-8 px-3'
          onBlur={(event) => updateInputValue(event.currentTarget.value)}
          onChange={(event) => updateInputValue(event.currentTarget.value)}
          placeholder={placeholder}
          ref={inputRef}
          value={inputValue}
        />
      )}
    </SettingRow>
  );
}

export function DisabledCommandPreviewField({
  advanced,
  description,
  label,
  value,
}: {
  advanced?: boolean;
  description?: string;
  label: string;
  value: string;
}) {
  const id = useId();
  return (
    <SettingRow advanced={advanced} description={description} htmlFor={id} label={label} wide>
      <SettingsTextarea
        className='min-h-24 resize-none px-3 py-2 font-mono text-[13px] leading-5'
        disabled
        id={id}
        readOnly
        value={value}
      />
    </SettingRow>
  );
}
