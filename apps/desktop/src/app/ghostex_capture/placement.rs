//! Where the button's window goes and how big it is, for each layout.

use gpui::{App, Bounds, DisplayId, Pixels, Point, Size, point, px, size};

use super::model::*;
use super::persistence::SavedPlacement;

/// One screen, keyed the way placements are saved.
#[derive(Clone, Debug)]
pub(crate) struct Screen {
    pub(crate) key: String,
    pub(crate) id: DisplayId,
    pub(crate) bounds: Bounds<Pixels>,
    pub(crate) visible: Bounds<Pixels>,
}

pub(crate) fn screens(cx: &App) -> Vec<Screen> {
    cx.displays()
        .into_iter()
        .map(|display| Screen {
            key: display
                .uuid()
                .map(|uuid| uuid.to_string())
                .unwrap_or_else(|_| format!("{:?}", display.id())),
            id: display.id(),
            bounds: display.bounds(),
            visible: display.visible_bounds(),
        })
        .collect()
}

pub(crate) fn screen_at(point: Point<Pixels>, cx: &App) -> Option<Screen> {
    screens(cx)
        .into_iter()
        .find(|screen| screen.bounds.contains(&point))
}

/// The screen the button belongs on: the one it was last on, else the primary screen.
pub(crate) fn home_screen(saved_key: Option<&str>, cx: &App) -> Option<Screen> {
    let all = screens(cx);
    let primary = cx.primary_display().map(|display| display.id());
    saved_key
        .and_then(|key| all.iter().find(|screen| screen.key == key).cloned())
        .or_else(|| primary.and_then(|id| all.iter().find(|screen| screen.id == id).cloned()))
        .or_else(|| all.into_iter().next())
}

/// A first-run spot: floating near the right edge, a little below the middle.
pub(crate) fn default_placement(screen: &Screen) -> SavedPlacement {
    let visible = screen.visible;
    SavedPlacement {
        x: f32::from(visible.right() - screen.bounds.left()) - ICON_SIZE - 72.0,
        y: f32::from(visible.top() - screen.bounds.top()) + f32::from(visible.size.height) * 0.62,
        dock: None,
    }
}

fn digits(value: u64) -> usize {
    value.to_string().len()
}

/// The non-zero counts in drawing order, with their colors.
pub(crate) fn shown_counts(counts: CaptureCounts) -> Vec<(u64, u32)> {
    [
        (counts.working, 0xc68a06),
        (counts.attention, 0x0093fe),
        (counts.question, 0xf472b6),
    ]
    .into_iter()
    .filter(|(value, _)| *value > 0)
    .collect()
}

pub(crate) const COUNT_CHAR_WIDTH: f32 = 8.4;
pub(crate) const COUNT_GAP: f32 = 8.0;
pub(crate) const TRAY_PAD: f32 = 10.0;

/// The tray's full width including the part under the icon; 0 without counts.
pub(crate) fn tray_width(counts: CaptureCounts) -> f32 {
    let shown = shown_counts(counts);
    if shown.is_empty() {
        return 0.0;
    }
    let characters: usize = shown.iter().map(|(value, _)| digits(*value)).sum();
    TRAY_TUCK
        + TRAY_PAD
        + characters as f32 * COUNT_CHAR_WIDTH
        + (shown.len() - 1) as f32 * COUNT_GAP
        + TRAY_PAD
}

fn tray_visible(counts: CaptureCounts) -> f32 {
    (tray_width(counts) - TRAY_TUCK).max(0.0)
}

pub(crate) const TAB_ROW: f32 = 16.0;

fn tab_height(counts: CaptureCounts) -> f32 {
    let rows = shown_counts(counts).len();
    if rows == 0 {
        32.0
    } else {
        10.0 + rows as f32 * TAB_ROW
    }
}

pub(crate) fn window_size(layout: IconLayout, counts: CaptureCounts) -> Size<Pixels> {
    match layout {
        IconLayout::Docked(_) => size(px(TAB_WIDTH), px(tab_height(counts))),
        IconLayout::Floating { .. } | IconLayout::DockedOpen(_) => size(
            px(ICON_PAD * 2.0 + ICON_SIZE + tray_visible(counts)),
            px(ICON_PAD * 2.0 + ICON_SIZE),
        ),
    }
}

/// Whether the tray is drawn on the icon's left.
pub(crate) fn tray_on_left(layout: IconLayout) -> bool {
    match layout {
        IconLayout::Floating { tray_left } => tray_left,
        IconLayout::DockedOpen(edge) => edge == DockEdge::Right,
        IconLayout::Docked(_) => false,
    }
}

/// The icon's top-left corner inside its window.
pub(crate) fn icon_offset(layout: IconLayout, counts: CaptureCounts) -> Point<Pixels> {
    let left = if tray_on_left(layout) {
        ICON_PAD + tray_visible(counts)
    } else {
        ICON_PAD
    };
    point(px(left), px(ICON_PAD))
}

/// The icon's top-left corner on screen for a saved placement, kept inside the screen.
pub(crate) fn icon_origin(screen: &Screen, placement: SavedPlacement) -> Point<Pixels> {
    let visible = screen.visible;
    let x = (screen.bounds.left() + px(placement.x))
        .max(visible.left())
        .min(visible.right() - px(ICON_SIZE));
    let y = (screen.bounds.top() + px(placement.y))
        .max(visible.top())
        .min(visible.bottom() - px(ICON_SIZE));
    point(x, y)
}

/// The layout a placement asks for: docked or floating with the tray where it fits.
pub(crate) fn resting_layout(
    screen: &Screen,
    placement: SavedPlacement,
    counts: CaptureCounts,
) -> IconLayout {
    if let Some(edge) = placement.dock {
        return IconLayout::Docked(edge);
    }
    let origin = icon_origin(screen, placement);
    let tray_right_edge = origin.x + px(ICON_SIZE + tray_visible(counts) + ICON_PAD);
    IconLayout::Floating {
        tray_left: tray_right_edge > screen.visible.right(),
    }
}

/// The window frame for a layout on a screen.
pub(crate) fn window_frame(
    screen: &Screen,
    placement: SavedPlacement,
    layout: IconLayout,
    counts: CaptureCounts,
) -> Bounds<Pixels> {
    let window = window_size(layout, counts);
    let icon = icon_origin(screen, placement);
    let visible = screen.visible;
    let origin = match layout {
        IconLayout::Floating { .. } => icon - icon_offset(layout, counts),
        IconLayout::Docked(edge) => {
            let y = icon.y + px(ICON_SIZE / 2.0) - window.height / 2.0;
            match edge {
                DockEdge::Left => point(visible.left(), y),
                DockEdge::Right => point(visible.right() - window.width, y),
            }
        }
        IconLayout::DockedOpen(edge) => {
            let y = icon.y - px(ICON_PAD);
            match edge {
                DockEdge::Left => point(visible.left(), y),
                DockEdge::Right => point(visible.right() - window.width, y),
            }
        }
    };
    Bounds::new(origin, window)
}

/// The edge a drop at `icon` should dock to, if any.
pub(crate) fn dock_edge_for(screen: &Screen, icon: Point<Pixels>) -> Option<DockEdge> {
    let visible = screen.visible;
    if icon.x - visible.left() < px(DOCK_SNAP) {
        Some(DockEdge::Left)
    } else if visible.right() - (icon.x + px(ICON_SIZE)) < px(DOCK_SNAP) {
        Some(DockEdge::Right)
    } else {
        None
    }
}

/// Saves an on-screen icon position relative to its screen.
pub(crate) fn placement_for(
    screen: &Screen,
    icon: Point<Pixels>,
    dock: Option<DockEdge>,
) -> SavedPlacement {
    SavedPlacement {
        x: f32::from(icon.x - screen.bounds.left()),
        y: f32::from(icon.y - screen.bounds.top()),
        dock,
    }
}

/// The panel's frame next to the button: below it when it fits, else above, lined up with the
/// side of the button nearer the screen edge.
pub(crate) fn panel_frame(
    screen: &Screen,
    icon_window: Bounds<Pixels>,
    panel_height: f32,
) -> Bounds<Pixels> {
    let visible = screen.visible;
    let height = px(panel_height).min(visible.size.height - px(PANEL_GAP * 2.0));
    let width = px(PANEL_WIDTH);
    let below = icon_window.bottom() + px(PANEL_GAP);
    let y = if below + height <= visible.bottom() {
        below
    } else {
        (icon_window.top() - px(PANEL_GAP) - height).max(visible.top())
    };
    let x = if icon_window.center().x > visible.center().x {
        icon_window.right() - width
    } else {
        icon_window.left()
    };
    let x = x.max(visible.left()).min(visible.right() - width);
    Bounds::new(point(x, y), size(width, height))
}
