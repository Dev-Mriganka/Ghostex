import { IconPlus } from '@tabler/icons-react';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { SegmentedControl, SegmentedControlItem } from '../../components/ui/segmented-control';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { GxserverStashedPromptTag } from '../../shared/gxserver-protocol';
import {
  STASHED_PROMPT_TAG_COLORS,
  MAX_TAG_NAME_LENGTH,
  ALL_PROMPTS_FILTER,
  ALL_PROJECTS_VALUE,
  CURRENT_SESSION_VALUE,
  ALL_TAGS_VALUE,
  NO_TAG_VALUE,
  tagFilterValue,
} from './model';
import type { StashedPromptTagFilter, SavedPromptProjectOption, StashedPromptsView } from './model';

type StashedPromptFiltersToolbarProps = {
  view: StashedPromptsView;
  onViewChange: (view: StashedPromptsView) => void;
  createTagColor: string;
  createTagName: string;
  isCreatingTag: boolean;
  onAddPrompt: () => void;
  onCommitCreateTag: () => void;
  onCreateTagColorChange: (color: string) => void;
  onCreateTagNameChange: (name: string) => void;
  onCreateTagOpenChange: (nextOpen: boolean) => void;
  onDeleteTag: (tag: GxserverStashedPromptTag) => void;
  onProjectFilterChange: (value: string) => void;
  onSelectFilter: (filter: StashedPromptTagFilter) => void;
  projectFilterValue: string;
  projectOptions: readonly SavedPromptProjectOption[];
  promptCount: number;
  promptCountByTagId: Map<string, number>;
  showSessionFilter: boolean;
  showUntaggedFilter: boolean;
  tagFilter: StashedPromptTagFilter;
  tags: readonly GxserverStashedPromptTag[];
  untaggedPromptCount: number;
};

/*
 * CDXC:SavedPrompts 2026-08-23:
 * Project and tag filters share one compact toolbar. Dropdowns keep the whole
 * vocabulary reachable without spending two rows, the new-tag action starts
 * the tag selector menu, and Add Prompt remains pinned right.
 */
export function StashedPromptFiltersToolbar({
  view,
  onViewChange,
  createTagColor,
  createTagName,
  isCreatingTag,
  onAddPrompt,
  onCommitCreateTag,
  onCreateTagColorChange,
  onCreateTagNameChange,
  onCreateTagOpenChange,
  onDeleteTag,
  onProjectFilterChange,
  onSelectFilter,
  projectFilterValue: selectedProjectFilter,
  projectOptions,
  promptCount,
  promptCountByTagId,
  showSessionFilter,
  showUntaggedFilter,
  tagFilter,
  tags,
  untaggedPromptCount,
}: StashedPromptFiltersToolbarProps) {
  return (
    <div className='ghostex-stashed-prompt-toolbar'>
      {/*
        CDXC:Drafts 2026-08-28:
        The view toggle leads the row, mirroring the Sessions tab's scope
        segmented control. Recovered lists the composer's never-sent drafts, so
        the tag vocabulary and Add Prompt do not apply there and step aside.
      */}
      <SegmentedControl
        aria-label='Switch between saved prompts, recovered drafts, and sent messages'
        variant='raised'
        size='sm'
        value={view}
        onValueChange={(nextValue) => {
          onViewChange(nextValue as StashedPromptsView);
        }}
      >
        <SegmentedControlItem value='saved'>Saved</SegmentedControlItem>
        <SegmentedControlItem value='recovered'>Recovered</SegmentedControlItem>
        {/* CDXC:SavedPrompts 2026-09-08 DECISION: User: Sent is the third tab after Saved and Recovered; shorten Add Prompt to Add and keep its plus icon. */}
        <SegmentedControlItem value='sent'>Sent</SegmentedControlItem>
      </SegmentedControl>
      <Select
        searchable
        searchPlaceholder='Filter projects...'
        value={selectedProjectFilter}
        onValueChange={onProjectFilterChange}
      >
        <SelectTrigger
          aria-label='Filter saved prompts by project'
          className='ghostex-stashed-prompt-project-filter'
          size='sm'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align='start' alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectItem value={ALL_PROJECTS_VALUE}>All projects</SelectItem>
            {showSessionFilter ? <SelectItem value={CURRENT_SESSION_VALUE}>This session</SelectItem> : null}
            {projectOptions.map((project) => (
              <SelectItem key={project.projectId} value={`project:${project.projectId}`}>
                {project.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {view === 'saved' ? (
        <>
          <Select
            searchable
            searchPlaceholder='Filter tags...'
            value={tagFilterValue(tagFilter)}
            onValueChange={(value) => {
              if (value === ALL_TAGS_VALUE) {
                onSelectFilter(ALL_PROMPTS_FILTER);
              } else if (value === NO_TAG_VALUE) {
                onSelectFilter({ kind: 'untagged' });
              } else {
                onSelectFilter({ kind: 'tag', tagId: value.slice('tag:'.length) });
              }
            }}
          >
            <SelectTrigger
              aria-label='Filter saved prompts by tag'
              className='ghostex-stashed-prompt-tag-filter'
              size='sm'
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              align='start'
              alignItemWithTrigger={false}
              className='ghostex-stashed-prompt-tag-filter-content'
              header={
                <Popover open={isCreatingTag} onOpenChange={onCreateTagOpenChange}>
                  <PopoverTrigger
                    render={
                      <button
                        aria-label='New tag'
                        className='ghostex-stashed-prompt-tag-menu-item ghostex-stashed-prompt-tag-filter-new-button'
                        type='button'
                      >
                        <IconPlus aria-hidden='true' size={13} stroke={2.2} />
                        <span className='ghostex-stashed-prompt-tag-menu-name'>New tag…</span>
                      </button>
                    }
                  />
                  <StashedPromptCreateTagPopover
                    align='end'
                    color={createTagColor}
                    name={createTagName}
                    onColorChange={onCreateTagColorChange}
                    onCommit={onCommitCreateTag}
                    onNameChange={onCreateTagNameChange}
                  />
                </Popover>
              }
            >
              <SelectGroup>
                <SelectItem value={ALL_TAGS_VALUE}>
                  <span aria-hidden='true' className='ghostex-stashed-prompt-select-tag-dot' data-tone='all' />
                  All tags ({promptCount})
                </SelectItem>
                {tags.map((tag) => (
                  <SelectItem
                    key={tag.tagId}
                    onContextMenu={(event) => {
                      if (!tag.isBuiltin) {
                        event.preventDefault();
                        onDeleteTag(tag);
                      }
                    }}
                    title={tag.isBuiltin ? tag.name : `${tag.name}. Right-click to delete this tag.`}
                    value={`tag:${tag.tagId}`}
                  >
                    <span
                      aria-hidden='true'
                      className='ghostex-stashed-prompt-select-tag-dot'
                      style={{ '--ghostex-tag-color': tag.color } as React.CSSProperties}
                    />
                    {tag.name} ({promptCountByTagId.get(tag.tagId) ?? 0})
                  </SelectItem>
                ))}
                {showUntaggedFilter || tagFilter.kind === 'untagged' ? (
                  <SelectItem value={NO_TAG_VALUE}>
                    <span aria-hidden='true' className='ghostex-stashed-prompt-select-tag-dot' data-tone='none' />
                    No tag ({untaggedPromptCount})
                  </SelectItem>
                ) : null}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            className='ghostex-stashed-prompt-add-button'
            onClick={onAddPrompt}
            size='default'
            type='button'
            variant='outline'
          >
            <IconPlus aria-hidden='true' data-icon='inline-start' />
            Add
          </Button>
        </>
      ) : null}
    </div>
  );
}

type StashedPromptCreateTagPopoverProps = {
  align: 'center' | 'end' | 'start';
  color: string;
  name: string;
  onColorChange: (color: string) => void;
  onCommit: () => void;
  onNameChange: (name: string) => void;
};

export function StashedPromptCreateTagPopover({
  align,
  color,
  name,
  onColorChange,
  onCommit,
  onNameChange,
}: StashedPromptCreateTagPopoverProps) {
  return (
    <PopoverContent align={align} className='ghostex-stashed-prompt-tag-popover' sideOffset={6}>
      <div className='ghostex-stashed-prompt-tag-popover-title'>New tag</div>
      <input
        aria-label='Tag name'
        autoFocus
        className='ghostex-stashed-prompt-tag-popover-input'
        maxLength={MAX_TAG_NAME_LENGTH}
        onChange={(event) => onNameChange(event.target.value)}
        /*
         * The rail lives inside cmdk, which reads arrow keys and Enter as list
         * navigation. This field owns those keys while it is open.
         */
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
          }
        }}
        placeholder='Tag name'
        spellCheck={false}
        value={name}
      />
      <div className='ghostex-stashed-prompt-tag-swatches'>
        {STASHED_PROMPT_TAG_COLORS.map((swatch) => (
          <button
            aria-label={`Use color ${swatch}`}
            className='ghostex-stashed-prompt-tag-swatch'
            data-active={String(swatch === color)}
            key={swatch}
            onClick={() => onColorChange(swatch)}
            style={{ '--ghostex-tag-color': swatch } as React.CSSProperties}
            type='button'
          />
        ))}
      </div>
      <div className='ghostex-stashed-prompt-tag-popover-actions'>
        <button
          className='ghostex-stashed-prompt-editor-button ghostex-stashed-prompt-editor-button-primary'
          disabled={!name.trim()}
          onClick={onCommit}
          type='button'
        >
          Create tag
        </button>
      </div>
    </PopoverContent>
  );
}
