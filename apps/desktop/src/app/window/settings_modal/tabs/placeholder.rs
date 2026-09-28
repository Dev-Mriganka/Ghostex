//! A page whose native port has not landed yet (the native Settings modal is opened only with
//! `GHOSTEX_NATIVE_SETTINGS=1` until every page is ported).
use super::super::super::native_modal_kit::*;
use super::super::fields::{FieldStates, SettingsPage};
use super::super::model::SettingsTabId;
use super::super::page::{PageBlock, settings_page};
use super::super::store::SettingsStore;
use gpui::{
    Context, Entity, IntoElement, ParentElement as _, Render, Styled as _, Window, div, px,
};

pub(crate) struct PlaceholderTab {
    tab: SettingsTabId,
    store: Entity<SettingsStore>,
    fields: FieldStates,
}

impl PlaceholderTab {
    pub(crate) fn new(
        tab: SettingsTabId,
        store: Entity<SettingsStore>,
        cx: &mut Context<Self>,
    ) -> Self {
        cx.observe(&store, |_, _, cx| cx.notify()).detach();
        Self {
            tab,
            store,
            fields: FieldStates::default(),
        }
    }
}

impl SettingsPage for PlaceholderTab {
    fn settings_store(&self) -> &Entity<SettingsStore> {
        &self.store
    }

    fn field_states(&mut self) -> &mut FieldStates {
        &mut self.fields
    }
}

impl Render for PlaceholderTab {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = self.store.read(cx).palette();
        let note = div()
            .w_full()
            .px(px(16.0))
            .py(px(24.0))
            .border_1()
            .border_color(hsla(p.hairline))
            .text_size(px(14.0))
            .text_color(hsla(p.muted))
            .child(format!("The {} page is not native yet.", self.tab.title()));
        settings_page(
            &self.store,
            self.tab,
            &p,
            vec![PageBlock::section(self.tab.id(), note)],
            cx,
        )
    }
}
