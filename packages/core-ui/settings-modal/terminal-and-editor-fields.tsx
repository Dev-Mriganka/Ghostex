import { formatSidebarHotkeyLabel } from '@/packages/core-ui/hotkey-label';
import { useId } from 'react';
import { Button } from '@/packages/components/ui/button';
import { SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/packages/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/packages/components/ui/tooltip';
import { GHOSTEX_RECOMMENDED_GHOSTTY_CONFIG_LINES } from '../../shared/ghostty-config-actions';
import { PROMPT_EDITOR_BACKEND_OPTIONS, type PromptEditorBackend } from '../../shared/ghostex-settings';
import { SettingRow, SettingsSelect, SettingsSelectContent } from './fields';

export function GhosttySettingsActions({
  onApplyRecommended,
  onOpenConfigFile,
  onOpenDocs,
  onResetDefaults,
}: {
  onApplyRecommended: () => void;
  onOpenConfigFile: () => void;
  onOpenDocs: () => void;
  onResetDefaults: () => void;
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      <Button className='h-8 px-3' onClick={onResetDefaults} type='button' variant='outline'>
        Reset Ghostty defaults
      </Button>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button className='h-8 px-3' onClick={onApplyRecommended} type='button' variant='outline'>
              Apply recommended
            </Button>
          }
        />
        <TooltipContent className='whitespace-pre-line text-left' sideOffset={6}>
          {GHOSTEX_RECOMMENDED_GHOSTTY_CONFIG_LINES.join('\n')}
        </TooltipContent>
      </Tooltip>
      <Button className='h-8 px-3' onClick={onOpenDocs} type='button' variant='outline'>
        Open Ghostty docs
      </Button>
      <Button className='h-8 px-3' onClick={onOpenConfigFile} type='button' variant='outline'>
        Open Ghostty config
      </Button>
    </div>
  );
}

export function PromptEditorBackendField({
  advanced,
  backend,
  isModified,
  onChange,
  onResetToDefault,
}: {
  advanced?: boolean;
  backend: PromptEditorBackend;
  isModified?: boolean;
  onChange: (backend: PromptEditorBackend) => void;
  onResetToDefault?: () => void;
}) {
  const id = useId();
  return (
    <SettingRow
      advanced={advanced}
      description={`Choose which editor new terminals use when ${formatSidebarHotkeyLabel('ctrl+g')} asks the shell to edit prompt text.`}
      htmlFor={id}
      isModified={isModified}
      label={`${formatSidebarHotkeyLabel('ctrl+g')} prompt editor`}
      onResetToDefault={onResetToDefault}
    >
      <SettingsSelect onValueChange={(value) => onChange(value as PromptEditorBackend)} value={backend}>
        <SelectTrigger className='h-8 w-full px-3' id={id}>
          <SelectValue />
        </SelectTrigger>
        <SettingsSelectContent>
          <SelectGroup>
            {PROMPT_EDITOR_BACKEND_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SettingsSelectContent>
      </SettingsSelect>
    </SettingRow>
  );
}
