import { useSortable } from '@dnd-kit/react/sortable';
import { useEffect, useState, type ComponentProps, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/packages/components/utils';
import { Button } from '@/packages/components/ui/button';
import { FieldLabel } from '@/packages/components/ui/field';
import { Input as BaseInput } from '@/packages/components/ui/input';
import { Select, SelectContent } from '@/packages/components/ui/select';
import { Switch } from '@/packages/components/ui/switch';
import { Textarea as BaseTextarea } from '@/packages/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/packages/components/ui/tooltip';
import { DisabledSettingControlTooltip } from '../../disabled-setting-control-tooltip';
import { IconAsterisk, IconArrowBigUp, IconFlaskFilled, IconInfoCircle } from '@tabler/icons-react';

export const MODIFIED_SETTING_TOOLTIP = 'Modified Setting.\n \nClick to Reset to Default';

/*
 * CDXC:Settings 2026-06-15-18:19:
 * Settings text fields hold explicit configuration values, including Remote SSH names, users, hosts, ports, identity files, commands, and prompts. Disable browser and macOS text assistance at the Settings modal field boundary so autocomplete, autocorrect, capitalization, and spellcheck cannot rewrite user-entered configuration.
 */
export function SettingsInput({
  autoCapitalize = 'none',
  autoComplete = 'off',
  autoCorrect = 'off',
  spellCheck = false,
  ...props
}: ComponentProps<'input'>) {
  return (
    <BaseInput
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      {...props}
    />
  );
}

export function SettingsTextarea({
  autoCapitalize = 'none',
  autoComplete = 'off',
  autoCorrect = 'off',
  spellCheck = false,
  ...props
}: ComponentProps<'textarea'>) {
  return (
    <BaseTextarea
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      spellCheck={spellCheck}
      {...props}
    />
  );
}

export function SettingsSelect({
  disabled,
  disabledReason,
  disabledTooltipClassName,
  onOpenChange,
  onValueChange,
  ...props
}: ComponentProps<typeof Select> & {
  disabledReason?: string;
  disabledTooltipClassName?: string;
}) {
  const [selectOpen, setSelectOpen] = useState(false);

  useEffect(() => {
    if (disabled && selectOpen) {
      setSelectOpen(false);
    }
  }, [disabled, selectOpen]);

  const closeSelect = () => {
    flushSync(() => {
      setSelectOpen(false);
    });
  };

  /*
   * CDXC:Settings 2026-06-19-19:22:
   * Settings select changes save immediately through the native modal host.
   * Close every Base UI popup before posting the setting update so portaled
   * dropdowns, including Default Prompt Agent and command editor selects,
   * cannot keep their modal focus trap alive while gxserver and native settings
   * hydration re-render the dialog.
   */
  const select = (
    <Select
      {...props}
      disabled={disabled}
      onOpenChange={(nextOpen, eventDetails) => {
        setSelectOpen(nextOpen);
        onOpenChange?.(nextOpen, eventDetails);
      }}
      onValueChange={(nextValue) => {
        closeSelect();
        onValueChange?.(nextValue);
      }}
      open={selectOpen}
    />
  );

  return (
    <DisabledSettingControlTooltip
      className={disabledTooltipClassName}
      disabled={disabled === true}
      reason={disabledReason}
    >
      {select}
    </DisabledSettingControlTooltip>
  );
}

export function SettingButton({
  disabledReason,
  disabledTooltipClassName,
  ...props
}: ComponentProps<typeof Button> & {
  disabledReason: string;
  disabledTooltipClassName?: string;
}) {
  const disabled = props.disabled === true;
  return (
    <DisabledSettingControlTooltip className={disabledTooltipClassName} disabled={disabled} reason={disabledReason}>
      <Button {...props} />
    </DisabledSettingControlTooltip>
  );
}

export function SettingSwitch({
  disabledReason,
  ...props
}: ComponentProps<typeof Switch> & {
  disabledReason: string;
}) {
  const disabled = props.disabled === true;
  return (
    <DisabledSettingControlTooltip disabled={disabled} reason={disabledReason}>
      <Switch {...props} />
    </DisabledSettingControlTooltip>
  );
}

export function SettingsSelectContent({ className, ...props }: ComponentProps<typeof SelectContent>) {
  /*
   * CDXC:Settings 2026-06-16-16:58:
   * Settings Select popups are portaled outside the Settings dialog subtree.
   * Carry a stable class on the popup so row hover, focus, and selected states
   * can stay neutral gray instead of inheriting saturated app accent styling.
   */
  return <SelectContent className={cn('settings-select-content', className)} {...props} />;
}

/*
 * CDXC:Settings 2026-06-29-00:40:
 * Settings management rows still need dnd-kit to register one element as both sortable item and drag source, but the row components need React Compiler coverage.
 * Keep the callback-ref mutation behind this helper so render code does not directly invoke ref-named mutators.
 */
export function setSettingsSortableRowElement(
  sortableRefs: Pick<ReturnType<typeof useSortable>, 'ref' | 'sourceRef'>,
  element: HTMLElement | null
): void {
  sortableRefs.ref(element);
  sortableRefs.sourceRef(element);
}

export function SettingsNativeScrollArea({
  children,
  className,
  onScrollCapture,
  viewportClassName,
  ...props
}: ComponentProps<'div'> & {
  viewportClassName?: string;
}) {
  return (
    <div {...props} className={cn('relative', className)} data-slot='scroll-area'>
      {/*
       * CDXC:Settings 2026-06-29-00:40:
       * Settings pages must scroll with native overflow instead of Base UI
       * ScrollArea because long pages do not need custom scrollbar metrics or
       * scroll-linked edge masks on every frame. Keep the viewport data-slot so
       * existing section tracking and padding CSS continue to target the
       * scrollable element.
       */}
      <div
        className={cn(
          'settings-native-scroll-viewport size-full overflow-x-hidden overflow-y-auto rounded-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 focus-visible:outline-1',
          viewportClassName
        )}
        data-slot='scroll-area-viewport'
        onScrollCapture={onScrollCapture}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * CDXC:Settings 2026-09-09 DECISION:
 * User: every Settings page and section shares one style, the grouped-list prototype: a plain group heading above a raised card, one setting per row with its label on the left and its control on the right, rows separated by hairlines, no floating title pill and no visible subtitle text.
 * The older stacked card (label above a full-width control) is gone; anything that needs the full row width uses `SettingRow wide` instead.
 */
export function SettingsSection({
  actions,
  children,
  description,
  descriptionClassName,
  plain,
  sectionRef,
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  descriptionClassName?: string;
  /** Lay the children straight on the page instead of inside the list card (the Extensions card grid). */
  plain?: boolean;
  sectionRef?: RefObject<HTMLDivElement | null>;
  title: string;
}) {
  return (
    <div className='settings-section-anchor settings-list-section' ref={sectionRef}>
      <div className='settings-list-section-header'>
        <div className='settings-list-section-heading'>
          <h3 className='settings-list-section-title'>{title}</h3>
          {description ? (
            <p className={cn('settings-list-section-description', descriptionClassName)}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className='settings-list-section-actions'>{actions}</div> : null}
      </div>
      <div className={plain ? 'settings-list-plain' : 'settings-list-card'}>{children}</div>
    </div>
  );
}

/**
 * A non-form row inside a settings list card: management lists (agents,
 * actions, open targets, storage folders, diagnostics) render one of these per
 * item so they share the setting rows' geometry and hairlines. `detail` is the
 * item's own data (a command, a path, a status), not a setting subtitle.
 */
export function SettingsListItem({
  children,
  className,
  detail,
  icon,
  status,
  title,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  detail?: ReactNode;
  icon?: ReactNode;
  /**
   * CDXC:Settings 2026-09-09 DECISION:
   * User: rows do not spell out Installed or Permissions Allowed in a pill. State is a small dot before the icon, the way the Extensions page marks enabled views.
   */
  status?: 'success' | 'warning' | 'neutral';
  title: ReactNode;
}) {
  return (
    <div className={cn('settings-list-row settings-list-item', className)} {...props}>
      {status ? <span aria-hidden='true' className='settings-list-item-status' data-tone={status} /> : null}
      {icon ? <span className='settings-list-item-icon'>{icon}</span> : null}
      <div className='settings-list-row-text'>
        <span className='settings-list-row-label settings-list-item-title'>{title}</span>
        {detail ? <span className='settings-list-row-detail'>{detail}</span> : null}
      </div>
      {children !== undefined && children !== null ? <div className='settings-list-row-control'>{children}</div> : null}
    </div>
  );
}

/**
 * CDXC:Settings 2026-05-06-12:57
 * CDXC:Settings 2026-05-07-18:03
 * Every changed settings control needs a small, low-emphasis asterisk to the
 * left of its label. Position it absolutely so modified-state indication does
 * not reflow setting titles, while the tooltip action still resets only that
 * setting to DEFAULT_ghostex_SETTINGS.
 *
 * CDXC:Settings 2026-06-15-20:53:
 * Main Settings rows should not show explanatory subtitles inline because the
 * modal needs to stay dense and scannable. Reveal a compact info trigger only
 * while the row is hovered or focused, then show the description in a
 * right-side tooltip capped at 350px.
 *
 * CDXC:Settings 2026-06-16-10:40:
 * Advanced rows should no longer use a text badge. Mark them with a light blue
 * up-arrow affordance beside the label actions, immediately before the info
 * button when one is present, so the label stays compact while hover explains
 * the row as an Advanced Setting.
 *
 * CDXC:Settings 2026-06-16-18:22:
 * The advanced up-arrow is a persistent scan marker, not hover-only chrome, and
 * needs a small gap from the label so advanced rows are visible at rest.
 */
export function SettingRow({
  advanced,
  experimental,
  badge,
  children,
  dependent,
  description,
  htmlFor,
  isModified,
  label,
  labelAddon,
  onResetToDefault,
  subtitle,
  wide,
}: {
  advanced?: boolean;
  experimental?: boolean;
  /** Rows for newly shipped settings may carry a short label badge. */
  badge?: string;
  children: ReactNode;
  /**
   * CDXC:Settings 2026-09-12 DECISION:
   * User: settings that cascade from a setting above them start their name with four spaces and the ↳ glyph.
   */
  dependent?: boolean;
  description?: string;
  htmlFor: string;
  isModified?: boolean;
  label: string;
  /** Extra inline content after the label, such as an Inherited badge. */
  labelAddon?: ReactNode;
  onResetToDefault?: () => void;
  subtitle?: string;
  /** Put the control on its own full-width line under the label (textareas, pickers, lists). */
  wide?: boolean;
}) {
  /*
   * CDXC:Settings 2026-09-09 DECISION:
   * User: rows show no subtitle text. The description (and any subtitle) lives only in the tooltip behind the hover-revealed info icon next to the label.
   */
  const tooltipText = [description, subtitle].filter(Boolean).join('\n\n');
  return (
    <div className={cn('settings-row settings-list-row', wide && 'settings-list-row-wide')} role='group'>
      <div className='settings-list-row-text'>
        <span className='settings-row-label-line'>
          {isModified && onResetToDefault ? (
            <ModifiedSettingResetButton label={label} onResetToDefault={onResetToDefault} />
          ) : null}
          <FieldLabel className='settings-list-row-label' htmlFor={htmlFor}>
            {dependent ? (
              <span>
                <span aria-hidden='true' style={{ whiteSpace: 'pre' }}>
                  {'    ↳ '}
                </span>
                {label}
              </span>
            ) : (
              label
            )}
          </FieldLabel>
          {labelAddon}
          {badge ? (
            <span className='settings-row-badge inline-flex px-1.5 py-0.5 text-[11px] font-normal'>{badge}</span>
          ) : null}
          {advanced ? <AdvancedSettingTooltip label={label} /> : null}
          {experimental ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    aria-label={`${label} is an experimental feature`}
                    className='ml-0.5 inline-flex size-4 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground'
                    type='button'
                  >
                    <IconFlaskFilled aria-hidden='true' className='size-3.5' />
                  </button>
                }
              />
              <TooltipContent sideOffset={6}>Experimental Feature</TooltipContent>
            </Tooltip>
          ) : null}
          {tooltipText ? <SettingDescriptionTooltip description={tooltipText} label={label} /> : null}
        </span>
        {tooltipText ? <span className='sr-only'>{tooltipText}</span> : null}
      </div>
      <div className='settings-list-row-control'>{children}</div>
    </div>
  );
}

export function AdvancedSettingTooltip({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button aria-label={`${label} is an advanced setting`} className='settings-row-advanced-button' type='button'>
            <IconArrowBigUp aria-hidden='true' />
          </button>
        }
      />
      <TooltipContent sideOffset={6}>Advanced Setting</TooltipContent>
    </Tooltip>
  );
}

export function SettingDescriptionTooltip({ description, label }: { description: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button aria-label={`${label} setting details`} className='settings-row-info-button' type='button'>
            <IconInfoCircle aria-hidden='true' />
          </button>
        }
      />
      <TooltipContent
        className='settings-row-info-tooltip'
        side='right'
        sideOffset={8}
        style={{ maxWidth: 'min(350px, calc(100vw - 32px))' }}
      >
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

export function ModifiedSettingResetButton({
  label,
  onResetToDefault,
}: {
  label: string;
  onResetToDefault: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={`Reset ${label} to default`}
            className='settings-modified-reset-button'
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onResetToDefault();
            }}
            size='icon-xs'
            type='button'
            variant='ghost'
          >
            <IconAsterisk aria-hidden='true' />
          </Button>
        }
      />
      <TooltipContent className='whitespace-pre-line text-center' sideOffset={6}>
        {MODIFIED_SETTING_TOOLTIP}
      </TooltipContent>
    </Tooltip>
  );
}
