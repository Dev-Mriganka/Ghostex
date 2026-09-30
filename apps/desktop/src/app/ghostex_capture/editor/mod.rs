//! The screenshot editor: opening it on a fresh capture and what happens to the picture after.

mod export;
pub(crate) mod model;
mod view;

use std::path::PathBuf;

use gpui::{
    App, AppContext as _, Bounds, Context, WindowBackgroundAppearance, WindowBounds, WindowHandle,
    WindowKind, WindowOptions, point, px, size,
};
use image::RgbaImage;

use super::placement::Screen;
use super::platform;
use super::save;
use crate::GhostexGpuiApp;
pub(crate) use view::EditorView;

pub(crate) struct EditorWindow {
    pub(crate) handle: WindowHandle<EditorView>,
    /// The capture as taken, already saved; sent as is when nothing was changed.
    pub(crate) original: PathBuf,
}

impl GhostexGpuiApp {
    /// Opens the editor on a capture taken from `screen`. `px_per_pt` is the picture's pixels per
    /// point of that screen.
    pub(super) fn open_ghostex_capture_editor(
        &mut self,
        image: RgbaImage,
        original: PathBuf,
        px_per_pt: f32,
        screen: Screen,
        cx: &mut Context<Self>,
    ) {
        self.close_ghostex_capture_editor(cx);
        let visible = screen.visible;
        let shown_width = image.width() as f32 / px_per_pt;
        let shown_height = image.height() as f32 / px_per_pt;
        let width = (shown_width + 36.0)
            .max(720.0)
            .min(f32::from(visible.size.width) * 0.86);
        let height = (shown_height + view::TOOLBAR_HEIGHT + 36.0)
            .max(420.0)
            .min(f32::from(visible.size.height) * 0.86);
        let frame = Bounds::new(
            point(
                visible.center().x - px(width / 2.0),
                visible.center().y - px(height / 2.0),
            ),
            size(px(width), px(height)),
        );
        let app = cx.weak_entity();
        App::defer(cx, move |cx| {
            let owner = app.clone();
            let result = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(frame)),
                    display_id: Some(screen.id),
                    titlebar: None,
                    focus: true,
                    show: true,
                    kind: if cfg!(target_os = "linux") {
                        crate::app::window::popup_frame::child_window_kind()
                    } else {
                        WindowKind::PopUp
                    },
                    window_decorations: crate::app::window::popup_frame::child_window_decorations(),
                    is_movable: false,
                    is_resizable: false,
                    is_minimizable: false,
                    app_id: crate::gpui_platform_window_app_id(),
                    icon: crate::gpui_platform_window_icon(),
                    window_background: WindowBackgroundAppearance::Transparent,
                    ..Default::default()
                },
                move |window, cx| {
                    window.set_background_corner_radius(px(12.0));
                    let view = cx.new(|cx| EditorView::new(owner, image, px_per_pt, cx));
                    let focus = view.read(cx).focus.clone();
                    focus.focus(window, cx);
                    view
                },
            );
            let Some(app) = app.upgrade() else {
                return;
            };
            let Ok(handle) = result else {
                return;
            };
            let native = handle
                .update(cx, |_, window, _| {
                    crate::app::helpers::cef_parent_native_view(window)
                        .ok()
                        .map(|view| view as usize)
                })
                .ok()
                .flatten();
            if let Some(native) = native {
                platform::prepare_floating_window(native, true);
            }
            app.update(cx, |app, cx| {
                app.ghostex_capture.editor = Some(EditorWindow { handle, original });
                cx.notify();
            });
        });
    }

    /// Sends the picture in an open editor to the prompt box, as Enter would.
    pub(super) fn commit_open_ghostex_capture_editor(&mut self, cx: &mut Context<Self>) {
        let Some(handle) = self
            .ghostex_capture
            .editor
            .as_ref()
            .map(|editor| editor.handle)
        else {
            return;
        };
        let app = cx.weak_entity();
        App::defer(cx, move |cx| {
            let Ok((image, edited)) = handle.update(cx, |view, _, _| view.take_result()) else {
                return;
            };
            let _ = app.update(cx, |app, cx| {
                app.ghostex_capture_editor_done(image, edited, cx)
            });
        });
    }

    pub(crate) fn close_ghostex_capture_editor(&mut self, cx: &mut Context<Self>) {
        if let Some(editor) = self.ghostex_capture.editor.take() {
            let handle = editor.handle;
            App::defer(cx, move |cx| {
                let _ = handle.update(cx, |_, window, _| window.remove_window());
            });
        }
    }

    /// The picture for the prompt: the original file when nothing changed, else an edited copy.
    fn ghostex_capture_editor_file(&mut self, image: &RgbaImage, edited: bool) -> Option<PathBuf> {
        let original = self.ghostex_capture.editor.as_ref()?.original.clone();
        if !edited {
            return Some(original);
        }
        match save::save_png(image, true) {
            Ok(path) => Some(path),
            Err(_) => Some(original),
        }
    }

    pub(super) fn ghostex_capture_editor_done(
        &mut self,
        image: RgbaImage,
        edited: bool,
        cx: &mut Context<Self>,
    ) {
        let Some(path) = self.ghostex_capture_editor_file(&image, edited) else {
            return;
        };
        self.close_ghostex_capture_editor(cx);
        self.add_ghostex_capture_attachment(path, image, cx);
    }

    pub(super) fn ghostex_capture_editor_copy(
        &mut self,
        image: RgbaImage,
        edited: bool,
        cx: &mut Context<Self>,
    ) {
        let _ = self.ghostex_capture_editor_file(&image, edited);
        let mut png = Vec::new();
        if image
            .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
            .is_err()
        {
            return;
        }
        let item =
            gpui::ClipboardItem::new_image(&gpui::Image::from_bytes(gpui::ImageFormat::Png, png));
        cx.write_to_clipboard(item);
        crate::app::window::copied_indicator::show_copied_indicator(cx);
    }
}
