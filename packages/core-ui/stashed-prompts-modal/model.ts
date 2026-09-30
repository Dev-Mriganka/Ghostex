import { formatSidebarHotkeyLabel } from '@/packages/core-ui/hotkey-label';
import type { GxserverStashedPrompt } from '../../shared/gxserver-protocol';
import { GXSERVER_FAVORITE_PROMPT_TAG_ID } from '../../shared/gxserver-protocol';
import { type RecoveredSessionChatDraft } from '../chat/session-chat-draft-storage';
import { formatRelativeTime } from '../relative-time';
import type { WebviewApi } from '../webview-api';

/*
 * CDXC:SavedPrompts 2026-08-24:
 * Saved prompts are durably tied to the agent conversation they were stashed
 * from, so the library can be narrowed to the project or the conversation the
 * modal was opened for instead of only ever listing everything.
 */
export type StashedPromptsScope = 'all' | 'project' | 'session';

export type StashedPromptsModalProps = {
  /**
   * Scope the modal opens on. Optional: without it the modal picks its own
   * default — the session scope when it has session context and that scope is
   * not empty, otherwise all prompts.
   */
  initialScope?: StashedPromptsScope;
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  /**
   * The launching session, as the sidebar's combined `combined-session:` key.
   * Insertion routes back through this id, while gxserver writes and stash-row
   * comparisons use the raw ids decoded out of it.
   */
  sessionId?: string;
  stashHintTooltipDefaultOpen?: boolean;
  vscode: WebviewApi;
};

export const TOOLTIP_LINE_COUNT = 30;
export const STASH_PROMPT_HINT = `Press ${formatSidebarHotkeyLabel('alt+s')} while you're using an agent to stash your prompt`;

/*
 * CDXC:SavedPrompts 2026-08-23:
 * New tags pick their color from this palette rather than a color input: eight
 * hues that stay legible as a 7px dot, an 18px chip, and a 3px row stripe on
 * the modal's background, which a free-form picker cannot guarantee.
 */
export const STASHED_PROMPT_TAG_COLORS = [
  '#e3b341',
  '#7f9cf5',
  '#86d1a4',
  '#e3796b',
  '#c99bdd',
  '#7ec7f5',
  '#e0a3c8',
  '#9aa4b2',
] as const;

export const MAX_TAG_NAME_LENGTH = 40;

/*
 * CDXC:SavedPrompts 2026-08-23:
 * The rail filters on three distinct things, so it is a union rather than a
 * nullable tagId: "untagged" is a real selection, not the absence of one, and a
 * sentinel string mixed into the tagId space could one day collide with a tag
 * the daemon mints.
 */
export type StashedPromptTagFilter = { kind: 'all' } | { kind: 'tag'; tagId: string } | { kind: 'untagged' };

export const ALL_PROMPTS_FILTER: StashedPromptTagFilter = { kind: 'all' };
export const ALL_PROJECTS_VALUE = 'scope:all';
export const CURRENT_SESSION_VALUE = 'scope:session';
export const NO_PROJECT_VALUE = 'project:none';
export const ALL_TAGS_VALUE = 'tag:all';
export const NO_TAG_VALUE = 'tag:none';

export type SavedPromptProjectOption = {
  name: string;
  projectId: string;
};

export function projectFilterValue(scope: StashedPromptsScope, projectId: string | undefined): string {
  if (scope === 'session') {
    return CURRENT_SESSION_VALUE;
  }
  return scope === 'project' && projectId ? `project:${projectId}` : ALL_PROJECTS_VALUE;
}

export function tagFilterValue(filter: StashedPromptTagFilter): string {
  if (filter.kind === 'tag') {
    return `tag:${filter.tagId}`;
  }
  return filter.kind === 'untagged' ? NO_TAG_VALUE : ALL_TAGS_VALUE;
}

type StashedPromptDayGroup = {
  dayLabel: string;
  prompts: GxserverStashedPrompt[];
};

/*
 * CDXC:SavedPrompts 2026-07-29:
 * Search matches on whitespace-collapsed prompt text plus the project name so
 * a query typed with single spaces still finds prompts whose original body
 * uses line breaks or indentation.
 */
export function stashedPromptSearchText(prompt: GxserverStashedPrompt): string {
  return `${prompt.content} ${prompt.projectName ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stashedPromptTitle(prompt: GxserverStashedPrompt): string {
  return prompt.content.replace(/\s+/g, ' ').trim() || 'Untitled saved prompt';
}

export function promptTagIds(prompt: GxserverStashedPrompt): readonly string[] {
  return prompt.tagIds ?? [];
}

export function promptLabelTagIds(prompt: GxserverStashedPrompt): readonly string[] {
  return promptTagIds(prompt).filter((tagId) => tagId !== GXSERVER_FAVORITE_PROMPT_TAG_ID);
}

export type StashedPromptSessionContext = {
  agentSessionId: string | undefined;
  projectId: string | undefined;
  sessionId: string | undefined;
};

/*
 * CDXC:SavedPrompts 2026-08-24:
 * A prompt belongs to the conversation this modal was opened for when gxserver
 * stamped it with the same `agentSessionId` — that association is re-keyed
 * through provider compaction/resume rewrites, so it outlives the session row
 * the prompt was stashed from. Rows stashed before that column existed are
 * matched on the raw gxserver session ids instead.
 */
export function promptBelongsToSession(prompt: GxserverStashedPrompt, context: StashedPromptSessionContext): boolean {
  if (context.agentSessionId && prompt.agentSessionId === context.agentSessionId) {
    return true;
  }
  if (!context.sessionId || prompt.sessionId !== context.sessionId) {
    return false;
  }
  return context.projectId === undefined || prompt.projectId === context.projectId;
}

export function promptBelongsToProject(prompt: GxserverStashedPrompt, projectId: string | undefined): boolean {
  return projectId !== undefined && prompt.projectId === projectId;
}

export function relativeTimeLabel(isoDate: string): string {
  const { suffix, value } = formatRelativeTime(isoDate, { allowJustNow: true });
  return suffix ? `${value} ${suffix}` : value;
}

function parseStashedPromptUpdatedAt(prompt: GxserverStashedPrompt): number {
  const timestamp = Date.parse(prompt.updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function groupStashedPromptsByDay(prompts: readonly GxserverStashedPrompt[]): StashedPromptDayGroup[] {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  });
  const promptsByDay = new Map<string, GxserverStashedPrompt[]>();
  const sortedPrompts = [...prompts].sort(
    (left, right) =>
      parseStashedPromptUpdatedAt(right) - parseStashedPromptUpdatedAt(left) ||
      left.promptId.localeCompare(right.promptId)
  );
  for (const prompt of sortedPrompts) {
    const timestamp = parseStashedPromptUpdatedAt(prompt);
    const dayLabel = timestamp === 0 ? 'Earlier' : formatter.format(new Date(timestamp));
    const grouped = promptsByDay.get(dayLabel);
    if (grouped) {
      grouped.push(prompt);
    } else {
      promptsByDay.set(dayLabel, [prompt]);
    }
  }
  return [...promptsByDay.entries()].map(([dayLabel, dayPrompts]) => ({
    dayLabel,
    prompts: dayPrompts,
  }));
}

/*
 * CDXC:Drafts 2026-08-28:
 * The Recovered view lists the composer's never-sent localStorage drafts (see
 * chat/session-chat-draft-storage.ts) shaped as stash rows, so the same list,
 * day grouping, search, and insert machinery renders both views. Recovered ids
 * carry this prefix, which no gxserver prompt id can collide with because the
 * daemon mints UUIDs.
 */
export type StashedPromptsView = 'recovered' | 'saved' | 'sent';

const RECOVERED_PROMPT_ID_PREFIX = 'recovered:';

export function recoveredDraftSessionKey(promptId: string): string {
  return promptId.slice(RECOVERED_PROMPT_ID_PREFIX.length);
}

export function recoveredDraftAsPrompt(
  draft: RecoveredSessionChatDraft,
  projectNamesById: ReadonlyMap<string, string>
): GxserverStashedPrompt {
  const updatedAt = new Date(draft.updatedAt).toISOString();
  return {
    content: draft.text,
    createdAt: updatedAt,
    cwd: null,
    projectId: draft.projectId ?? null,
    projectName: (draft.projectId && projectNamesById.get(draft.projectId)) || null,
    promptId: `${RECOVERED_PROMPT_ID_PREFIX}${draft.recoveryId ? `history:${draft.recoveryId}` : draft.sessionKey}`,
    sessionId: draft.sessionId ?? null,
    updatedAt,
  };
}
