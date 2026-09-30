import { Fragment, useId, useState } from 'react';
import { cn } from '@/packages/components/utils';
import { Button } from '@/packages/components/ui/button';
import { Switch } from '@/packages/components/ui/switch';
import { TabsList, TabsTrigger } from '@/packages/components/ui/tabs';
import { type SettingsModalTab } from '../settings-modal-tabs';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { SettingsSidebarPage } from './types';

export function SettingsSearchNoMatchesNotice({
  activeTab,
  matchingPages,
  onSelectPage,
}: {
  activeTab: SettingsModalTab;
  matchingPages: readonly SettingsSidebarPage[];
  onSelectPage: (pageId: SettingsModalTab) => void;
}) {
  const otherPages = matchingPages.filter((page) => page.id !== activeTab);
  return (
    <div className='rounded-none border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground'>
      <p>{otherPages.length ? 'No settings on this page match your search.' : 'No settings match your search.'}</p>
      {otherPages.length ? (
        <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
          <span>Matches on:</span>
          {otherPages.map((page) => {
            const PageIcon = page.icon;
            return (
              <Button key={page.id} onClick={() => onSelectPage(page.id)} type='button' variant='outline'>
                <PageIcon aria-hidden='true' data-icon='inline-start' />
                {page.title}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * CDXC:Settings 2026-09-12 DECISION:
 * User: Settings table-of-contents titles only navigate; only the small chevron on the right expands or collapses their entries.
 * This replaces the full-header toggle behavior.
 */
export function SettingsSidebarNavigation({
  expandedPages,
  onShowAdvancedSettingsChange,
  onTogglePage,
  pages,
  showAdvancedSettings,
  showAdvancedSettingsId,
}: {
  expandedPages: Partial<Record<SettingsModalTab, boolean>>;
  onShowAdvancedSettingsChange: (checked: boolean) => void;
  onTogglePage: (pageId: SettingsModalTab) => void;
  pages: readonly SettingsSidebarPage[];
  showAdvancedSettings: boolean;
  showAdvancedSettingsId: string;
}) {
  const [expandedSections, setExpandedSections] = useState<ReadonlySet<string>>(() => new Set());
  const sectionDisclosureIdPrefix = useId();
  const toggleSection = (sectionKey: string) => {
    setExpandedSections((currentSections) => {
      const nextSections = new Set(currentSections);
      if (nextSections.has(sectionKey)) {
        nextSections.delete(sectionKey);
      } else {
        nextSections.add(sectionKey);
      }
      return nextSections;
    });
  };

  return (
    <aside aria-label='Settings pages and sections' className='settings-section-sidebar'>
      <TabsList className='settings-sidebar-tabs-list vertical-scroll-fade-mask'>
        {pages.map((page) => {
          const hasSections = Boolean(page.sections?.length);
          const expanded = Boolean(expandedPages[page.id]);
          const PageIcon = page.icon;
          return (
            <div
              className={cn('settings-sidebar-page-group', page.id === 'about' && 'settings-sidebar-page-group-about')}
              key={page.id}
            >
              <div className='settings-sidebar-page-row' data-expanded={String(expanded)}>
                <TabsTrigger className='settings-sidebar-tab-trigger' value={page.id}>
                  <PageIcon aria-hidden='true' data-icon='inline-start' />
                  <span className='settings-sidebar-page-title truncate'>{page.title}</span>
                </TabsTrigger>
                {hasSections ? (
                  <Button
                    aria-expanded={expanded}
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${page.title} sections`}
                    className='settings-sidebar-page-disclosure'
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onTogglePage(page.id);
                    }}
                    size='icon-xs'
                    type='button'
                    variant='ghost'
                  >
                    {expanded ? <IconChevronDown aria-hidden='true' /> : <IconChevronRight aria-hidden='true' />}
                  </Button>
                ) : null}
              </div>
              {hasSections && expanded ? (
                <div className='settings-sidebar-subsection-list'>
                  {page.sections?.map((section) => {
                    const hasSubsections = Boolean(section.subsections?.length);
                    const sectionKey = `${page.id}:${section.id}`;
                    const sectionExpanded = hasSubsections && expandedSections.has(sectionKey);
                    const subsectionListId = `${sectionDisclosureIdPrefix}-${page.id}-${section.id}`;
                    return (
                      <Fragment key={section.id}>
                        <div className='settings-sidebar-section-row'>
                          <Button
                            aria-current={section.active ? 'location' : undefined}
                            className='settings-section-sidebar-button settings-sidebar-subsection-button'
                            data-active={section.active ? 'true' : 'false'}
                            onClick={section.onSelect}
                            type='button'
                            variant='ghost'
                          >
                            {section.title}
                          </Button>
                          {hasSubsections ? (
                            <Button
                              aria-controls={subsectionListId}
                              aria-expanded={sectionExpanded}
                              aria-label={`${sectionExpanded ? 'Collapse' : 'Expand'} ${section.title} subsections`}
                              className='settings-sidebar-section-disclosure'
                              onClick={() => toggleSection(sectionKey)}
                              size='icon-xs'
                              type='button'
                              variant='ghost'
                            >
                              {sectionExpanded ? (
                                <IconChevronDown aria-hidden='true' />
                              ) : (
                                <IconChevronRight aria-hidden='true' />
                              )}
                            </Button>
                          ) : null}
                        </div>
                        {/*
                         * CDXC:Settings 2026-08-24:
                         * Expansion is explicit navigation state, independent
                         * from the scroll-active section. This keeps an opened
                         * third-level list stable while scroll tracking updates
                         * both its parent and exact active subsection.
                         */}
                        {sectionExpanded ? (
                          <div className='settings-sidebar-nested-subsection-list' id={subsectionListId}>
                            {section.subsections?.map((subsection) => (
                              <Button
                                aria-current={subsection.active ? 'location' : undefined}
                                className='settings-section-sidebar-button settings-sidebar-subsection-button settings-sidebar-nested-subsection-button'
                                data-active={subsection.active ? 'true' : 'false'}
                                key={subsection.id}
                                onClick={subsection.onSelect}
                                type='button'
                                variant='ghost'
                              >
                                {subsection.title}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </TabsList>
      {/*
       * CDXC:Settings 2026-06-24-22:16:
       * The sidebar owns both top-level Settings pages and expandable section
       * links, while Show Advanced remains pinned to the bottom of that same
       * rail instead of returning to header chrome.
       */}
      <div className='settings-section-sidebar-footer'>
        <label className='settings-show-advanced-toggle' htmlFor={showAdvancedSettingsId}>
          <span className='settings-show-advanced-copy'>Show Advanced</span>
          <Switch
            checked={showAdvancedSettings}
            id={showAdvancedSettingsId}
            onCheckedChange={onShowAdvancedSettingsChange}
          />
        </label>
      </div>
    </aside>
  );
}
