import { importDraftRecovery, dismissDraftRecovery } from './chat/session-chat-draft-recovery';
import {
  deleteSentSessionChatMessage,
  listSentSessionChatMessages,
  recordDeliveredSessionChatDrafts,
  subscribeSentSessionChatMessages,
} from './chat/session-chat-sent-history';
import { IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from '../components/ui/command';
import { Button } from '../components/ui/button';
import { Field, FieldGroup, FieldLabel } from '../components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { parseGxserverPresentationProjectSessionId } from '../shared/gxserver-presentation-sidebar-projection';
import type { GxserverStashedPrompt, GxserverStashedPromptTag } from '../shared/gxserver-protocol';
import { GXSERVER_FAVORITE_PROMPT_TAG_ID } from '../shared/gxserver-protocol';
import { trimPromptEditorTrailingSpaces } from '../shared/prompt-editor-text';
import type { ExtensionToSidebarMessage } from '../shared/session-grid-contract';
import { AppTooltip, TooltipProvider } from './app-tooltip';
import { DelayedLoadingIndicator } from './delayed-loading-indicator';
import {
  deleteStoredSessionChatDraft,
  listRecoveredSessionChatDrafts,
  reconcileSessionChatDraftsFromServer,
  type RecoveredSessionChatDraft,
} from './chat/session-chat-draft-storage';
import { QuickAccessHeader } from './quick-access-tabs';
import { useSidebarStore } from './sidebar-store';
import { StashedPromptEditorTagSelect } from './stashed-prompts-editor-tag-select';
import { useSidebarTooltipDelayMs } from './tooltip-delay';
import {
  STASH_PROMPT_HINT,
  STASHED_PROMPT_TAG_COLORS,
  ALL_PROMPTS_FILTER,
  ALL_PROJECTS_VALUE,
  CURRENT_SESSION_VALUE,
  NO_PROJECT_VALUE,
  NO_TAG_VALUE,
  projectFilterValue,
  stashedPromptSearchText,
  promptTagIds,
  promptLabelTagIds,
  promptBelongsToSession,
  promptBelongsToProject,
  groupStashedPromptsByDay,
  recoveredDraftSessionKey,
  recoveredDraftAsPrompt,
} from './stashed-prompts-modal/model';
import type {
  StashedPromptsScope,
  StashedPromptsModalProps,
  StashedPromptTagFilter,
  SavedPromptProjectOption,
  StashedPromptSessionContext,
  StashedPromptsView,
} from './stashed-prompts-modal/model';
export type { StashedPromptsScope, StashedPromptsModalProps } from './stashed-prompts-modal/model';
import { StashedPromptFiltersToolbar } from './stashed-prompts-modal/filters-toolbar';
import { StashedPromptRow, RecoveredDraftRow } from './stashed-prompts-modal/rows';

export function StashedPromptsModal({
  initialScope,
  isOpen,
  onClose,
  projectId,
  sessionId,
  stashHintTooltipDefaultOpen = false,
  vscode,
}: StashedPromptsModalProps) {
  const tooltipDelayMs = useSidebarTooltipDelayMs();
  const [prompts, setPrompts] = useState<GxserverStashedPrompt[]>();
  const [tags, setTags] = useState<GxserverStashedPromptTag[]>([]);
  const [view, setView] = useState<StashedPromptsView>('saved');
  const [sentMessages, setSentMessages] = useState<GxserverStashedPrompt[]>([]);
  const [recoveredDrafts, setRecoveredDrafts] = useState<RecoveredSessionChatDraft[]>([]);
  const [scope, setScope] = useState<StashedPromptsScope>(initialScope ?? 'all');
  const [scopeProjectId, setScopeProjectId] = useState<string>();
  const [tagFilter, setTagFilter] = useState<StashedPromptTagFilter>(ALL_PROMPTS_FILTER);
  const [tagMenuPromptId, setTagMenuPromptId] = useState<string>();
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [createTagName, setCreateTagName] = useState('');
  const [createTagColor, setCreateTagColor] = useState<string>(STASHED_PROMPT_TAG_COLORS[1]);
  const [tagError, setTagError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingPrompt, setIsAddingPrompt] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string>();
  const [draftContent, setDraftContent] = useState('');
  const [draftProjectId, setDraftProjectId] = useState(NO_PROJECT_VALUE);
  const [draftTagId, setDraftTagId] = useState(NO_TAG_VALUE);
  const [draftIsFavorite, setDraftIsFavorite] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [selectedPromptValue, setSelectedPromptValue] = useState('');
  const latestRequestIdRef = useRef<string | undefined>(undefined);
  const latestHistoryRequestIdsRef = useRef<Partial<Record<'recovered' | 'sent', string>>>({});
  const [recoveryResult, setRecoveryResult] = useState<Extract<
    ExtensionToSidebarMessage,
    { type: 'stashedPromptsResult' }
  > | null>(null);
  const [sentResult, setSentResult] = useState<Extract<
    ExtensionToSidebarMessage,
    { type: 'stashedPromptsResult' }
  > | null>(null);
  const importedRecoveryResultRef = useRef(recoveryResult);
  const importedSentResultRef = useRef(sentResult);
  const latestSaveRequestIdRef = useRef<string | undefined>(undefined);
  /*
   * CDXC:Drafts 2026-08-28:
   * A save posted from a Recovered row must not run the Add-form's success
   * choreography (closing the editor, clearing the search): the user is
   * triaging a list, not filling a form.
   */
  const saveOriginRef = useRef<'editor' | 'recovered'>('editor');
  const requestCounterRef = useRef(0);
  const draftTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptListRef = useRef<HTMLDivElement>(null);
  /*
   * CDXC:SavedPrompts 2026-08-23:
   * The tag menu that opened the create form: 'row' applies the new tag to that
   * prompt on creation, 'rail' switches the filter to it instead.
   */
  const createTagOriginRef = useRef<'rail' | 'row'>('rail');
  const createTagPromptIdRef = useRef<string | undefined>(undefined);
  /*
   * The daemon owns tag ids, so a tag created from a row's menu cannot be
   * applied in the same message. Remember what to file once the refreshed
   * catalogue comes back naming it.
   */
  const pendingTagApplicationRef = useRef<{ name: string; promptId: string | undefined }>(undefined);
  /*
   * CDXC:SavedPrompts 2026-08-24:
   * The "default to this session" decision needs the loaded rows, so it runs
   * once per open, on the first list result, and never again — otherwise a
   * later refresh would yank the scope back from under the user.
   */
  const hasResolvedDefaultScopeRef = useRef(false);

  /*
   * CDXC:SavedPrompts 2026-08-24:
   * The `sessionId` prop is the sidebar's combined presentation key, while
   * stash rows carry gxserver's raw ids. Decode once here so scope matching and
   * the save form both speak the daemon's id vocabulary.
   */
  const combinedSessionReference = useMemo(
    () => (sessionId ? parseGxserverPresentationProjectSessionId(sessionId) : undefined),
    [sessionId]
  );
  const rawSessionId = combinedSessionReference?.sessionId ?? sessionId;
  const rawProjectId = projectId ?? combinedSessionReference?.projectId;
  const currentAgentSessionId = useSidebarStore((state) =>
    sessionId ? state.sessionsById[sessionId]?.agentSessionId : undefined
  );
  const groupOrder = useSidebarStore((state) => state.groupOrder);
  const groupsById = useSidebarStore((state) => state.groupsById);
  const sessionContext = useMemo<StashedPromptSessionContext>(
    () => ({ agentSessionId: currentAgentSessionId, projectId: rawProjectId, sessionId: rawSessionId }),
    [currentAgentSessionId, rawProjectId, rawSessionId]
  );
  const hasSessionScope = Boolean(rawSessionId || currentAgentSessionId);
  const projectOptions = useMemo(() => {
    const options = new Map<string, SavedPromptProjectOption>();
    for (const groupId of groupOrder) {
      const group = groupsById[groupId];
      const groupProjectId = group?.projectContext?.editor.projectId;
      if (groupProjectId && !options.has(groupProjectId)) {
        options.set(groupProjectId, { name: group.title, projectId: groupProjectId });
      }
    }
    for (const prompt of prompts ?? []) {
      if (prompt.projectId && !options.has(prompt.projectId)) {
        options.set(prompt.projectId, {
          name: prompt.projectName?.trim() || 'Unnamed project',
          projectId: prompt.projectId,
        });
      }
    }
    if (rawProjectId && !options.has(rawProjectId)) {
      options.set(rawProjectId, { name: 'This project', projectId: rawProjectId });
    }
    return [...options.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [groupOrder, groupsById, prompts, rawProjectId]);
  /*
   * A scope whose segment is not on screen must not silently filter the list,
   * so an unavailable scope reads as "all" without rewriting the user's choice.
   */
  const effectiveScope: StashedPromptsScope =
    (scope === 'session' && !hasSessionScope) || (scope === 'project' && !scopeProjectId) ? 'all' : scope;

  useEffect(() => {
    if (!isOpen) {
      setView('saved');
      setRecoveredDrafts([]);
      setScopeProjectId(undefined);
      setTagFilter(ALL_PROMPTS_FILTER);
      setTagMenuPromptId(undefined);
      setIsCreatingTag(false);
      setCreateTagName('');
      setTagError(undefined);
      setSearchQuery('');
      setIsAddingPrompt(false);
      setEditingPromptId(undefined);
      setDraftContent('');
      setDraftProjectId(NO_PROJECT_VALUE);
      setDraftTagId(NO_TAG_VALUE);
      setDraftIsFavorite(false);
      setIsSavingPrompt(false);
      setSaveError(undefined);
      latestRequestIdRef.current = undefined;
      latestHistoryRequestIdsRef.current = {};
      setRecoveryResult(null);
      setSentResult(null);
      importedRecoveryResultRef.current = null;
      importedSentResultRef.current = null;
      latestSaveRequestIdRef.current = undefined;
      saveOriginRef.current = 'editor';
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || view !== 'sent') return;
    if (sentResult && importedSentResultRef.current !== sentResult) {
      recordDeliveredSessionChatDrafts(sentResult.deliveredDrafts ?? []);
      importedSentResultRef.current = sentResult;
    }
    const refresh = (): void => setSentMessages(listSentSessionChatMessages());
    refresh();
    return subscribeSentSessionChatMessages(refresh);
  }, [isOpen, view, sentResult]);

  /*
   * CDXC:SavedPrompts 2026-09-11 WHY:
   * Recovery import and storage enumeration blocked the saved library's first paint even while Recovered was hidden.
   * Load history only when its tab is selected, and retain the saved library across closes so reopening paints it before the refresh completes.
   */
  useEffect(() => {
    if (isOpen && view === 'recovered') {
      if (recoveryResult && importedRecoveryResultRef.current !== recoveryResult) {
        importDraftRecovery(recoveryResult.recoveryDrafts ?? []);
        reconcileSessionChatDraftsFromServer(recoveryResult.drafts ?? []);
        importedRecoveryResultRef.current = recoveryResult;
      }
      setRecoveredDrafts(listRecoveredSessionChatDrafts());
    }
  }, [isOpen, view, recoveryResult]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMessage = (event: MessageEvent<ExtensionToSidebarMessage>) => {
      if (event.data?.type === 'saveStashedPromptResult') {
        if (event.data.requestId !== latestSaveRequestIdRef.current) {
          return;
        }
        setIsSavingPrompt(false);
        const saveOrigin = saveOriginRef.current;
        saveOriginRef.current = 'editor';
        if (!event.data.ok || !event.data.prompt) {
          const message = event.data.error ?? 'Could not save this prompt.';
          if (saveOrigin === 'recovered') {
            setTagError(message);
          } else {
            setSaveError(message);
          }
          return;
        }
        const savedPrompt = event.data.prompt;
        setPrompts((current) => [
          savedPrompt,
          ...(current ?? []).filter((prompt) => prompt.promptId !== savedPrompt.promptId),
        ]);
        if (saveOrigin === 'recovered') {
          latestSaveRequestIdRef.current = undefined;
          return;
        }
        setDraftContent('');
        setDraftProjectId(NO_PROJECT_VALUE);
        setDraftTagId(NO_TAG_VALUE);
        setDraftIsFavorite(false);
        setSearchQuery('');
        setSaveError(undefined);
        setIsAddingPrompt(false);
        setEditingPromptId(undefined);
        latestSaveRequestIdRef.current = undefined;
        return;
      }
      /*
       * CDXC:SavedPrompts 2026-08-23:
       * Tag mutations answer with the whole refreshed catalogue. A delete also
       * names the tag it removed so the rows this modal is still holding drop
       * that assignment without a second round trip for the prompt list.
       */
      if (event.data?.type === 'stashedPromptTagsResult') {
        if (!event.data.ok) {
          setTagError(event.data.error ?? 'Could not update tags.');
          return;
        }
        setTagError(undefined);
        setTags(event.data.tags);
        const deletedTagId = event.data.deletedTagId;
        if (deletedTagId) {
          setPrompts((current) =>
            current?.map((prompt) =>
              promptTagIds(prompt).includes(deletedTagId)
                ? { ...prompt, tagIds: promptTagIds(prompt).filter((tagId) => tagId !== deletedTagId) }
                : prompt
            )
          );
          setTagFilter((current) =>
            current.kind === 'tag' && current.tagId === deletedTagId ? ALL_PROMPTS_FILTER : current
          );
        }
        return;
      }
      if (event.data?.type === 'setStashedPromptTagsResult') {
        if (!event.data.ok || !event.data.prompt) {
          setTagError(event.data.error ?? "Could not update this prompt's tags.");
          return;
        }
        setTagError(undefined);
        const taggedPrompt = event.data.prompt;
        setPrompts((current) =>
          current?.map((prompt) => (prompt.promptId === taggedPrompt.promptId ? taggedPrompt : prompt))
        );
        return;
      }
      if (event.data?.type !== 'stashedPromptsResult') {
        return;
      }
      if (event.data.requestId === latestHistoryRequestIdsRef.current.recovered) {
        setRecoveryResult(event.data);
        return;
      }
      if (event.data.requestId === latestHistoryRequestIdsRef.current.sent) {
        setSentResult(event.data);
        return;
      }
      if (event.data.requestId !== latestRequestIdRef.current) {
        return;
      }
      setPrompts(event.data.prompts);
      setTags(event.data.tags ?? []);
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isAddingPrompt) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('.ghostex-stashed-prompts-dialog [data-slot="command-input"]')?.focus();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isAddingPrompt, isOpen]);

  useEffect(() => {
    if (!isOpen || !isAddingPrompt) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      draftTextareaRef.current?.focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest('[data-slot=popover-content], [data-slot=select-content]')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isSavingPrompt) {
        return;
      }
      setIsAddingPrompt(false);
      setEditingPromptId(undefined);
      setDraftContent('');
      setDraftProjectId(NO_PROJECT_VALUE);
      setDraftTagId(NO_TAG_VALUE);
      setDraftIsFavorite(false);
      setSaveError(undefined);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isAddingPrompt, isOpen, isSavingPrompt]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    requestCounterRef.current += 1;
    const requestId = `stashed-prompts-${Date.now()}-${requestCounterRef.current}`;
    latestRequestIdRef.current = requestId;
    /*
     * CDXC:SavedPrompts 2026-08-24:
     * The whole library is loaded on every open and narrowed client-side, so
     * switching to the All scope never costs a round trip and the scope counts
     * describe the same set the list is drawn from.
     */
    hasResolvedDefaultScopeRef.current = false;
    setScope(initialScope ?? 'all');
    setScopeProjectId(rawProjectId);
    vscode.postMessage({
      requestId,
      includeRecovery: false,
      includeDelivered: false,
      type: 'requestStashedPrompts',
    });
  }, [initialScope, isOpen, rawProjectId, vscode]);

  useEffect(() => {
    if (!isOpen || view === 'saved' || latestHistoryRequestIdsRef.current[view]) return;
    const requestId = `stashed-prompts-${view}-${Date.now()}-${++requestCounterRef.current}`;
    latestHistoryRequestIdsRef.current[view] = requestId;
    vscode.postMessage({
      requestId,
      includeRecovery: view === 'recovered',
      includeDelivered: view === 'sent',
      type: 'requestStashedPrompts',
    });
  }, [isOpen, view, vscode]);

  /*
   * CDXC:SavedPrompts 2026-08-24:
   * Without a launcher-pinned scope the modal opens on this session when it has
   * session context and that scope actually has prompts in it. It never opens
   * on an empty filtered list.
   */
  useEffect(() => {
    if (!isOpen || prompts === undefined || hasResolvedDefaultScopeRef.current) {
      return;
    }
    hasResolvedDefaultScopeRef.current = true;
    if (initialScope !== undefined || !hasSessionScope) {
      return;
    }
    if (prompts.some((prompt) => promptBelongsToSession(prompt, sessionContext))) {
      setScope('session');
    }
  }, [hasSessionScope, initialScope, isOpen, prompts, sessionContext]);

  /*
   * CDXC:SavedPrompts 2026-08-23:
   * The rail refines the current search rather than replacing it, so pill
   * counts describe the searched set: "3 of what you are looking at is tagged
   * Release", not a standing total that contradicts the visible list.
   */
  /*
   * CDXC:Drafts 2026-08-28:
   * Recovered draft keys carry only ids, so project names resolve through the
   * sidebar's project vocabulary the modal already builds for its filters.
   */
  const projectNamesById = useMemo(
    () => new Map(projectOptions.map((project) => [project.projectId, project.name])),
    [projectOptions]
  );
  const recoveredPrompts = useMemo(
    () => recoveredDrafts.map((draft) => recoveredDraftAsPrompt(draft, projectNamesById)),
    [projectNamesById, recoveredDrafts]
  );
  const recoveredVersionsById = useMemo(
    () =>
      new Map(
        recoveredDrafts.map((draft) => [
          recoveredDraftAsPrompt(draft, projectNamesById).promptId,
          (draft.earlierVersions ?? []).map((version) => recoveredDraftAsPrompt(version, projectNamesById)),
        ])
      ),
    [projectNamesById, recoveredDrafts]
  );
  const sentPrompts = useMemo(
    () =>
      sentMessages.map((message) => ({
        ...message,
        projectName: (message.projectId && projectNamesById.get(message.projectId)) || null,
      })),
    [projectNamesById, sentMessages]
  );
  const activePrompts = view === 'sent' ? sentPrompts : view === 'recovered' ? recoveredPrompts : prompts;
  const isListReady = view !== 'saved' || prompts !== undefined;

  const searchedPrompts = useMemo(() => {
    if (!activePrompts) {
      return [];
    }
    const query = searchQuery.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!query) {
      return activePrompts;
    }
    return activePrompts.filter(
      (prompt) =>
        stashedPromptSearchText(prompt).includes(query) ||
        (view === 'recovered' &&
          recoveredVersionsById
            .get(prompt.promptId)
            ?.some((version) => stashedPromptSearchText(version).includes(query)))
    );
  }, [activePrompts, searchQuery, view, recoveredVersionsById]);

  /*
   * CDXC:SavedPrompts 2026-08-24:
   * Scope narrows the searched set before the tag rail sees it, so the pill
   * counts keep describing what is actually on screen: search AND scope AND
   * tag, in that order.
   */
  const scopedPrompts = useMemo(() => {
    if (effectiveScope === 'all') {
      return searchedPrompts;
    }
    if (effectiveScope === 'project') {
      return searchedPrompts.filter((prompt) => promptBelongsToProject(prompt, scopeProjectId));
    }
    return searchedPrompts.filter((prompt) => promptBelongsToSession(prompt, sessionContext));
  }, [effectiveScope, scopeProjectId, searchedPrompts, sessionContext]);

  const visiblePrompts = useMemo(() => {
    // Only saved prompts carry tags.
    if (view !== 'saved' || tagFilter.kind === 'all') {
      return scopedPrompts;
    }
    if (tagFilter.kind === 'untagged') {
      return scopedPrompts.filter((prompt) => promptLabelTagIds(prompt).length === 0);
    }
    return scopedPrompts.filter((prompt) => promptTagIds(prompt).includes(tagFilter.tagId));
  }, [scopedPrompts, tagFilter, view]);

  const untaggedPromptCount = useMemo(
    () => scopedPrompts.filter((prompt) => promptLabelTagIds(prompt).length === 0).length,
    [scopedPrompts]
  );

  /*
   * CDXC:SavedPrompts 2026-08-23:
   * Whether "No tag" exists is decided by the whole library, not the current
   * search: its count narrows with the query like every other pill, but the
   * pill itself must not blink in and out of the rail as the user types.
   */
  const hasTaggedPrompt = useMemo(
    () => (prompts ?? []).some((prompt) => promptLabelTagIds(prompt).length > 0),
    [prompts]
  );

  const promptCountByTagId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const prompt of scopedPrompts) {
      for (const tagId of promptTagIds(prompt)) {
        counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
      }
    }
    return counts;
  }, [scopedPrompts]);

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.tagId, tag])), [tags]);

  const groupedVisiblePrompts = useMemo(() => groupStashedPromptsByDay(visiblePrompts), [visiblePrompts]);
  const topPromptValue = visiblePrompts[0]?.promptId ?? '';

  useLayoutEffect(() => {
    if (!isOpen || isAddingPrompt) {
      return;
    }
    setSelectedPromptValue(topPromptValue);
    if (promptListRef.current) {
      promptListRef.current.scrollTop = 0;
    }
  }, [isAddingPrompt, isOpen, searchQuery, topPromptValue]);

  const openAddPrompt = () => {
    const defaultProjectId = effectiveScope === 'project' ? scopeProjectId : rawProjectId;
    const defaultTagId =
      tagFilter.kind === 'tag' && tagFilter.tagId !== GXSERVER_FAVORITE_PROMPT_TAG_ID
        ? `tag:${tagFilter.tagId}`
        : NO_TAG_VALUE;
    setEditingPromptId(undefined);
    setDraftContent('');
    setDraftProjectId(defaultProjectId ? `project:${defaultProjectId}` : NO_PROJECT_VALUE);
    setDraftTagId(defaultTagId);
    setDraftIsFavorite(tagFilter.kind === 'tag' && tagFilter.tagId === GXSERVER_FAVORITE_PROMPT_TAG_ID);
    setSaveError(undefined);
    setIsAddingPrompt(true);
  };

  const insertPrompt = (prompt: GxserverStashedPrompt) => {
    vscode.postMessage({
      content: prompt.content,
      promptId: prompt.promptId,
      ...(sessionId ? { sessionId } : {}),
      type: 'insertStashedPrompt',
    });
    onClose();
  };

  const deletePrompt = (prompt: GxserverStashedPrompt) => {
    vscode.postMessage({ promptId: prompt.promptId, type: 'deleteStashedPrompt' });
    setPrompts((current) => current?.filter((candidate) => candidate.promptId !== prompt.promptId));
  };

  const deleteRecoveredDraft = (prompt: GxserverStashedPrompt) => {
    const sessionKey = recoveredDraftSessionKey(prompt.promptId);
    if (sessionKey.startsWith('history:')) dismissDraftRecovery(sessionKey.slice('history:'.length));
    else deleteStoredSessionChatDraft(sessionKey);
    setRecoveredDrafts(listRecoveredSessionChatDrafts());
  };

  /*
   * CDXC:Drafts 2026-08-28:
   * Promotes a recovered draft into the real library through the normal save
   * path, keeping the draft itself in place — recovery must never destroy the
   * only copy of unsent text.
   */
  const saveRecoveredDraftToLibrary = (prompt: GxserverStashedPrompt) => {
    if (isSavingPrompt) {
      return;
    }
    requestCounterRef.current += 1;
    const requestId = `save-stashed-prompt-${Date.now()}-${requestCounterRef.current}`;
    latestSaveRequestIdRef.current = requestId;
    saveOriginRef.current = 'recovered';
    setIsSavingPrompt(true);
    setTagError(undefined);
    vscode.postMessage({
      content: prompt.content,
      ...(prompt.projectId ? { projectId: prompt.projectId } : {}),
      requestId,
      ...(prompt.sessionId ? { sessionId: prompt.sessionId } : {}),
      tagIds: [],
      type: 'saveStashedPrompt',
    });
  };

  const nextTagRequestId = (kind: string) => {
    requestCounterRef.current += 1;
    return `${kind}-${Date.now()}-${requestCounterRef.current}`;
  };

  /*
   * CDXC:SavedPrompts 2026-08-23:
   * Tag toggles paint immediately and are confirmed by the daemon's echo. The
   * star is a one-click control on a list the user is scanning, so waiting a
   * round trip before it fills in reads as a dropped click.
   */
  const setPromptTags = (prompt: GxserverStashedPrompt, tagIds: readonly string[]) => {
    const nextTagIds = [...tagIds];
    setPrompts((current) =>
      current?.map((candidate) =>
        candidate.promptId === prompt.promptId ? { ...candidate, tagIds: nextTagIds } : candidate
      )
    );
    vscode.postMessage({
      promptId: prompt.promptId,
      requestId: nextTagRequestId('set-stashed-prompt-tags'),
      tagIds: nextTagIds,
      type: 'setStashedPromptTags',
    });
  };

  const togglePromptTag = (prompt: GxserverStashedPrompt, tagId: string) => {
    const current = promptTagIds(prompt);
    const favoriteTagIds = current.includes(GXSERVER_FAVORITE_PROMPT_TAG_ID) ? [GXSERVER_FAVORITE_PROMPT_TAG_ID] : [];
    if (tagId === GXSERVER_FAVORITE_PROMPT_TAG_ID) {
      const labelTagId = current.find((candidate) => candidate !== GXSERVER_FAVORITE_PROMPT_TAG_ID);
      setPromptTags(prompt, [
        ...(favoriteTagIds.length > 0 ? [] : [GXSERVER_FAVORITE_PROMPT_TAG_ID]),
        ...(labelTagId ? [labelTagId] : []),
      ]);
      return;
    }
    setPromptTags(prompt, current.includes(tagId) ? favoriteTagIds : [...favoriteTagIds, tagId]);
  };

  const openCreateTag = (origin: 'rail' | 'row', promptId?: string) => {
    createTagOriginRef.current = origin;
    createTagPromptIdRef.current = promptId;
    setCreateTagName('');
    setCreateTagColor(STASHED_PROMPT_TAG_COLORS[tags.length % STASHED_PROMPT_TAG_COLORS.length]);
    setTagError(undefined);
    setIsCreatingTag(true);
  };

  const commitCreateTag = () => {
    const name = createTagName.trim().replace(/\s+/g, ' ');
    if (!name) {
      return;
    }
    pendingTagApplicationRef.current =
      createTagOriginRef.current === 'row' && createTagPromptIdRef.current
        ? { name: name.toLowerCase(), promptId: createTagPromptIdRef.current }
        : { name: name.toLowerCase(), promptId: undefined };
    vscode.postMessage({
      color: createTagColor,
      name,
      requestId: nextTagRequestId('save-stashed-prompt-tag'),
      type: 'saveStashedPromptTag',
    });
    setIsCreatingTag(false);
    setCreateTagName('');
  };

  /*
   * CDXC:SavedPrompts 2026-08-23:
   * Resolve a just-created tag once the refreshed catalogue arrives: file it on
   * the prompt whose menu created it, or make it the active rail filter when it
   * was created from the rail's own "+".
   */
  useEffect(() => {
    const pending = pendingTagApplicationRef.current;
    if (!pending) {
      return;
    }
    const createdTag = tags.find((tag) => tag.name.toLowerCase() === pending.name);
    if (!createdTag) {
      return;
    }
    pendingTagApplicationRef.current = undefined;
    if (!pending.promptId) {
      setTagFilter({ kind: 'tag', tagId: createdTag.tagId });
      return;
    }
    const prompt = prompts?.find((candidate) => candidate.promptId === pending.promptId);
    if (prompt && !promptTagIds(prompt).includes(createdTag.tagId)) {
      setPromptTags(prompt, [
        ...(promptTagIds(prompt).includes(GXSERVER_FAVORITE_PROMPT_TAG_ID) ? [GXSERVER_FAVORITE_PROMPT_TAG_ID] : []),
        createdTag.tagId,
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, tags]);

  const deleteTag = (tag: GxserverStashedPromptTag) => {
    if (tag.isBuiltin) {
      return;
    }
    vscode.postMessage({
      requestId: nextTagRequestId('delete-stashed-prompt-tag'),
      tagId: tag.tagId,
      type: 'deleteStashedPromptTag',
    });
  };

  const savePrompt = () => {
    const content = trimPromptEditorTrailingSpaces(draftContent);
    if (!content.trim() || isSavingPrompt) {
      return;
    }
    requestCounterRef.current += 1;
    const requestId = `save-stashed-prompt-${Date.now()}-${requestCounterRef.current}`;
    latestSaveRequestIdRef.current = requestId;
    setIsSavingPrompt(true);
    setSaveError(undefined);
    const selectedProjectId = draftProjectId === NO_PROJECT_VALUE ? undefined : draftProjectId.slice('project:'.length);
    const selectedTagIds = [
      ...(draftIsFavorite ? [GXSERVER_FAVORITE_PROMPT_TAG_ID] : []),
      ...(draftTagId === NO_TAG_VALUE ? [] : [draftTagId.slice('tag:'.length)]),
    ];
    /*
     * CDXC:SavedPrompts 2026-08-24:
     * Post the raw gxserver ids decoded out of the combined presentation key.
     * This form used to store the combined key verbatim, which made its rows
     * name a session gxserver has never heard of; the daemon normalizes stored
     * ids as of migration 0026, and writing them raw keeps the two in step.
     */
    vscode.postMessage({
      content,
      ...(editingPromptId ? { promptId: editingPromptId } : {}),
      ...(!editingPromptId && selectedProjectId ? { projectId: selectedProjectId } : {}),
      requestId,
      ...(!editingPromptId && selectedProjectId === rawProjectId && rawSessionId ? { sessionId: rawSessionId } : {}),
      tagIds: selectedTagIds,
      type: 'saveStashedPrompt',
    });
  };

  const jumpToPromptSession = (prompt: GxserverStashedPrompt) => {
    vscode.postMessage({
      ...(prompt.agentSessionId ? { agentSessionId: prompt.agentSessionId } : {}),
      ...(prompt.projectId ? { projectId: prompt.projectId } : {}),
      ...(prompt.sessionId ? { sessionId: prompt.sessionId } : {}),
      type: 'jumpToStashedPromptSession',
    });
    onClose();
  };

  return (
    <CommandDialog
      className='ghostex-settings-shadcn ghostex-command-palette-dialog ghostex-stashed-prompts-dialog top-1/2 -translate-y-1/2'
      description='Browse and add saved prompts.'
      open={isOpen}
      showCloseButton={false}
      title='Ghostex Quick Access'
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      {/*
        CDXC:SavedPrompts 2026-07-29:
        Every prompt-editor save-and-close (Ctrl+G in a session, then Save)
        stashes the composed text in gxserver. This modal is the recall
        surface: the fourth Ghostex Quick Access tab, listing local prompts
        newest first. Selecting a row inserts the prompt into the launching
        session's active input surface without submitting it.
      */}
      <TooltipProvider delayDuration={tooltipDelayMs}>
        <Command
          className='quick-access-surface ghostex-stashed-prompts-command'
          shouldFilter={false}
          value={selectedPromptValue}
          onValueChange={setSelectedPromptValue}
        >
          <QuickAccessHeader activeTab='savedPrompts' />
          {isAddingPrompt ? (
            <div className='ghostex-stashed-prompt-editor' data-editing={String(Boolean(editingPromptId))}>
              <div className='ghostex-stashed-prompt-editor-heading'>
                {editingPromptId ? 'Edit Saved Prompt' : 'Add Saved Prompt'}
              </div>
              <FieldGroup className='ghostex-stashed-prompt-editor-metadata'>
                {!editingPromptId ? (
                  <Field>
                    <FieldLabel className='sr-only'>Project</FieldLabel>
                    <Select
                      searchable
                      searchPlaceholder='Filter projects...'
                      value={draftProjectId}
                      onValueChange={setDraftProjectId}
                    >
                      <SelectTrigger aria-label='Project for saved prompt' size='sm'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align='start' alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                          {projectOptions.map((project) => (
                            <SelectItem key={project.projectId} value={`project:${project.projectId}`}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel className='sr-only'>Tags</FieldLabel>
                  <StashedPromptEditorTagSelect
                    isFavorite={draftIsFavorite}
                    selectedTagId={draftTagId === NO_TAG_VALUE ? undefined : draftTagId.slice('tag:'.length)}
                    tags={tags}
                    onFavoriteChange={setDraftIsFavorite}
                    onTagChange={(tagId) => setDraftTagId(tagId ? `tag:${tagId}` : NO_TAG_VALUE)}
                  />
                </Field>
              </FieldGroup>
              <Textarea
                aria-label='Saved prompt content'
                className='ghostex-stashed-prompt-editor-textarea'
                disabled={isSavingPrompt}
                onChange={(event) => {
                  setDraftContent(event.target.value);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    savePrompt();
                  }
                }}
                placeholder='Write a prompt you want to save...'
                ref={draftTextareaRef}
                spellCheck={false}
                value={draftContent}
              />
              {saveError ? (
                <div className='ghostex-stashed-prompt-editor-error' role='alert'>
                  {saveError}
                </div>
              ) : null}
              <div className='ghostex-stashed-prompt-editor-actions'>
                <Button
                  disabled={isSavingPrompt}
                  onClick={() => {
                    setIsAddingPrompt(false);
                    setEditingPromptId(undefined);
                    setDraftContent('');
                    setDraftProjectId(NO_PROJECT_VALUE);
                    setDraftTagId(NO_TAG_VALUE);
                    setDraftIsFavorite(false);
                    setSaveError(undefined);
                  }}
                  size='sm'
                  type='button'
                  variant='outline'
                >
                  Cancel
                </Button>
                <Button disabled={!draftContent.trim() || isSavingPrompt} onClick={savePrompt} size='sm' type='button'>
                  {isSavingPrompt ? 'Saving...' : editingPromptId ? 'Save Changes' : 'Add Prompt'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <CommandInput
                className='pl-3'
                clearOnEscape={false}
                clearLabel='Clear prompt search'
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  onClose();
                }}
                placeholder={
                  view === 'sent'
                    ? 'Search sent messages...'
                    : view === 'recovered'
                      ? 'Search recovered drafts...'
                      : 'Search saved prompts...'
                }
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <StashedPromptFiltersToolbar
                view={view}
                onViewChange={(nextView) => {
                  setView(nextView);
                  if (nextView === 'sent') {
                    hasResolvedDefaultScopeRef.current = true;
                    setScope('all');
                  }
                }}
                onAddPrompt={openAddPrompt}
                onProjectFilterChange={(value) => {
                  if (value === CURRENT_SESSION_VALUE) {
                    setScope('session');
                    return;
                  }
                  if (value === ALL_PROJECTS_VALUE) {
                    setScope('all');
                    return;
                  }
                  setScopeProjectId(value.slice('project:'.length));
                  setScope('project');
                }}
                projectFilterValue={projectFilterValue(effectiveScope, scopeProjectId)}
                projectOptions={projectOptions}
                showSessionFilter={hasSessionScope}
                onSelectFilter={setTagFilter}
                tagFilter={tagFilter}
                createTagColor={createTagColor}
                createTagName={createTagName}
                isCreatingTag={isCreatingTag && createTagOriginRef.current === 'rail'}
                onCommitCreateTag={commitCreateTag}
                onCreateTagColorChange={setCreateTagColor}
                onCreateTagNameChange={setCreateTagName}
                onCreateTagOpenChange={(nextOpen) => {
                  if (nextOpen) {
                    openCreateTag('rail');
                  } else {
                    setIsCreatingTag(false);
                  }
                }}
                onDeleteTag={deleteTag}
                promptCount={scopedPrompts.length}
                showUntaggedFilter={hasTaggedPrompt}
                untaggedPromptCount={untaggedPromptCount}
                promptCountByTagId={promptCountByTagId}
                tags={tags}
              />
              {tagError ? (
                <div className='ghostex-stashed-prompt-tag-error' role='alert'>
                  {tagError}
                </div>
              ) : null}
              <CommandList className='ghostex-command-palette-list ghostex-stashed-prompts-list' ref={promptListRef}>
                {isListReady && visiblePrompts.length === 0 ? (
                  <CommandEmpty>
                    {view === 'sent'
                      ? 'No sent messages match. The last 50 messages you send appear here.'
                      : view === 'recovered'
                        ? effectiveScope === 'session'
                          ? 'No recovered drafts came from this session.'
                          : effectiveScope === 'project'
                            ? 'No recovered drafts came from this project.'
                            : 'No recovered drafts. Unsent text and earlier draft versions show up here.'
                        : tagFilter.kind === 'tag'
                          ? 'No saved prompts carry this tag yet.'
                          : tagFilter.kind === 'untagged'
                            ? 'Every saved prompt here already carries a tag.'
                            : effectiveScope === 'session'
                              ? 'No saved prompts came from this session.'
                              : effectiveScope === 'project'
                                ? 'No saved prompts came from this project.'
                                : 'No saved prompts match this search.'}
                  </CommandEmpty>
                ) : null}
                {!isListReady || visiblePrompts.length > 0 ? (
                  <CommandGroup>
                    {!isListReady ? (
                      <DelayedLoadingIndicator label='Loading saved prompts...' loading />
                    ) : (
                      groupedVisiblePrompts.map((group) => (
                        <section className='previous-sessions-day-group' key={group.dayLabel}>
                          <div className='previous-sessions-day-label'>{group.dayLabel}</div>
                          <div className='ghostex-stashed-prompt-day-list'>
                            {group.prompts.map((prompt) =>
                              view !== 'saved' ? (
                                <RecoveredDraftRow
                                  earlierVersions={
                                    view === 'recovered' ? recoveredVersionsById.get(prompt.promptId) : undefined
                                  }
                                  onSelectVersion={insertPrompt}
                                  kind={view === 'sent' ? 'message' : 'draft'}
                                  key={prompt.promptId}
                                  onDelete={() => {
                                    if (view === 'sent') deleteSentSessionChatMessage(prompt.promptId);
                                    else deleteRecoveredDraft(prompt);
                                  }}
                                  onJumpToSession={() => {
                                    jumpToPromptSession(prompt);
                                  }}
                                  onSaveToLibrary={() => {
                                    saveRecoveredDraftToLibrary(prompt);
                                  }}
                                  onSelect={() => {
                                    insertPrompt(prompt);
                                  }}
                                  prompt={prompt}
                                />
                              ) : (
                                <StashedPromptRow
                                  createTagColor={createTagColor}
                                  createTagName={createTagName}
                                  isCreatingTag={
                                    isCreatingTag &&
                                    createTagOriginRef.current === 'row' &&
                                    createTagPromptIdRef.current === prompt.promptId
                                  }
                                  isTagMenuOpen={tagMenuPromptId === prompt.promptId}
                                  key={prompt.promptId}
                                  onCommitCreateTag={commitCreateTag}
                                  onCreateTagColorChange={setCreateTagColor}
                                  onCreateTagNameChange={setCreateTagName}
                                  onCreateTagOpenChange={(nextOpen) => {
                                    if (nextOpen) {
                                      openCreateTag('row', prompt.promptId);
                                    } else {
                                      setIsCreatingTag(false);
                                    }
                                  }}
                                  onDelete={() => {
                                    deletePrompt(prompt);
                                  }}
                                  onEdit={() => {
                                    const promptTags = promptTagIds(prompt);
                                    const labelTagId = promptTags.find(
                                      (tagId) => tagId !== GXSERVER_FAVORITE_PROMPT_TAG_ID
                                    );
                                    setEditingPromptId(prompt.promptId);
                                    setDraftContent(prompt.content);
                                    setDraftTagId(labelTagId ? `tag:${labelTagId}` : NO_TAG_VALUE);
                                    setDraftIsFavorite(promptTags.includes(GXSERVER_FAVORITE_PROMPT_TAG_ID));
                                    setSaveError(undefined);
                                    setIsAddingPrompt(true);
                                  }}
                                  onJumpToSession={() => {
                                    jumpToPromptSession(prompt);
                                  }}
                                  onSelect={() => {
                                    insertPrompt(prompt);
                                  }}
                                  onTagMenuOpenChange={(nextOpen) => {
                                    setTagMenuPromptId(nextOpen ? prompt.promptId : undefined);
                                  }}
                                  onToggleTag={(tagId) => {
                                    togglePromptTag(prompt, tagId);
                                  }}
                                  prompt={prompt}
                                  tags={tags}
                                  tagsById={tagsById}
                                />
                              )
                            )}
                          </div>
                        </section>
                      ))
                    )}
                  </CommandGroup>
                ) : null}
              </CommandList>
              <AppTooltip
                content={STASH_PROMPT_HINT}
                contentClassName='ghostex-stashed-prompts-stash-hint-tooltip'
                defaultOpen={stashHintTooltipDefaultOpen}
                side='left'
                sideOffset={8}
              >
                <button aria-label={STASH_PROMPT_HINT} className='ghostex-stashed-prompts-stash-hint' type='button'>
                  <IconInfoCircle aria-hidden='true' size={16} stroke={1.8} />
                </button>
              </AppTooltip>
            </>
          )}
        </Command>
      </TooltipProvider>
    </CommandDialog>
  );
}
