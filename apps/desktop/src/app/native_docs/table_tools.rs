//! The table controls over the live editor, ported from the former React Docs page: while the
//! caret is in a table, a six-button toolbar at the table's
//! top left (Insert row above / below, Insert column left / right, Delete row / column) and a sort
//! button on each header cell. Sorting rewrites the table's rows (one undo step); the Docs page
//! sorted the view first and wrote it with "Apply Sort".

use std::cell::Cell;
use std::rc::Rc;

use gpui::prelude::FluentBuilder as _;
use gpui::{
    AnyElement, App, Entity, Focusable as _, InteractiveElement as _, IntoElement, MouseButton,
    ParentElement as _, Pixels, SharedString, StatefulInteractiveElement as _, Styled as _, Window,
    div, px, svg,
};
use zorite_editor::EditorState;

use super::palette::DocsPalette;

/// The active sort: (header row, column, descending).
pub(crate) type TableSort = Rc<Cell<Option<(usize, usize, bool)>>>;

const TOOLBAR_BUTTON: f32 = 24.0;

fn tooltip(text: &'static str) -> impl Fn(&mut Window, &mut App) -> gpui::AnyView + 'static {
    move |window, cx| gpui_component::tooltip::Tooltip::new(text).build(window, cx)
}

/// The controls for the caret's table, in the editor's own coordinates (the rows the gutter
/// uses); `None` when the caret is not in a rendered table or the editor has no focus.
pub(crate) fn render_table_tools(
    live: &Entity<EditorState>,
    rows: &[(Pixels, Pixels)],
    sort: &TableSort,
    p: &DocsPalette,
    window: &Window,
    cx: &App,
) -> Option<AnyElement> {
    let editor = live.read(cx);
    if !editor.focus_handle(cx).is_focused(window) {
        return None;
    }
    let (header, _end, columns, body_rows, on_body) = editor.caret_table()?;
    let (header_top, _) = *rows.get(header)?;
    let cells = editor.table_header_cells(header);
    let text = super::editor_style::body_color(p);
    let danger = if p.light {
        gpui::rgb(0xd96c56).into()
    } else {
        gpui::rgb(0xe07d6a).into()
    };
    let hover = p.control_hover;
    let button = |id: &'static str,
                  icon: &'static str,
                  label: &'static str,
                  color: gpui::Hsla,
                  enabled: bool,
                  action: fn(&mut EditorState, &mut gpui::Context<EditorState>)| {
        let live = live.clone();
        div()
            .id(id)
            .size(px(TOOLBAR_BUTTON))
            .flex()
            .items_center()
            .justify_center()
            .rounded(px(6.0))
            .when(enabled, |this| {
                this.cursor_pointer()
                    .hover(move |style| style.bg(hover))
                    .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                        window.prevent_default();
                        cx.stop_propagation();
                        live.update(cx, |editor, cx| action(editor, cx));
                    })
            })
            .when(!enabled, |this| this.opacity(0.45))
            .tooltip(tooltip(label))
            .child(svg().path(icon).size(px(18.0)).text_color(color))
    };
    let toolbar = div()
        .absolute()
        .top(header_top - px(TOOLBAR_BUTTON))
        .left_0()
        .flex()
        .items_center()
        .gap(px(2.0))
        .child(button(
            "docs-table-row-above",
            "files-view/t-row-insert-top-2.svg",
            "Insert row above",
            text,
            true,
            |editor, cx| editor.insert_table_row(false, cx),
        ))
        .child(button(
            "docs-table-row-below",
            "files-view/t-row-insert-bottom-2.svg",
            "Insert row below",
            text,
            true,
            |editor, cx| editor.insert_table_row(true, cx),
        ))
        .child(button(
            "docs-table-column-left",
            "files-view/t-column-insert-left-2.svg",
            "Insert column left",
            text,
            true,
            |editor, cx| editor.insert_table_column(false, cx),
        ))
        .child(button(
            "docs-table-column-right",
            "files-view/t-column-insert-right-2.svg",
            "Insert column right",
            text,
            true,
            |editor, cx| editor.insert_table_column(true, cx),
        ))
        .child(button(
            "docs-table-delete-row",
            "files-view/t-row-remove-2.svg",
            "Delete row",
            danger,
            on_body && body_rows > 1,
            |editor, cx| editor.delete_table_row(cx),
        ))
        .child(button(
            "docs-table-delete-column",
            "files-view/t-column-remove-2.svg",
            "Delete column",
            danger,
            columns > 1,
            |editor, cx| editor.delete_table_column(cx),
        ));
    // A sort button at each header cell's right end.
    let active = sort.get().filter(|(row, ..)| *row == header);
    let sort_buttons: Vec<AnyElement> = cells
        .iter()
        .enumerate()
        .map(|(col, cell)| {
            let state = active.filter(|(_, c, _)| *c == col).map(|(.., desc)| desc);
            let (icon, label): (&'static str, SharedString) = match state {
                Some(true) => (
                    "files-view/t-arrow-down-2.svg",
                    "Sorted descending; click to toggle".into(),
                ),
                Some(false) => (
                    "files-view/t-arrow-up-2.svg",
                    "Sorted ascending; click to toggle".into(),
                ),
                None => (
                    "files-view/t-arrows-sort-2.svg",
                    "Sort column descending".into(),
                ),
            };
            let live = live.clone();
            let sort = sort.clone();
            div()
                .id(("docs-table-sort", col))
                .absolute()
                .top(cell.origin.y + (cell.size.height - px(18.0)) / 2.0)
                .left(cell.origin.x + cell.size.width - px(22.0))
                .size(px(18.0))
                .flex()
                .items_center()
                .justify_center()
                .rounded(px(4.0))
                .cursor_pointer()
                .hover(move |style| style.bg(hover))
                .when(state.is_none(), |this| this.opacity(0.55))
                .tooltip(move |window, cx| {
                    gpui_component::tooltip::Tooltip::new(label.clone()).build(window, cx)
                })
                .child(svg().path(icon).size(px(14.0)).text_color(text))
                .on_mouse_down(MouseButton::Left, move |_, window, cx| {
                    window.prevent_default();
                    cx.stop_propagation();
                    // The first click sorts descending, the next ones toggle.
                    let descending = match sort.get() {
                        Some((row, c, desc)) if row == header && c == col => !desc,
                        _ => true,
                    };
                    sort.set(Some((header, col, descending)));
                    live.update(cx, |editor, cx| {
                        editor.sort_table(header, col, descending, cx)
                    });
                })
                .into_any_element()
        })
        .collect();
    Some(
        div()
            .absolute()
            .top_0()
            .left_0()
            .size_full()
            .child(toolbar)
            .children(sort_buttons)
            .into_any_element(),
    )
}
