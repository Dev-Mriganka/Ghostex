import { useId, useState } from 'react';
import { Button } from '@/packages/components/ui/button';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
  normalizeTerminalDevServerIgnoredPortRuleInput,
  normalizeTerminalDevServerIgnoredPortRules,
} from '../../../shared/ghostex-settings';
import { SettingModificationProps } from '../types';
import { SettingsInput, SettingButton, SettingRow } from './primitives';

export function TerminalDevServerIgnoredPortsField({
  advanced,
  ignoredPortRules,
  isModified,
  onChange,
  onResetToDefault,
}: {
  advanced?: boolean;
  ignoredPortRules: readonly string[];
  onChange: (ignoredPortRules: readonly string[]) => void;
} & SettingModificationProps) {
  const id = useId();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const addIgnoredPortRule = () => {
    const canonicalRule = normalizeTerminalDevServerIgnoredPortRuleInput(inputValue);
    if (!canonicalRule) {
      setError('Enter a port (e.g. 9229) or a range (e.g. 24678-24680).');
      return;
    }
    setError('');
    setInputValue('');
    onChange(normalizeTerminalDevServerIgnoredPortRules([...ignoredPortRules, canonicalRule]));
  };
  const removeIgnoredPortRule = (rule: string) => {
    onChange(
      normalizeTerminalDevServerIgnoredPortRules(ignoredPortRules.filter((ignoredPortRule) => ignoredPortRule !== rule))
    );
  };

  return (
    <SettingRow
      advanced={advanced}
      description='Servers on these ports are hidden from the server menu. Enter a port or an inclusive range.'
      htmlFor={id}
      isModified={isModified}
      label='Ignored ports'
      wide
      onResetToDefault={onResetToDefault}
    >
      <div className='grid gap-3' id={id}>
        <div className='grid gap-2'>
          {ignoredPortRules.length === 0 ? (
            <div className='text-sm text-muted-foreground'>No ignored ports.</div>
          ) : (
            ignoredPortRules.map((rule) => (
              <div
                className='flex min-h-9 items-center justify-between gap-3 rounded-none border border-border/70 bg-card/40 px-3 py-2'
                key={rule}
              >
                <span className='min-w-0 truncate font-mono text-sm'>{rule}</span>
                <Button
                  aria-label={`Remove ignored port ${rule}`}
                  onClick={() => removeIgnoredPortRule(rule)}
                  size='icon-xs'
                  type='button'
                  variant='ghost'
                >
                  <IconTrash aria-hidden='true' size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className='flex items-center gap-2'>
          <SettingsInput
            aria-invalid={Boolean(error)}
            aria-label='Ignored port or range'
            className='h-8 min-w-0 flex-1 px-3'
            onChange={(event) => {
              setInputValue(event.currentTarget.value);
              if (error) {
                setError('');
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addIgnoredPortRule();
              }
            }}
            placeholder='e.g. 9229 or 24678-24680'
            value={inputValue}
          />
          <SettingButton
            disabled={!inputValue.trim()}
            disabledReason='Enter a port or port range first.'
            onClick={addIgnoredPortRule}
            type='button'
            variant='outline'
          >
            <IconPlus aria-hidden='true' data-icon='inline-start' />
            Add
          </SettingButton>
        </div>
        {error ? (
          <div className='text-sm text-destructive' role='alert'>
            {error}
          </div>
        ) : null}
      </div>
    </SettingRow>
  );
}
