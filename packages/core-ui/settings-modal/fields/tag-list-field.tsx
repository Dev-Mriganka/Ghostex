import { DragDropProvider, type DragDropEventHandlers } from '@dnd-kit/react';
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable';
import { useEffect, useRef } from 'react';
import { cn } from '@/packages/components/utils';
import { Button } from '@/packages/components/ui/button';
import { Switch } from '@/packages/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/packages/components/ui/tooltip';
import { IconChevronRight, IconEye, IconEyeOff, IconGripVertical, IconMinus, IconTrash } from '@tabler/icons-react';
import {
  getCustomSessionTagOrderFromListItems,
  getSidebarSessionTagListItemLabel,
  isCustomSessionTagId,
  normalizeSidebarSessionTagListItems,
  type CustomSessionTagsState,
  type SidebarSessionTagListItem,
} from '../../../shared/session-tags';
import { CustomSessionTagEditorForm, nextCustomSessionTagColorIndex } from '../../custom-session-tag-editor';
import { SessionTagIcon } from '../../session-tag-ui';
import { createSettingsSidebarTagListItemDragData, getSettingsSidebarTagListItemDragData, moveId } from '../drag-data';
import { SettingButton, setSettingsSortableRowElement, SettingDescriptionTooltip } from './primitives';

export function SidebarTagListSettingsField({
  customSessionTags,
  isCreatingTag = false,
  isModified,
  items,
  onChange,
  onCreateCustomTag,
  onCreatingTagChange,
  onCustomTagOrderChange,
  onDeleteCustomTag,
  onResetToDefault,
}: {
  /** The local daemon's custom tag catalog; absent on hosts with no daemon connection, which hides Add tag. */
  customSessionTags?: CustomSessionTagsState;
  /** Owned by the modal so a `New tag` deep link can open this form on arrival. */
  isCreatingTag?: boolean;
  isModified: boolean;
  items: readonly SidebarSessionTagListItem[];
  onChange: (items: readonly SidebarSessionTagListItem[]) => void;
  onCreateCustomTag?: (tag: { color: string; icon: string; name: string }) => void;
  onCreatingTagChange?: (isCreatingTag: boolean) => void;
  onCustomTagOrderChange?: (orderedTagIds: readonly string[]) => void;
  onDeleteCustomTag?: (tagId: string) => void;
  onResetToDefault: () => void;
}) {
  /*
   * CDXC:Sessions 2026-09-11 DECISION:
   * User: custom tags are added and sorted from the existing Sidebar Tags list. Custom rows sit in the same drag list as the built-in rows (hide, disable, reorder work unchanged) and gain a delete action; the relative order of the custom rows is written back to the daemon catalog so the phone's Tag as menu lists them in the same order.
   */
  const normalizedItems = normalizeSidebarSessionTagListItems(items, customSessionTags);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const canAddTags = customSessionTags !== undefined && onCreateCustomTag !== undefined;
  const isAddingTag = isCreatingTag && canAddTags;
  useEffect(() => {
    /*
     * CDXC:Sessions 2026-09-12 WHY:
     * The list is a collapsed disclosure, so arriving from the sidebar's New tag row has to expand it as well as open the form, or the deep link lands on a closed section.
     */
    if (isAddingTag && detailsRef.current) {
      detailsRef.current.open = true;
    }
  }, [isAddingTag]);
  const emitChange = (nextItems: readonly SidebarSessionTagListItem[]) => {
    onChange(nextItems);
    if (onCustomTagOrderChange && customSessionTags) {
      const nextOrder = getCustomSessionTagOrderFromListItems(nextItems);
      const sameOrder =
        nextOrder.length === customSessionTags.order.length &&
        nextOrder.every((tagId, index) => tagId === customSessionTags.order[index]);
      if (!sameOrder) {
        onCustomTagOrderChange(nextOrder);
      }
    }
  };
  const handleDragEnd = ((event) => {
    if (event.canceled || !isSortableOperation(event.operation)) {
      return;
    }

    const { source, target } = event.operation;
    const sourceData = source ? getSettingsSidebarTagListItemDragData(source) : undefined;
    if (!source || !sourceData) {
      return;
    }

    const targetIndex = 'index' in source && typeof source.index === 'number' ? source.index : target?.index;
    if (targetIndex == null || source.initialIndex === targetIndex) {
      return;
    }

    const itemsById = new Map<string, SidebarSessionTagListItem>(normalizedItems.map((item) => [item.id, item]));
    emitChange(
      moveId(
        normalizedItems.map((item) => item.id),
        source.initialIndex,
        targetIndex
      ).flatMap((itemId) => itemsById.get(itemId) ?? [])
    );
  }) satisfies DragDropEventHandlers['onDragEnd'];

  const updateItem = (itemId: string, patch: Partial<Pick<SidebarSessionTagListItem, 'enabled' | 'visible'>>) => {
    onChange(
      normalizedItems.map((item) =>
        item.id === itemId
          ? ({
              ...item,
              ...patch,
            } as SidebarSessionTagListItem)
          : item
      )
    );
  };
  const updateItemEnabled = (itemId: string, enabled: boolean) => {
    /*
     * CDXC:Sessions 2026-06-15-22:10:
     * The Settings switch is the primary on/off control for tag filters.
     * Switching a row off should also hide it from the sidebar filter menu,
     * while switching it back on restores visibility so the eye icon and switch
     * cannot drift into a half-on reset state.
     */
    updateItem(itemId, { enabled, visible: enabled });
  };

  const updateItemVisible = (itemId: string, visible: boolean) => {
    /*
     * CDXC:Sessions 2026-06-15-22:10:
     * The eye button mirrors the same on/off model as the switch for tag rows.
     * Showing a hidden row should re-enable it; hiding a row should disable it
     * so Settings does not present hidden filters as enabled.
     */
    updateItem(itemId, { enabled: visible, visible });
  };

  return (
    <details className='group/sidebar-tags w-full' ref={detailsRef}>
      {/*
       * CDXC:Settings 2026-09-12 WHY:
       * The named group keeps sidebar project-group grid gaps and bottom margins out of this disclosure, so the collapsed tag row has equal space above and below.
       *
       * CDXC:Sessions 2026-06-13-17:50:
       * The bottom main Settings area starts collapsed and mirrors the
       * configurable-list chrome used by tab context menu item settings:
       * full-width rows, drag handles, enabled switches, and visibility icons.
       * Separators are real rows so users can move or hide them with tags.
       *
       * CDXC:Sessions 2026-06-15-14:02:
       * The expanded Sidebar Tags list should attach directly to the disclosure
       * header; no vertical gutter belongs between the header and its rows.
       */}
      <summary className='settings-row settings-management-row flex cursor-pointer list-none items-center justify-between gap-3 py-1 marker:hidden [&::-webkit-details-marker]:hidden'>
        <div className='flex min-w-0 flex-1 items-center gap-2.5'>
          <IconChevronRight
            aria-hidden='true'
            className='size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open/sidebar-tags:rotate-90'
          />
          <span className='settings-row-label-line'>
            <span className='settings-list-row-label'>Tag filter list</span>
            <SettingDescriptionTooltip
              description='Reorder, hide, or disable sidebar tag filters and separators.'
              label='Tag filter list'
            />
          </span>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {canAddTags ? (
            <SettingButton
              disabledReason='Custom tags need a connected server.'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onCreatingTagChange?.(true);
              }}
              type='button'
              variant='outline'
            >
              Add tag
            </SettingButton>
          ) : null}
          <SettingButton
            disabled={!isModified}
            disabledReason='These tag settings already match the defaults.'
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onResetToDefault();
            }}
            type='button'
            variant='outline'
          >
            Reset to Default
          </SettingButton>
        </div>
      </summary>
      <div className='pt-3'>
        {isAddingTag && onCreateCustomTag ? (
          <div className='settings-management-row mb-2 w-full border border-border bg-muted/20' style={{ padding: 10 }}>
            <CustomSessionTagEditorForm
              onCancel={() => onCreatingTagChange?.(false)}
              onSubmit={(tag) => {
                onCreateCustomTag(tag);
                onCreatingTagChange?.(false);
              }}
              suggestedColorIndex={nextCustomSessionTagColorIndex(customSessionTags)}
            />
          </div>
        ) : null}
        <DragDropProvider onDragEnd={handleDragEnd}>
          <div className='flex w-full flex-col gap-2'>
            {normalizedItems.map((item, index) => (
              <SidebarTagListSettingsRow
                customSessionTags={customSessionTags}
                index={index}
                item={item}
                key={item.id}
                onDelete={
                  onDeleteCustomTag && item.type === 'tag' && isCustomSessionTagId(item.tag)
                    ? () => onDeleteCustomTag(item.tag)
                    : undefined
                }
                onEnabledChange={(enabled) => updateItemEnabled(item.id, enabled)}
                onVisibleChange={(visible) => updateItemVisible(item.id, visible)}
              />
            ))}
          </div>
        </DragDropProvider>
      </div>
    </details>
  );
}

export function SidebarTagListSettingsRow({
  customSessionTags,
  index,
  item,
  onDelete,
  onEnabledChange,
  onVisibleChange,
}: {
  customSessionTags?: CustomSessionTagsState;
  index: number;
  item: SidebarSessionTagListItem;
  /** Present only on custom tag rows. */
  onDelete?: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onVisibleChange: (visible: boolean) => void;
}) {
  const sortable = useSortable({
    accept: 'settings-sidebar-tag-list-item',
    data: createSettingsSidebarTagListItemDragData(item.id),
    group: 'settings-sidebar-tag-list-items',
    id: item.id,
    index,
    type: 'settings-sidebar-tag-list-item',
  });
  const { handleRef, isDragging } = sortable;
  const isDimmed = !item.enabled || !item.visible;
  const label = getSidebarSessionTagListItemLabel(item, [customSessionTags]);

  const setRowRef = (element: HTMLDivElement | null) => {
    setSettingsSortableRowElement(sortable, element);
  };

  return (
    <div
      className={cn(
        'settings-management-row flex w-full items-center gap-2 border border-border bg-muted/20 p-2',
        isDimmed && 'text-muted-foreground'
      )}
      data-dragging={String(Boolean(isDragging))}
      data-enabled={String(item.enabled)}
      data-visible={String(item.visible)}
      ref={setRowRef}
    >
      <Button aria-label={`Reorder ${label}`} ref={handleRef} size='icon' type='button' variant='ghost'>
        <IconGripVertical aria-hidden='true' />
      </Button>
      <div className='flex min-w-0 flex-1 items-center gap-3 px-2 py-2'>
        <span
          aria-hidden='true'
          className='settings-management-icon flex size-8 shrink-0 items-center justify-center bg-muted'
        >
          {item.type === 'separator' ? (
            <IconMinus className='text-muted-foreground' size={16} stroke={2} />
          ) : (
            <SessionTagIcon
              className='session-tag-colored-icon'
              fillFavorite
              size={15}
              stroke={1.8}
              tag={item.type === 'untagged' ? 'untagged' : item.tag}
            />
          )}
        </span>
        <span className='min-w-0 flex-1'>
          <span
            className={cn(
              'block truncate text-sm font-medium',
              item.type === 'separator' && 'italic text-muted-foreground'
            )}
          >
            {label}
          </span>
        </span>
      </div>
      {/* CDXC:Sessions 2026-09-12 DECISION: User: place the custom tag trash button leftmost, before the enabled switch and visibility button. */}
      {onDelete ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Delete ${label}`}
                className='shrink-0'
                onClick={onDelete}
                size='icon'
                type='button'
                variant='ghost'
              >
                <IconTrash aria-hidden='true' size={16} stroke={1.9} />
              </Button>
            }
          />
          <TooltipContent sideOffset={6}>Delete tag</TooltipContent>
        </Tooltip>
      ) : null}
      <Switch
        aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${label}`}
        checked={item.enabled}
        onCheckedChange={onEnabledChange}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={`${item.visible ? 'Hide' : 'Show'} ${label}`}
              className='shrink-0'
              onClick={() => onVisibleChange(!item.visible)}
              size='icon'
              type='button'
              variant='ghost'
            >
              {item.visible ? (
                <IconEye aria-hidden='true' size={16} stroke={1.9} />
              ) : (
                <IconEyeOff aria-hidden='true' size={16} stroke={1.9} />
              )}
            </Button>
          }
        />
        <TooltipContent sideOffset={6}>{item.visible ? 'Hide' : 'Show'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
