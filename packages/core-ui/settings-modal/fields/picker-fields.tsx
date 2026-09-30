import { useId } from 'react';
import { Button } from '@/packages/components/ui/button';
import { SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/packages/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/packages/components/ui/tooltip';
import { DisabledSettingControlTooltip } from '../../disabled-setting-control-tooltip';
import { IconAlertTriangle, IconDownload, IconPhoto, IconPlayerPlay, IconX } from '@tabler/icons-react';
import {
  COMPLETION_SOUND_OPTIONS,
  type CompletionSoundPreference,
  type CompletionSoundSetting,
} from '../../../shared/completion-sound';
import { type SidebarAppIconInfo, type SidebarAppIconStateMessage } from '../../../shared/session-grid-contract';
import { SettingModificationProps } from '../types';
import { SettingsSelect, SettingsSelectContent, SettingRow } from './primitives';

/**
 * CDXC:Icons 2026-06-28-06:05:
 * App Icon is an advanced custom-image flow, not a preset gallery. Render one
 * selected-icon preview, one Select Image button, and an X on the custom preview
 * to restore the empty/default source id. Selection still posts to native first;
 * persistence happens upstream only after native confirms with appIconState.
 */
export function AppIconPickerField({
  advanced,
  error,
  onChooseFile,
  onSelect,
  state,
}: {
  advanced?: boolean;
  error?: string;
  onChooseFile: () => void;
  onSelect: (sourceId: string) => void;
  state: SidebarAppIconStateMessage | undefined;
}) {
  const id = useId();
  const allIcons: SidebarAppIconInfo[] = state?.icons ?? [];
  const defaultIcon = allIcons.find((icon) => icon.id === '');
  const icons = allIcons.filter((icon) => icon.id !== '');
  const selectedId = state?.selectedId ?? '';
  const isDefaultSelected = selectedId === '';
  const selectedIcon = isDefaultSelected ? defaultIcon : icons.find((icon) => icon.id === selectedId);

  const previewIcon = selectedIcon ?? defaultIcon;

  return (
    <SettingRow
      advanced={advanced}
      description='Choose a PNG for the application and app-switcher icon.'
      htmlFor={id}
      label='Custom app icon'
      wide
    >
      <div className='flex min-w-0 flex-col gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='relative flex size-16 shrink-0 items-center justify-center overflow-visible'>
            <div className='flex size-16 items-center justify-center overflow-hidden rounded-none border border-border bg-muted/30'>
              {previewIcon ? (
                <img alt={previewIcon.name} className='size-full object-contain' src={previewIcon.thumbnailDataUrl} />
              ) : (
                <IconPhoto aria-hidden='true' className='size-7 text-muted-foreground' />
              )}
            </div>
            {!isDefaultSelected ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      aria-label='Use default app icon'
                      className='absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-none border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground'
                      onClick={() => onSelect('')}
                      type='button'
                    >
                      <IconX aria-hidden='true' className='size-3.5' />
                    </button>
                  }
                />
                <TooltipContent sideOffset={6}>Use default icon</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div className='flex min-w-0 flex-1 flex-col gap-2'>
            <Button
              className='h-9 w-fit rounded-none px-3 text-sm'
              id={id}
              onClick={onChooseFile}
              type='button'
              variant='outline'
            >
              <IconDownload aria-hidden='true' data-icon='inline-start' />
              Select Image
            </Button>
            <div className='truncate text-[13px] text-muted-foreground'>
              {isDefaultSelected ? 'Using the bundled Ghostex icon.' : (selectedIcon?.name ?? selectedId)}
            </div>
          </div>
        </div>

        {error ? (
          <div className='flex items-start gap-2 rounded-none border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive'>
            <IconAlertTriangle aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
            <span className='min-w-0'>{error}</span>
          </div>
        ) : null}
      </div>
    </SettingRow>
  );
}

export function SoundField({
  advanced,
  allowOff = false,
  description,
  isModified,
  label,
  onChange,
  onPlay,
  onResetToDefault,
  value,
}: {
  advanced?: boolean;
  allowOff?: boolean;
  description?: string;
  label: string;
  onChange: (value: CompletionSoundPreference) => void;
  onPlay?: (value: CompletionSoundSetting) => void;
  value: CompletionSoundPreference;
} & SettingModificationProps) {
  /**
   * CDXC:Settings 2026-04-29-17:01
   * Sound pickers have enough options that Radix hover-scroll buttons can
   * fight wheel scrolling inside the modal. Disable those auto-scroll zones so
   * mouse and trackpad wheel direction remains stable.
   *
   * CDXC:Settings 2026-05-11-02:06
   * Every sound picker needs an adjacent icon-only preview button so users can
   * audition the selected sound without changing settings or triggering the
   * broader agent-completion notification test flow.
   */
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
      <div className='settings-control-lane grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-2'>
        <SettingsSelect onValueChange={(nextValue) => onChange(nextValue as CompletionSoundPreference)} value={value}>
          <SelectTrigger className='h-8 w-full px-3' id={id}>
            <SelectValue />
          </SelectTrigger>
          <SettingsSelectContent className='max-h-72' showScrollButtons={false}>
            <SelectGroup>
              {allowOff ? <SelectItem value='off'>Off</SelectItem> : null}
              {COMPLETION_SOUND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SettingsSelectContent>
        </SettingsSelect>
        <DisabledSettingControlTooltip
          disabled={!onPlay || value === 'off'}
          reason={value === 'off' ? 'Choose a sound to preview it.' : 'Sound preview isn’t available here.'}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Play ${label}`}
                  className='size-8 rounded-none'
                  disabled={!onPlay || value === 'off'}
                  onClick={() => value !== 'off' && onPlay?.(value)}
                  size='icon'
                  type='button'
                  variant='outline'
                >
                  <IconPlayerPlay aria-hidden='true' className='size-4' />
                </Button>
              }
            />
            <TooltipContent sideOffset={6}>Play selected sound</TooltipContent>
          </Tooltip>
        </DisabledSettingControlTooltip>
      </div>
    </SettingRow>
  );
}
