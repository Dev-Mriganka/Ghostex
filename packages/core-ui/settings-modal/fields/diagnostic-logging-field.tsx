import { useId, useState } from 'react';
import { FieldLabel } from '@/packages/components/ui/field';
import { SelectItem, SelectTrigger, SelectValue } from '@/packages/components/ui/select';
import { Switch } from '@/packages/components/ui/switch';
import {
  DIAGNOSTIC_LOGGING_SCENARIOS,
  type DiagnosticLoggingScenarioId,
  type DiagnosticLoggingSettings,
} from '../../../shared/ghostex-settings';
import {
  DEFAULT_DIAGNOSTIC_LOGGING_ENABLE_DURATION,
  DIAGNOSTIC_LOGGING_DURATION_OPTIONS,
  DiagnosticLoggingDurationValue,
} from '../types';
import { SettingsSelect, SettingsSelectContent, SettingRow } from './primitives';

export function DiagnosticLoggingSettingsField({
  dependent,
  isModified,
  onChange,
  onResetToDefault,
  value,
}: {
  dependent?: boolean;
  isModified?: boolean;
  onChange: (scenarioIds: readonly DiagnosticLoggingScenarioId[], duration: DiagnosticLoggingDurationValue) => void;
  onResetToDefault?: () => void;
  value: DiagnosticLoggingSettings;
}) {
  const idBase = useId();
  const enabledScenarioIds = DIAGNOSTIC_LOGGING_SCENARIOS.map((scenario) => scenario.id).filter(
    (scenarioId) => getDiagnosticLoggingScenarioDuration(value, scenarioId) !== 'off'
  );
  const [timer, setTimer] = useState<DiagnosticLoggingDurationValue>(() => {
    const durations = enabledScenarioIds.map((scenarioId) => getDiagnosticLoggingScenarioDuration(value, scenarioId));
    return durations.includes('always') ? 'always' : (durations[0] ?? DEFAULT_DIAGNOSTIC_LOGGING_ENABLE_DURATION);
  });
  return (
    <SettingRow
      dependent={dependent}
      description='Pick the areas to log while you reproduce an issue. Warnings, errors, and crashes are always captured.'
      htmlFor={`${idBase}-timer`}
      isModified={isModified}
      label='Diagnostic logs'
      wide
      onResetToDefault={onResetToDefault}
    >
      <div className='grid gap-2'>
        <div className='flex min-w-0 items-center justify-between gap-3'>
          <FieldLabel className='text-sm' htmlFor={`${idBase}-timer`}>
            Turn logs off after
          </FieldLabel>
          <SettingsSelect
            onValueChange={(nextValue) => {
              const duration = nextValue as DiagnosticLoggingDurationValue;
              setTimer(duration);
              if (enabledScenarioIds.length > 0) {
                onChange(enabledScenarioIds, duration);
              }
            }}
            value={timer}
          >
            <SelectTrigger className='h-8 w-36' id={`${idBase}-timer`}>
              <SelectValue />
            </SelectTrigger>
            <SettingsSelectContent>
              {DIAGNOSTIC_LOGGING_DURATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SettingsSelectContent>
          </SettingsSelect>
        </div>
        {DIAGNOSTIC_LOGGING_SCENARIOS.map((scenario) => {
          const switchId = `${idBase}-${scenario.id.replaceAll('.', '-')}`;
          return (
            <div className='flex min-w-0 items-center justify-between gap-3' key={scenario.id}>
              <FieldLabel className='text-sm' htmlFor={switchId}>
                {scenario.label}
              </FieldLabel>
              <Switch
                checked={enabledScenarioIds.includes(scenario.id)}
                id={switchId}
                onCheckedChange={(nextChecked) => onChange([scenario.id], nextChecked ? timer : 'off')}
              />
            </div>
          );
        })}
      </div>
    </SettingRow>
  );
}

export function getDiagnosticLoggingScenarioDuration(
  value: DiagnosticLoggingSettings,
  scenarioId: DiagnosticLoggingScenarioId,
  now: Date = new Date()
): DiagnosticLoggingDurationValue {
  const scenario = value.scenarios[scenarioId];
  if (!scenario?.enabled) {
    return 'off';
  }
  if (!scenario.expiresAt) {
    return 'always';
  }
  const expiresAtMs = Date.parse(scenario.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now.getTime()) {
    return 'off';
  }
  const remainingMs = expiresAtMs - now.getTime();
  return remainingMs <= 30 * 60 * 1000 ? '15m' : '1h';
}

export function getDiagnosticLoggingScenarioStateForDuration(
  duration: DiagnosticLoggingDurationValue,
  now: Date = new Date()
) {
  /*
   * CDXC:Diagnostics 2026-06-30-23:52:
   * Some lag/crash diagnostic scenarios are enabled by default so repro logs
   * exist immediately after update. Persist Off as an explicit disabled state
   * instead of deleting the scenario so Settings can override those defaults.
   */
  switch (duration) {
    case '15m':
      return {
        enabled: true,
        expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
      };
    case '1h':
      return {
        enabled: true,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      };
    case 'always':
      return { enabled: true };
    case 'off':
      return { enabled: false };
  }
}
