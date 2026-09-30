import { SearchableDropdownContent } from '../../components/ui/searchable-dropdown';
import { SessionChatRecoveredHistory } from '../chat/session-chat-recovered-history';
import {
  IconArrowUpRight,
  IconCopy,
  IconDeviceFloppy,
  IconFolder,
  IconPencil,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconTag,
  IconTrash,
} from '@tabler/icons-react';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { Popover, PopoverTrigger } from '../../components/ui/popover';
import type { GxserverStashedPrompt, GxserverStashedPromptTag } from '../../shared/gxserver-protocol';
import { GXSERVER_FAVORITE_PROMPT_TAG_ID, GXSERVER_STASHED_PROMPT_TAG_ID } from '../../shared/gxserver-protocol';
import {
  normalizeDiscoveredProjectIconDataUrl,
  normalizeWorkspaceProjectIcon,
  resolveWorkspaceProjectIconDataUrl,
} from '../../shared/workspace-project-appearance';
import { AppTooltip } from '../app-tooltip';
import { SidebarCommandIconGlyph } from '../sidebar-command-icon';
import { playCopySound } from '../copy-sound';
import { TOOLTIP_LINE_COUNT, stashedPromptTitle, promptTagIds, relativeTimeLabel } from './model';
import { StashedPromptCreateTagPopover } from './filters-toolbar';

type StashedPromptRowProps = {
  createTagColor: string;
  createTagName: string;
  isCreatingTag: boolean;
  isTagMenuOpen: boolean;
  onCommitCreateTag: () => void;
  onCreateTagColorChange: (color: string) => void;
  onCreateTagNameChange: (name: string) => void;
  onCreateTagOpenChange: (nextOpen: boolean) => void;
  onDelete: () => void;
  onEdit: () => void;
  onJumpToSession: () => void;
  onSelect: () => void;
  onTagMenuOpenChange: (nextOpen: boolean) => void;
  onToggleTag: (tagId: string) => void;
  prompt: GxserverStashedPrompt;
  tags: readonly GxserverStashedPromptTag[];
  tagsById: Map<string, GxserverStashedPromptTag>;
};

/**
 * CDXC:SavedPrompts 2026-07-29:
 * Saved Prompt rows show the origin project with the sidebar's icon priority:
 * a user-selected image, the repository's discovered icon, a typed glyph,
 * then a folder fallback.
 */
function StashedPromptProjectIcon({ prompt }: { prompt: GxserverStashedPrompt }) {
  const iconSource = {
    icon: normalizeWorkspaceProjectIcon(prompt.projectIcon),
    iconDataUrl: prompt.projectIconDataUrl ?? undefined,
  };
  const iconDataUrl = resolveWorkspaceProjectIconDataUrl(iconSource);
  if (iconDataUrl) {
    return <img alt='' className='ghostex-stashed-prompt-project-icon-image' draggable={false} src={iconDataUrl} />;
  }
  const discoveredIconDataUrl = normalizeDiscoveredProjectIconDataUrl(prompt.projectDiscoveredIconDataUrl);
  if (discoveredIconDataUrl) {
    return (
      <img alt='' className='ghostex-stashed-prompt-project-icon-image' draggable={false} src={discoveredIconDataUrl} />
    );
  }
  if (iconSource.icon?.kind === 'tabler') {
    return <SidebarCommandIconGlyph color={iconSource.icon.color} icon={iconSource.icon.icon} size={13} stroke={1.8} />;
  }
  return <IconFolder aria-hidden='true' size={13} stroke={1.8} />;
}

export function StashedPromptRow({
  createTagColor,
  createTagName,
  isCreatingTag,
  isTagMenuOpen,
  onCommitCreateTag,
  onCreateTagColorChange,
  onCreateTagNameChange,
  onCreateTagOpenChange,
  onDelete,
  onEdit,
  onJumpToSession,
  onSelect,
  onTagMenuOpenChange,
  onToggleTag,
  prompt,
  tags,
  tagsById,
}: StashedPromptRowProps) {
  const lines = prompt.content.trim().split('\n');
  const tooltipLines = lines.slice(0, TOOLTIP_LINE_COUNT);
  const tooltipTruncated = lines.length > TOOLTIP_LINE_COUNT;
  const tagIds = promptTagIds(prompt);
  const isFavorite = tagIds.includes(GXSERVER_FAVORITE_PROMPT_TAG_ID);
  const labelTags = tagIds
    .filter((tagId) => tagId !== GXSERVER_FAVORITE_PROMPT_TAG_ID)
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is GxserverStashedPromptTag => tag !== undefined);
  const visibleRowTags = labelTags.filter((tag) => tag.tagId !== GXSERVER_STASHED_PROMPT_TAG_ID);
  /*
   * CDXC:SavedPrompts 2026-08-23:
   * The row's left edge carries its first non-Favorites tag color. That stripe
   * is what separates one prompt from the next now that there are no rules
   * between rows: a repeating vertical mark the eye can group by, instead of a
   * hairline that competes with the hover and selection fills.
   */
  const stripeColor = labelTags[0]?.color;
  /*
   * CDXC:SavedPrompts 2026-08-24:
   * A prompt is jumpable while gxserver can still name where it came from: the
   * conversation id survives the session row, so either id is enough to open
   * something — waking, restoring, or resuming as needed.
   */
  const canJumpToSession = Boolean(prompt.agentSessionId || prompt.sessionId);

  return (
    <CommandItem
      className='ghostex-stashed-prompt-item'
      data-favorite={String(isFavorite)}
      /*
       * CDXC:SavedPrompts 2026-08-23:
       * The tag menu is portalled out of this row, so moving the pointer into
       * it ends the row's :hover and empties its :focus-within. Without this
       * flag the action cluster would collapse to display:none, the open
       * popover's anchor would measure 0x0, and the menu would jump to the top
       * left of the window mid-hover. Pin the cluster open for as long as the
       * menu it launched is open.
       */
      data-tag-menu-open={String(isTagMenuOpen)}
      onSelect={onSelect}
      style={stripeColor ? ({ '--ghostex-stashed-prompt-stripe': stripeColor } as React.CSSProperties) : undefined}
      value={prompt.promptId}
    >
      <span aria-hidden='true' className='ghostex-stashed-prompt-stripe' />
      <span className='ghostex-stashed-prompt-content'>
        <span className='ghostex-stashed-prompt-top-line'>
          <AppTooltip
            align='start'
            content={
              <div className='ghostex-stashed-prompt-tooltip-body'>
                {tooltipLines.join('\n')}
                {tooltipTruncated ? '\n…' : ''}
              </div>
            }
            contentStyle={{ width: 'min(560px, calc(100vw - 32px))' }}
            side='bottom'
            sideOffset={4}
          >
            <span className='ghostex-command-palette-copy'>
              <span className='ghostex-command-palette-title'>{stashedPromptTitle(prompt)}</span>
            </span>
          </AppTooltip>
          {/*
            The persistent star marks a favorite while scanning, and gives way
            to the action cluster on hover so the two never stack in the same
            corner.
          */}
          {isFavorite ? (
            <span aria-label='Favorite' className='ghostex-stashed-prompt-favorite-mark'>
              <IconStarFilled aria-hidden='true' size={13} />
            </span>
          ) : null}
          <span className='ghostex-stashed-prompt-actions'>
            {canJumpToSession ? (
              <AppTooltip content='Go to session' side='top' sideOffset={6}>
                <button
                  aria-label='Go to session'
                  className='ghostex-stashed-prompt-action'
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onJumpToSession();
                  }}
                  type='button'
                >
                  <IconArrowUpRight aria-hidden='true' size={14} stroke={1.9} />
                </button>
              </AppTooltip>
            ) : null}
            <button
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={isFavorite}
              className='ghostex-stashed-prompt-action ghostex-stashed-prompt-action-favorite'
              data-active={String(isFavorite)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleTag(GXSERVER_FAVORITE_PROMPT_TAG_ID);
              }}
              type='button'
            >
              {isFavorite ? (
                <IconStarFilled aria-hidden='true' size={14} />
              ) : (
                <IconStar aria-hidden='true' size={14} stroke={1.9} />
              )}
            </button>
            <Popover open={isTagMenuOpen} onOpenChange={onTagMenuOpenChange}>
              <PopoverTrigger
                render={
                  <button
                    aria-label='Tags'
                    className='ghostex-stashed-prompt-action'
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    type='button'
                  >
                    <IconTag aria-hidden='true' size={14} stroke={1.9} />
                  </button>
                }
              />
              <SearchableDropdownContent
                align='end'
                className='ghostex-stashed-prompt-tag-popover'
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                sideOffset={6}
              >
                <Command>
                  <CommandInput autoFocus placeholder='Filter tags...' aria-label='Filter tags' clearOnEscape={false} />
                  <CommandList aria-multiselectable>
                    <CommandEmpty>No tags found.</CommandEmpty>
                    {tags
                      .filter((tag) => tag.tagId !== GXSERVER_FAVORITE_PROMPT_TAG_ID)
                      .map((tag) => (
                        <CommandItem
                          className='ghostex-stashed-prompt-tag-menu-item'
                          data-checked={tagIds.includes(tag.tagId)}
                          aria-selected={tagIds.includes(tag.tagId)}
                          value={tag.tagId}
                          keywords={[tag.name]}
                          key={tag.tagId}
                          onSelect={() => {
                            onToggleTag(tag.tagId);
                          }}
                          style={{ '--ghostex-tag-color': tag.color } as React.CSSProperties}
                        >
                          <span aria-hidden='true' className='ghostex-stashed-prompt-tag-dot' />
                          <span className='ghostex-stashed-prompt-tag-menu-name'>{tag.name}</span>
                        </CommandItem>
                      ))}
                  </CommandList>
                </Command>
                <Popover open={isCreatingTag} onOpenChange={onCreateTagOpenChange}>
                  <PopoverTrigger
                    render={
                      <button className='ghostex-stashed-prompt-tag-menu-item' type='button'>
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
              </SearchableDropdownContent>
            </Popover>
            <button
              aria-label='Copy prompt'
              className='ghostex-stashed-prompt-action copy-cursor'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                playCopySound();
                void navigator.clipboard.writeText(prompt.content);
              }}
              type='button'
            >
              <IconCopy aria-hidden='true' size={14} stroke={1.9} />
            </button>
            <button
              aria-label='Edit prompt'
              className='ghostex-stashed-prompt-action'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onEdit();
              }}
              type='button'
            >
              <IconPencil aria-hidden='true' size={14} stroke={1.9} />
            </button>
            <button
              aria-label='Delete prompt'
              className='ghostex-stashed-prompt-action'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }}
              type='button'
            >
              <IconTrash aria-hidden='true' size={14} stroke={1.9} />
            </button>
          </span>
        </span>
        <span className='ghostex-stashed-prompt-row-meta'>
          <span className='ghostex-stashed-prompt-project'>
            <span aria-hidden='true' className='ghostex-stashed-prompt-project-icon'>
              <StashedPromptProjectIcon prompt={prompt} />
            </span>
            <span className='ghostex-stashed-prompt-project-name'>{prompt.projectName ?? 'No project'}</span>
            {/*
              CDXC:SavedPrompts 2026-08-24:
              The origin conversation's current title, not the one it had when
              the prompt was stashed: gxserver resolves it through the
              conversation id, so a renamed or resumed session still reads as
              the place this prompt came from.
            */}
            {prompt.sessionTitle ? (
              <span
                className='ghostex-stashed-prompt-chip ghostex-stashed-prompt-session-chip'
                title={prompt.sessionTitle}
              >
                <span className='ghostex-stashed-prompt-session-chip-label'>{prompt.sessionTitle}</span>
              </span>
            ) : null}
            {visibleRowTags.length > 0 ? (
              <span className='ghostex-stashed-prompt-chips'>
                {visibleRowTags.map((tag) => (
                  <span
                    className='ghostex-stashed-prompt-chip'
                    key={tag.tagId}
                    style={{ '--ghostex-tag-color': tag.color } as React.CSSProperties}
                  >
                    <span aria-hidden='true' className='ghostex-stashed-prompt-chip-dot' />
                    {tag.name}
                  </span>
                ))}
              </span>
            ) : null}
          </span>
          <span className='ghostex-stashed-prompt-time'>{relativeTimeLabel(prompt.updatedAt)}</span>
        </span>
      </span>
    </CommandItem>
  );
}

type RecoveredDraftRowProps = {
  earlierVersions?: GxserverStashedPrompt[];
  onSelectVersion?: (prompt: GxserverStashedPrompt) => void;
  kind: 'draft' | 'message';
  onDelete: () => void;
  onJumpToSession: () => void;
  onSaveToLibrary: () => void;
  onSelect: () => void;
  prompt: GxserverStashedPrompt;
};

/*
 * CDXC:Drafts 2026-08-28:
 * A recovered composer draft rendered in the stash row's clothes. It has no
 * tags, no editing, and no server row behind it, so the action cluster is the
 * recovery vocabulary instead: insert (row select), jump to the origin
 * session, promote into the saved library, copy, or discard the draft.
 */
export function RecoveredDraftRow({
  earlierVersions,
  onSelectVersion,
  kind,
  onDelete,
  onJumpToSession,
  onSaveToLibrary,
  onSelect,
  prompt,
}: RecoveredDraftRowProps) {
  const lines = prompt.content.trim().split('\n');
  const tooltipLines = lines.slice(0, TOOLTIP_LINE_COUNT);
  const tooltipTruncated = lines.length > TOOLTIP_LINE_COUNT;

  return (
    <CommandItem className='ghostex-stashed-prompt-item' onSelect={onSelect} value={prompt.promptId}>
      <span aria-hidden='true' className='ghostex-stashed-prompt-stripe' />
      <span className='ghostex-stashed-prompt-content'>
        <span className='ghostex-stashed-prompt-top-line'>
          <AppTooltip
            align='start'
            content={
              <div className='ghostex-stashed-prompt-tooltip-body'>
                {tooltipLines.join('\n')}
                {tooltipTruncated ? '\n…' : ''}
              </div>
            }
            contentStyle={{ width: 'min(560px, calc(100vw - 32px))' }}
            side='bottom'
            sideOffset={4}
          >
            <span className='ghostex-command-palette-copy'>
              <span className='ghostex-command-palette-title'>{stashedPromptTitle(prompt)}</span>
            </span>
          </AppTooltip>
          <span className='ghostex-stashed-prompt-actions'>
            {prompt.sessionId || prompt.agentSessionId ? (
              <AppTooltip content='Go to session' side='top' sideOffset={6}>
                <button
                  aria-label='Go to session'
                  className='ghostex-stashed-prompt-action'
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onJumpToSession();
                  }}
                  type='button'
                >
                  <IconArrowUpRight aria-hidden='true' size={14} stroke={1.9} />
                </button>
              </AppTooltip>
            ) : null}
            <AppTooltip content='Save to library' side='top' sideOffset={6}>
              <button
                aria-label='Save to library'
                className='ghostex-stashed-prompt-action'
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSaveToLibrary();
                }}
                type='button'
              >
                <IconDeviceFloppy aria-hidden='true' size={14} stroke={1.9} />
              </button>
            </AppTooltip>
            <button
              aria-label={`Copy ${kind}`}
              className='ghostex-stashed-prompt-action copy-cursor'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                playCopySound();
                void navigator.clipboard.writeText(prompt.content);
              }}
              type='button'
            >
              <IconCopy aria-hidden='true' size={14} stroke={1.9} />
            </button>
            <button
              aria-label={earlierVersions?.length ? 'Delete draft and earlier versions' : `Delete ${kind}`}
              className='ghostex-stashed-prompt-action'
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete();
              }}
              type='button'
            >
              <IconTrash aria-hidden='true' size={14} stroke={1.9} />
            </button>
          </span>
        </span>
        <span className='ghostex-stashed-prompt-row-meta'>
          <span className='ghostex-stashed-prompt-project'>
            <span aria-hidden='true' className='ghostex-stashed-prompt-project-icon'>
              <StashedPromptProjectIcon prompt={prompt} />
            </span>
            <span className='ghostex-stashed-prompt-project-name'>{prompt.projectName ?? 'Unknown project'}</span>
          </span>
          {earlierVersions?.length && onSelectVersion ? (
            <SessionChatRecoveredHistory versions={earlierVersions} onSelect={onSelectVersion} />
          ) : null}
          <span className='ghostex-stashed-prompt-time'>{relativeTimeLabel(prompt.updatedAt)}</span>
        </span>
      </span>
    </CommandItem>
  );
}
