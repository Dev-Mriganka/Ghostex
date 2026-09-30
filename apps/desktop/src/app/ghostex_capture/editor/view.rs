//! The screenshot editor window: a toolbar over the picture, with crop, arrow, text and rectangle
//! tools and a pointer that moves and resizes what was drawn.
//!
//! CDXC:GhostexCapture 2026-09-30 DECISION:
//! User: a very simple editor after capturing: crop with C, arrow with A, text with T, rectangle
//! with R, back to the pointer with V (the pointer moves and resizes arrows and text); Cmd+C copies
//! the picture instead of adding it; the editor is its own window and Enter hands the picture to
//! the floating prompt box (layout B of the mockups).

use std::sync::Arc;

use gpui::prelude::*;
use gpui::{
    AnyElement, Bounds, Context, CursorStyle, FocusHandle, ImageSource, KeyDownEvent, MouseButton,
    MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, Point, RenderImage, SharedString,
    WeakEntity, Window, canvas, div, img, point, px, rgb, rgba, size,
};
use image::RgbaImage;

use super::export::arrow_head;
use super::model::*;
use crate::GhostexGpuiApp;

pub(crate) const TOOLBAR_HEIGHT: f32 = 46.0;
const CANVAS_PAD: f32 = 18.0;
/// How near (in points) a press must be to grab a handle or a mark.
const GRAB_SLOP: f32 = 8.0;

fn to_render_image(image: &RgbaImage) -> Arc<RenderImage> {
    let mut bgra = image.clone();
    for pixel in bgra.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    Arc::new(RenderImage::new(vec![image::Frame::new(bgra)]))
}

/// Where the picture is drawn in the window, and how many points one picture pixel takes.
#[derive(Clone, Copy, Debug)]
struct Layout {
    origin: Point<Pixels>,
    scale: f32,
}

impl Layout {
    fn to_window(&self, p: P) -> Point<Pixels> {
        point(
            self.origin.x + px(p.x * self.scale),
            self.origin.y + px(p.y * self.scale),
        )
    }

    fn to_picture(&self, position: Point<Pixels>) -> P {
        P::new(
            f32::from(position.x - self.origin.x) / self.scale,
            f32::from(position.y - self.origin.y) / self.scale,
        )
    }
}

pub(crate) struct EditorView {
    app: WeakEntity<GhostexGpuiApp>,
    pub(crate) focus: FocusHandle,
    pub(crate) doc: EditorDoc,
    shown: Option<(Arc<RgbaImage>, Arc<RenderImage>)>,
    layout: Layout,
}

impl EditorView {
    pub(crate) fn new(
        app: WeakEntity<GhostexGpuiApp>,
        image: RgbaImage,
        px_per_pt: f32,
        cx: &mut Context<Self>,
    ) -> Self {
        Self {
            app,
            focus: cx.focus_handle(),
            doc: EditorDoc::new(Arc::new(image), px_per_pt),
            shown: None,
            layout: Layout {
                origin: point(px(0.0), px(0.0)),
                scale: 1.0,
            },
        }
    }

    fn with_app(
        &self,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut GhostexGpuiApp, &mut Context<GhostexGpuiApp>),
    ) {
        if let Some(app) = self.app.upgrade() {
            app.update(cx, f);
        }
    }

    fn render_image(&mut self) -> Arc<RenderImage> {
        match &self.shown {
            Some((image, render)) if Arc::ptr_eq(image, &self.doc.image) => render.clone(),
            _ => {
                let render = to_render_image(&self.doc.image);
                self.shown = Some((self.doc.image.clone(), render.clone()));
                render
            }
        }
    }

    fn compute_layout(&mut self, viewport: gpui::Size<Pixels>) {
        let (width, height) = self.doc.size();
        let available_width = (f32::from(viewport.width) - CANVAS_PAD * 2.0).max(40.0);
        let available_height =
            (f32::from(viewport.height) - TOOLBAR_HEIGHT - CANVAS_PAD * 2.0).max(40.0);
        // Never larger than the screen showed it.
        let natural = 1.0 / self.doc.metrics.px_per_pt;
        let scale = (available_width / width)
            .min(available_height / height)
            .min(natural);
        let shown = (width * scale, height * scale);
        self.layout = Layout {
            origin: point(
                px((f32::from(viewport.width) - shown.0) / 2.0),
                px(TOOLBAR_HEIGHT + (f32::from(viewport.height) - TOOLBAR_HEIGHT - shown.1) / 2.0),
            ),
            scale,
        };
    }

    fn slop(&self) -> f32 {
        GRAB_SLOP / self.layout.scale
    }

    fn set_tool(&mut self, tool: Tool, cx: &mut Context<Self>) {
        self.doc.finish_text();
        if tool != Tool::Crop {
            self.doc.crop = None;
        }
        if tool != Tool::Pointer {
            self.doc.selected = None;
        }
        self.doc.tool = tool;
        cx.notify();
    }

    fn set_color(&mut self, color: u32, cx: &mut Context<Self>) {
        self.doc.color = color;
        if let Some(index) = self.doc.selected
            && let Some(mark) = self.doc.marks.get_mut(index)
        {
            match mark {
                Mark::Arrow { color: c, .. }
                | Mark::Rect { color: c, .. }
                | Mark::Text { color: c, .. } => *c = color,
            }
        }
        cx.notify();
    }

    /// The picture as it will be sent: cropped, with the marks drawn in.
    fn finished(&mut self) -> (RgbaImage, bool) {
        self.doc.finish_text();
        let edited = !self.doc.marks.is_empty() || !self.doc.undo.is_empty();
        (super::export::flatten(&self.doc), edited)
    }

    /// The finished picture, for handing to the prompt from outside the editor.
    pub(crate) fn take_result(&mut self) -> (RgbaImage, bool) {
        self.finished()
    }

    fn add_to_prompt(&mut self, cx: &mut Context<Self>) {
        let (image, edited) = self.finished();
        self.with_app(cx, move |app, cx| {
            app.ghostex_capture_editor_done(image, edited, cx)
        });
    }

    fn copy(&mut self, cx: &mut Context<Self>) {
        let (image, edited) = self.finished();
        self.with_app(cx, move |app, cx| {
            app.ghostex_capture_editor_copy(image, edited, cx)
        });
    }

    fn discard(&mut self, cx: &mut Context<Self>) {
        self.with_app(cx, |app, cx| app.close_ghostex_capture_editor(cx));
    }

    fn key_down(&mut self, event: &KeyDownEvent, cx: &mut Context<Self>) {
        let keystroke = &event.keystroke;
        let command = if cfg!(target_os = "macos") {
            keystroke.modifiers.platform
        } else {
            keystroke.modifiers.control
        };
        let key = keystroke.key.as_str();
        if let Some(index) = self.doc.editing_text {
            if command {
                return;
            }
            let Some(Mark::Text { text, .. }) = self.doc.marks.get_mut(index) else {
                self.doc.editing_text = None;
                return;
            };
            match key {
                "backspace" => {
                    text.pop();
                }
                "enter" if keystroke.modifiers.shift => text.push('\n'),
                "enter" | "escape" => self.doc.finish_text(),
                _ => {
                    if let Some(typed) = keystroke.key_char.as_deref() {
                        text.push_str(typed);
                    } else {
                        return;
                    }
                }
            }
            cx.stop_propagation();
            cx.notify();
            return;
        }
        if command {
            match key {
                "c" => self.copy(cx),
                "z" => {
                    self.doc.undo();
                    cx.notify();
                }
                _ => return,
            }
            cx.stop_propagation();
            return;
        }
        match key {
            "v" => self.set_tool(Tool::Pointer, cx),
            "c" => self.set_tool(Tool::Crop, cx),
            "a" => self.set_tool(Tool::Arrow, cx),
            "t" => self.set_tool(Tool::Text, cx),
            "r" => self.set_tool(Tool::Rect, cx),
            "backspace" | "delete" => {
                if let Some(index) = self.doc.selected.take() {
                    self.doc.checkpoint();
                    self.doc.marks.remove(index);
                    cx.notify();
                }
            }
            "enter" => {
                if self.doc.tool == Tool::Crop {
                    self.doc.apply_crop();
                    self.set_tool(Tool::Pointer, cx);
                } else {
                    self.add_to_prompt(cx);
                }
            }
            "escape" => {
                if self.doc.crop.take().is_some() || self.doc.selected.take().is_some() {
                    cx.notify();
                } else {
                    self.discard(cx);
                }
            }
            _ => return,
        }
        cx.stop_propagation();
    }

    fn mouse_down(&mut self, position: Point<Pixels>, click_count: usize, cx: &mut Context<Self>) {
        if f32::from(position.y) < TOOLBAR_HEIGHT {
            return;
        }
        let (width, height) = self.doc.size();
        let p = self.layout.to_picture(position);
        let p = P::new(p.x.clamp(0.0, width), p.y.clamp(0.0, height));
        let slop = self.slop();
        match self.doc.tool {
            Tool::Crop => {
                if let Some(crop) = self.doc.crop {
                    if let Some(handle) = BOX_HANDLES.iter().copied().find(|handle| {
                        let at = handle_point(&crop, *handle);
                        (at.x - p.x).abs() <= slop && (at.y - p.y).abs() <= slop
                    }) {
                        self.doc.drag = Some(Drag::CropHandle {
                            handle,
                            start: crop,
                        });
                    } else if crop.contains(p) {
                        self.doc.drag = Some(Drag::CropMove {
                            from: p,
                            start: crop,
                        });
                    } else {
                        self.doc.crop = Some(Area::from_points(p, p));
                        self.doc.drag = Some(Drag::CropNew { from: p });
                    }
                } else {
                    self.doc.crop = Some(Area::from_points(p, p));
                    self.doc.drag = Some(Drag::CropNew { from: p });
                }
            }
            Tool::Arrow | Tool::Rect => {
                self.doc.checkpoint();
                let color = self.doc.color;
                self.doc.marks.push(match self.doc.tool {
                    Tool::Arrow => Mark::Arrow {
                        from: p,
                        to: p,
                        color,
                    },
                    _ => Mark::Rect {
                        area: Area::from_points(p, p),
                        color,
                    },
                });
                let index = self.doc.marks.len() - 1;
                self.doc.selected = Some(index);
                self.doc.drag = Some(Drag::Draw { index, from: p });
            }
            Tool::Text => {
                self.doc.finish_text();
                if let Some(index) = crate::app::ghostex_capture::editor::model::hit_mark(
                    &self.doc.marks,
                    self.doc.metrics,
                    p,
                    slop,
                )
                .filter(|index| matches!(self.doc.marks[*index], Mark::Text { .. }))
                {
                    self.doc.selected = Some(index);
                    self.doc.editing_text = Some(index);
                } else {
                    self.doc.checkpoint();
                    let size = self.doc.metrics.text_size();
                    self.doc.marks.push(Mark::Text {
                        at: P::new(p.x, p.y - size * 0.6),
                        text: String::new(),
                        color: self.doc.color,
                    });
                    let index = self.doc.marks.len() - 1;
                    self.doc.selected = Some(index);
                    self.doc.editing_text = Some(index);
                }
            }
            Tool::Pointer => {
                self.doc.finish_text();
                if let Some(index) = self.doc.selected
                    && let Some(mark) = self.doc.marks.get(index).cloned()
                {
                    match mark {
                        Mark::Arrow { from, to, .. } => {
                            let near =
                                |q: P| (q.x - p.x).abs() <= slop && (q.y - p.y).abs() <= slop;
                            if near(to) || near(from) {
                                self.doc.checkpoint();
                                self.doc.drag = Some(Drag::ArrowEnd {
                                    index,
                                    head: near(to),
                                });
                                cx.notify();
                                return;
                            }
                        }
                        Mark::Rect { area, .. } => {
                            if let Some(handle) = BOX_HANDLES.iter().copied().find(|handle| {
                                let at = handle_point(&area, *handle);
                                (at.x - p.x).abs() <= slop && (at.y - p.y).abs() <= slop
                            }) {
                                self.doc.checkpoint();
                                self.doc.drag = Some(Drag::RectHandle {
                                    index,
                                    handle,
                                    start: area,
                                });
                                cx.notify();
                                return;
                            }
                        }
                        Mark::Text { .. } => {}
                    }
                }
                match hit_mark(&self.doc.marks, self.doc.metrics, p, slop) {
                    Some(index) => {
                        self.doc.selected = Some(index);
                        if click_count >= 2 && matches!(self.doc.marks[index], Mark::Text { .. }) {
                            self.doc.editing_text = Some(index);
                        } else {
                            self.doc.checkpoint();
                            self.doc.drag = Some(Drag::MoveMark {
                                index,
                                from: p,
                                start: self.doc.marks[index].clone(),
                            });
                        }
                    }
                    None => self.doc.selected = None,
                }
            }
        }
        cx.notify();
    }

    fn mouse_moved(&mut self, position: Point<Pixels>, cx: &mut Context<Self>) {
        let Some(drag) = self.doc.drag.clone() else {
            return;
        };
        let (width, height) = self.doc.size();
        let raw = self.layout.to_picture(position);
        let p = P::new(raw.x.clamp(0.0, width), raw.y.clamp(0.0, height));
        match drag {
            Drag::CropNew { from } => self.doc.crop = Some(Area::from_points(from, p)),
            Drag::CropHandle { handle, start } => {
                self.doc.crop = Some(drag_handle(&start, handle, p));
            }
            Drag::CropMove { from, start } => {
                let dx = (p.x - from.x).clamp(-start.left, width - start.right);
                let dy = (p.y - from.y).clamp(-start.top, height - start.bottom);
                self.doc.crop = Some(start.translated(dx, dy));
            }
            Drag::Draw { index, from } => match self.doc.marks.get_mut(index) {
                Some(Mark::Arrow { to, .. }) => *to = p,
                Some(Mark::Rect { area, .. }) => *area = Area::from_points(from, p),
                _ => {}
            },
            Drag::MoveMark { index, from, start } => {
                let mut moved = start;
                moved.translate(raw.x - from.x, raw.y - from.y);
                if let Some(mark) = self.doc.marks.get_mut(index) {
                    *mark = moved;
                }
            }
            Drag::ArrowEnd { index, head } => {
                if let Some(Mark::Arrow { from, to, .. }) = self.doc.marks.get_mut(index) {
                    if head {
                        *to = p;
                    } else {
                        *from = p;
                    }
                }
            }
            Drag::RectHandle {
                index,
                handle,
                start,
            } => {
                if let Some(Mark::Rect { area, .. }) = self.doc.marks.get_mut(index) {
                    *area = drag_handle(&start, handle, p);
                }
            }
        }
        cx.notify();
    }

    fn mouse_up(&mut self, cx: &mut Context<Self>) {
        let Some(drag) = self.doc.drag.take() else {
            return;
        };
        let tiny = 3.0 * self.doc.metrics.px_per_pt;
        match drag {
            Drag::CropNew { .. } => {
                if self
                    .doc
                    .crop
                    .is_some_and(|crop| crop.width() < tiny || crop.height() < tiny)
                {
                    self.doc.crop = None;
                }
            }
            Drag::Draw { index, .. } => {
                let too_small = match self.doc.marks.get(index) {
                    Some(Mark::Arrow { from, to, .. }) => {
                        (to.x - from.x).abs() < tiny && (to.y - from.y).abs() < tiny
                    }
                    Some(Mark::Rect { area, .. }) => area.width() < tiny || area.height() < tiny,
                    _ => false,
                };
                if too_small {
                    self.doc.marks.remove(index);
                    self.doc.undo.pop();
                    self.doc.selected = None;
                }
            }
            _ => {}
        }
        cx.notify();
    }
}

fn tool_button(
    id: &'static str,
    label: &'static str,
    key: &'static str,
    active: bool,
) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .h(px(28.0))
        .px(px(8.0))
        .flex()
        .items_center()
        .gap(px(6.0))
        .rounded(px(7.0))
        .border_1()
        .border_color(if active {
            rgba(0xffffff29)
        } else {
            rgba(0x00000000)
        })
        .bg(if active {
            rgb(0x262626)
        } else {
            rgba(0x00000000)
        })
        .text_size(px(12.0))
        .text_color(if active { rgb(0xe8e8e8) } else { rgb(0x9a9a9a) })
        .hover(|style| style.text_color(rgb(0xe8e8e8)))
        .cursor_pointer()
        .child(label)
        .child(key_hint(key))
}

fn key_hint(key: &'static str) -> impl IntoElement {
    div()
        .text_size(px(10.0))
        .font_weight(gpui::FontWeight::SEMIBOLD)
        .px(px(5.0))
        .rounded(px(4.0))
        .border_1()
        .border_color(rgba(0xffffff29))
        .bg(rgb(0x222222))
        .text_color(rgb(0xe8e8e8))
        .child(key)
}

fn text_button(id: &'static str, label: &'static str, primary: bool) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .h(px(28.0))
        .px(px(10.0))
        .flex()
        .items_center()
        .gap(px(6.0))
        .rounded(px(7.0))
        .border_1()
        .border_color(if primary {
            rgba(0x00000000)
        } else {
            rgba(0xffffff14)
        })
        .bg(if primary {
            rgb(0x86d3f8)
        } else {
            rgb(0x1d1d1d)
        })
        .text_size(px(12.0))
        .font_weight(if primary {
            gpui::FontWeight::SEMIBOLD
        } else {
            gpui::FontWeight::NORMAL
        })
        .text_color(if primary {
            rgb(0x0b1a24)
        } else {
            rgb(0xe8e8e8)
        })
        .cursor_pointer()
        .child(label)
}

fn handle_square(center: Point<Pixels>) -> AnyElement {
    div()
        .absolute()
        .left(center.x - px(4.0))
        .top(center.y - px(4.0))
        .size(px(8.0))
        .rounded(px(2.0))
        .bg(rgb(0xffffff))
        .border_1()
        .border_color(rgb(0x86d3f8))
        .into_any_element()
}

impl EditorView {
    fn render_toolbar(&self, cx: &mut Context<Self>) -> AnyElement {
        let tool = self.doc.tool;
        let tools = [
            (
                "ghostex-capture-tool-pointer",
                "Pointer",
                "V",
                Tool::Pointer,
            ),
            ("ghostex-capture-tool-crop", "Crop", "C", Tool::Crop),
            ("ghostex-capture-tool-arrow", "Arrow", "A", Tool::Arrow),
            ("ghostex-capture-tool-text", "Text", "T", Tool::Text),
            ("ghostex-capture-tool-rect", "Rectangle", "R", Tool::Rect),
        ];
        let mut bar = div()
            .h(px(TOOLBAR_HEIGHT))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(4.0))
            .px(px(10.0))
            .border_b_1()
            .border_color(rgba(0xffffff14));
        for (id, label, key, value) in tools {
            bar = bar.child(
                tool_button(id, label, key, tool == value)
                    .on_click(cx.listener(move |this, _, _, cx| this.set_tool(value, cx))),
            );
        }
        bar = bar.child(
            div()
                .w(px(1.0))
                .h(px(20.0))
                .mx(px(4.0))
                .bg(rgba(0xffffff14)),
        );
        for (index, color) in COLORS.iter().copied().enumerate() {
            let active = self.doc.color == color;
            bar = bar.child(
                div()
                    .id(("ghostex-capture-color", index))
                    .size(px(16.0))
                    .flex_none()
                    .rounded_full()
                    .bg(rgb(color))
                    .border_2()
                    .border_color(if active {
                        rgb(0xffffff)
                    } else {
                        rgba(0x00000000)
                    })
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, _, cx| this.set_color(color, cx))),
            );
        }
        bar = bar
            .child(
                div()
                    .w(px(1.0))
                    .h(px(20.0))
                    .mx(px(4.0))
                    .bg(rgba(0xffffff14)),
            )
            .child(
                text_button("ghostex-capture-undo", "Undo", false).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.doc.undo();
                        cx.notify();
                    },
                )),
            )
            .child(div().flex_1())
            .child(
                text_button(
                    "ghostex-capture-copy",
                    if cfg!(target_os = "macos") {
                        "Copy ⌘C"
                    } else {
                        "Copy Ctrl+C"
                    },
                    false,
                )
                .on_click(cx.listener(|this, _, _, cx| this.copy(cx))),
            )
            .child(
                text_button("ghostex-capture-discard", "Discard", false)
                    .child(key_hint("Esc"))
                    .on_click(cx.listener(|this, _, _, cx| this.discard(cx))),
            )
            .child(
                text_button("ghostex-capture-add", "Add to prompt", true)
                    .child(key_hint("↵"))
                    .on_click(cx.listener(|this, _, _, cx| this.add_to_prompt(cx))),
            );
        bar.into_any_element()
    }

    /// Arrows, rectangles, the crop shade and the selection, drawn over the picture.
    fn render_overlay(&self) -> AnyElement {
        let layout = self.layout;
        let marks = self.doc.marks.clone();
        let metrics = self.doc.metrics;
        let crop = self.doc.crop;
        let (width, height) = self.doc.size();
        canvas(
            |_, _, _| {},
            move |_, _, window, _| {
                let stroke = px(metrics.stroke() * layout.scale);
                for mark in &marks {
                    match mark {
                        Mark::Arrow { from, to, color } => {
                            let (head, shaft_end) =
                                arrow_head((from.x, from.y), (to.x, to.y), metrics.arrow_head());
                            let mut line = gpui::PathBuilder::stroke(stroke);
                            line.move_to(layout.to_window(*from));
                            line.line_to(layout.to_window(P::new(shaft_end.0, shaft_end.1)));
                            if let Ok(path) = line.build() {
                                window.paint_path(path, rgb(*color));
                            }
                            let mut tip = gpui::PathBuilder::fill();
                            let points: Vec<Point<Pixels>> = head
                                .iter()
                                .map(|(x, y)| layout.to_window(P::new(*x, *y)))
                                .collect();
                            tip.add_polygon(&points, true);
                            if let Ok(path) = tip.build() {
                                window.paint_path(path, rgb(*color));
                            }
                        }
                        Mark::Rect { area, color } => {
                            let a = layout.to_window(P::new(area.left, area.top));
                            let b = layout.to_window(P::new(area.right, area.bottom));
                            let mut outline = gpui::PathBuilder::stroke(stroke);
                            outline.add_polygon(&[a, point(b.x, a.y), b, point(a.x, b.y)], true);
                            if let Ok(path) = outline.build() {
                                window.paint_path(path, rgb(*color));
                            }
                        }
                        Mark::Text { .. } => {}
                    }
                }
                if let Some(crop) = crop {
                    let shade = rgba(0x0000008c);
                    let full = Area {
                        left: 0.0,
                        top: 0.0,
                        right: width,
                        bottom: height,
                    };
                    for part in [
                        Area {
                            bottom: crop.top,
                            ..full
                        },
                        Area {
                            top: crop.bottom,
                            ..full
                        },
                        Area {
                            top: crop.top,
                            bottom: crop.bottom,
                            right: crop.left,
                            ..full
                        },
                        Area {
                            top: crop.top,
                            bottom: crop.bottom,
                            left: crop.right,
                            ..full
                        },
                    ] {
                        if part.width() <= 0.0 || part.height() <= 0.0 {
                            continue;
                        }
                        let origin = layout.to_window(P::new(part.left, part.top));
                        window.paint_quad(gpui::fill(
                            Bounds::new(
                                origin,
                                size(
                                    px(part.width() * layout.scale),
                                    px(part.height() * layout.scale),
                                ),
                            ),
                            shade,
                        ));
                    }
                    let a = layout.to_window(P::new(crop.left, crop.top));
                    let b = layout.to_window(P::new(crop.right, crop.bottom));
                    let mut outline = gpui::PathBuilder::stroke(px(1.5));
                    outline.add_polygon(&[a, point(b.x, a.y), b, point(a.x, b.y)], true);
                    if let Ok(path) = outline.build() {
                        window.paint_path(path, rgb(0xffffff));
                    }
                }
            },
        )
        .absolute()
        .inset_0()
        .into_any_element()
    }
}

impl Render for EditorView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.compute_layout(window.viewport_size());
        let layout = self.layout;
        let image = self.render_image();
        let (width, height) = self.doc.size();
        let toolbar = self.render_toolbar(cx);
        let mut stage = div()
            .id("ghostex-capture-editor-stage")
            .absolute()
            .left(px(0.0))
            .top(px(TOOLBAR_HEIGHT))
            .right(px(0.0))
            .bottom(px(0.0))
            .bg(rgb(0x121212))
            .cursor(match self.doc.tool {
                Tool::Pointer => CursorStyle::Arrow,
                Tool::Text => CursorStyle::IBeam,
                _ => CursorStyle::Crosshair,
            });
        stage = stage.child(
            img(ImageSource::Render(image))
                .absolute()
                .left(layout.origin.x)
                .top(layout.origin.y - px(TOOLBAR_HEIGHT))
                .w(px(width * layout.scale))
                .h(px(height * layout.scale)),
        );
        let mut root = div()
            .id("ghostex-capture-editor")
            .track_focus(&self.focus)
            .key_context("GhostexCaptureEditor")
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, _, cx| this.key_down(event, cx)))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &MouseDownEvent, window, cx| {
                    this.focus.focus(window, cx);
                    this.mouse_down(event.position, event.click_count, cx);
                }),
            )
            .on_mouse_move(cx.listener(|this, event: &MouseMoveEvent, _, cx| {
                if event.pressed_button == Some(MouseButton::Left) {
                    this.mouse_moved(event.position, cx);
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _: &MouseUpEvent, _, cx| this.mouse_up(cx)),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _: &MouseUpEvent, _, cx| this.mouse_up(cx)),
            )
            .size_full()
            .relative()
            .rounded(px(12.0))
            .overflow_hidden()
            .bg(rgb(0x161616))
            .border_1()
            .border_color(rgb(0x3a3a3a))
            .child(stage)
            .child(self.render_overlay());
        // Text marks are laid out as text so they match the export's font closely.
        for (index, mark) in self.doc.marks.iter().enumerate() {
            let Mark::Text { at, text, color } = mark else {
                continue;
            };
            let editing = self.doc.editing_text == Some(index);
            let position = layout.to_window(*at);
            let size_pt = self.doc.metrics.text_size() * layout.scale;
            let mut label = div()
                .absolute()
                .left(position.x)
                .top(position.y)
                .px(px(size_pt * 0.2))
                .text_size(px(size_pt))
                .line_height(px(size_pt * 1.25))
                .font_weight(gpui::FontWeight::BOLD)
                .text_color(rgb(*color))
                .whitespace_nowrap()
                .child(SharedString::from(if editing {
                    format!("{text}▏")
                } else {
                    text.clone()
                }));
            if self.doc.selected == Some(index) {
                label = label.border_1().border_dashed().border_color(rgb(0x86d3f8));
            }
            root = root.child(label);
        }
        if self.doc.tool == Tool::Pointer
            && let Some(index) = self.doc.selected
        {
            match self.doc.marks.get(index) {
                Some(Mark::Arrow { from, to, .. }) => {
                    root = root
                        .child(handle_square(layout.to_window(*from)))
                        .child(handle_square(layout.to_window(*to)));
                }
                Some(Mark::Rect { area, .. }) => {
                    for handle in BOX_HANDLES {
                        root =
                            root.child(handle_square(layout.to_window(handle_point(area, handle))));
                    }
                }
                _ => {}
            }
        }
        if let Some(crop) = self.doc.crop {
            for handle in BOX_HANDLES {
                root = root.child(handle_square(layout.to_window(handle_point(&crop, handle))));
            }
        }
        let hint = match (self.doc.tool, self.doc.crop.is_some()) {
            (Tool::Crop, false) => Some("Drag over the picture to crop · Enter to skip cropping"),
            (Tool::Crop, true) => {
                Some("Drag the edges to resize · Enter crops · Esc removes the box")
            }
            (Tool::Text, _) if self.doc.editing_text.is_some() => {
                Some("Type the label · Enter to finish · Shift+Enter for a new line")
            }
            _ => None,
        };
        if let Some(hint) = hint {
            root = root.child(
                div()
                    .absolute()
                    .bottom(px(12.0))
                    .left(px(0.0))
                    .right(px(0.0))
                    .flex()
                    .justify_center()
                    .child(
                        div()
                            .px(px(12.0))
                            .py(px(6.0))
                            .rounded(px(9.0))
                            .bg(rgba(0x141414eb))
                            .border_1()
                            .border_color(rgba(0xffffff29))
                            .text_size(px(12.0))
                            .text_color(rgb(0xe8e8e8))
                            .child(hint),
                    ),
            );
        }
        root.child(toolbar)
    }
}
