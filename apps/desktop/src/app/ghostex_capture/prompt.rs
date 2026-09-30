//! The floating prompt box: text, the screenshots taken for it, and where it goes.
//!
//! CDXC:GhostexCapture 2026-09-30 DECISION:
//! User: "I want to be able to prompt quickly into the app without having to switch back to
//! ghostex": a floating prompt box where screenshots land as thumbnails, more text and more
//! screenshots can be added (the capture buttons or the hotkeys), and Enter sends it to the project
//! or session picked, a new session by default. The editor is a separate window that hands its
//! picture here (layout B). Closing the box keeps the draft for next time.

use std::path::PathBuf;
use std::sync::Arc;

use gpui::prelude::*;
use gpui::{
    AnyElement, App, Bounds, Context, Entity, ImageSource, KeyDownEvent, RenderImage, SharedString,
    Subscription, WeakEntity, Window, WindowBackgroundAppearance, WindowBounds, WindowHandle,
    WindowKind, WindowOptions, div, img, point, px, rgb, rgba, size,
};
use gpui_component::input::{InputEvent, Textarea, TextareaState};
use image::RgbaImage;

use super::model::CaptureAction;
use super::placement;
use super::platform;
use super::targets::Target;
use crate::GhostexGpuiApp;

const PROMPT_WIDTH: f32 = 520.0;
const PROMPT_HEIGHT: f32 = 236.0;
const PROMPT_THUMBS_HEIGHT: f32 = 66.0;
const PICKER_HEIGHT: f32 = 300.0;

pub(crate) struct Attachment {
    pub(crate) number: u32,
    pub(crate) path: PathBuf,
    pub(crate) thumb: Arc<RenderImage>,
}

pub(crate) struct PromptWindow {
    pub(crate) handle: WindowHandle<gpui_component::Root>,
    pub(crate) view: Entity<PromptView>,
    pub(crate) native: Option<platform::NativeWindow>,
    pub(crate) scale: f32,
    pub(crate) frame: Bounds<gpui::Pixels>,
}

#[derive(Default)]
pub(crate) struct PromptState {
    pub(crate) window: Option<PromptWindow>,
    pub(crate) opening: bool,
    pub(crate) attachments: Vec<Attachment>,
    pub(crate) next_number: u32,
    pub(crate) target: Option<Target>,
    pub(crate) picker_open: bool,
    /// The text as typed, kept in step with the field so it survives closing the box.
    pub(crate) draft: String,
    pub(crate) sending: bool,
    /// The Ghostex draft session the unsent text is kept in, once there is one.
    pub(crate) draft_session: Option<super::drafts::DraftSession>,
    /// Bumped by every fresh prompt, so a draft session that finishes being made afterwards does
    /// not attach itself to the new prompt.
    pub(crate) generation: u64,
}

fn thumbnail(image: &RgbaImage) -> Arc<RenderImage> {
    let mut small = image::imageops::thumbnail(image, 168, 108);
    for pixel in small.chunks_exact_mut(4) {
        pixel.swap(0, 2);
    }
    Arc::new(RenderImage::new(vec![image::Frame::new(small)]))
}

impl GhostexGpuiApp {
    fn ghostex_capture_prompt_height(&self) -> f32 {
        let prompt = &self.ghostex_capture.prompt;
        PROMPT_HEIGHT
            + if prompt.attachments.is_empty() {
                0.0
            } else {
                PROMPT_THUMBS_HEIGHT
            }
            + if prompt.picker_open {
                PICKER_HEIGHT
            } else {
                0.0
            }
    }

    fn ghostex_capture_prompt_frame(&self, cx: &App) -> Option<Bounds<gpui::Pixels>> {
        let height = self.ghostex_capture_prompt_height();
        if let Some(icon) = self.ghostex_capture.icon.as_ref()
            && let Some(screen) = placement::screen_at(icon.frame.center(), cx)
                .or_else(|| self.ghostex_capture_home(cx).map(|(screen, _)| screen))
        {
            let frame = placement::panel_frame(&screen, icon.frame, height);
            return Some(Bounds::new(
                frame.origin,
                size(px(PROMPT_WIDTH), frame.size.height),
            ));
        }
        let screen = placement::home_screen(None, cx)?;
        let visible = screen.visible;
        Some(Bounds::new(
            point(
                visible.center().x - px(PROMPT_WIDTH / 2.0),
                visible.center().y - px(height / 2.0),
            ),
            size(px(PROMPT_WIDTH), px(height)),
        ))
    }

    pub(super) fn open_ghostex_capture_prompt(&mut self, cx: &mut Context<Self>) {
        if self.ghostex_capture.prompt.target.is_none() {
            self.ghostex_capture.prompt.target = self.ghostex_capture_default_target();
        }
        if let Some(window) = self.ghostex_capture.prompt.window.as_ref() {
            // Already open: Cmd/Alt+Ctrl+Shift+T only gives it the keyboard.
            let (handle, view) = (window.handle, window.view.clone());
            if let Some(native) = window.native {
                platform::focus_window(native);
            }
            App::defer(cx, move |cx| {
                let _ = handle.update(cx, |_, window, cx| {
                    view.update(cx, |view, cx| view.focus_input(window, cx))
                });
            });
            return;
        }
        if self.ghostex_capture.prompt.opening {
            return;
        }
        let Some(frame) = self.ghostex_capture_prompt_frame(cx) else {
            return;
        };
        self.ghostex_capture.prompt.opening = true;
        let draft = self.ghostex_capture.prompt.draft.clone();
        let app = cx.weak_entity();
        App::defer(cx, move |cx| {
            let owner = app.clone();
            let slot: std::rc::Rc<std::cell::RefCell<Option<Entity<PromptView>>>> =
                Default::default();
            let slot_in = slot.clone();
            let result = cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(frame)),
                    display_id: crate::app::window::popup_frame::display_at(frame.center(), cx),
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
                    window.set_background_corner_radius(px(14.0));
                    let view = cx.new(|cx| PromptView::new(owner, draft, window, cx));
                    view.update(cx, |view, cx| view.focus_input(window, cx));
                    *slot_in.borrow_mut() = Some(view.clone());
                    // Text inputs need gpui-component's Root in their window.
                    cx.new(|cx| {
                        gpui_component::Root::new(view, window, cx).bg(gpui::transparent_black())
                    })
                },
            );
            let Some(app) = app.upgrade() else {
                return;
            };
            let view = slot.borrow_mut().take();
            let (Ok(handle), Some(view)) = (result, view) else {
                app.update(cx, |app, _| app.ghostex_capture.prompt.opening = false);
                return;
            };
            let found = handle
                .update(cx, |_, window, _| {
                    let native = crate::app::helpers::cef_parent_native_view(window)
                        .ok()
                        .map(|view| view as usize);
                    (native, window.scale_factor())
                })
                .ok();
            let Some((native, scale)) = found else {
                app.update(cx, |app, _| app.ghostex_capture.prompt.opening = false);
                return;
            };
            if let Some(native) = native {
                platform::prepare_floating_window(native, true);
            }
            app.update(cx, |app, cx| {
                app.ghostex_capture.prompt.opening = false;
                app.ghostex_capture.prompt.window = Some(PromptWindow {
                    handle,
                    view,
                    native,
                    scale,
                    frame,
                });
                cx.notify();
            });
        });
    }

    pub(crate) fn close_ghostex_capture_prompt(&mut self, cx: &mut Context<Self>) {
        self.ghostex_capture.prompt.picker_open = false;
        if self.ghostex_capture.prompt.window.is_some() {
            self.save_ghostex_capture_draft(false, cx);
        }
        if let Some(window) = self.ghostex_capture.prompt.window.take() {
            let handle = window.handle;
            App::defer(cx, move |cx| {
                let _ = handle.update(cx, |_, window, _| window.remove_window());
            });
        }
    }

    /// Moves the box to the size its content needs now.
    fn resize_ghostex_capture_prompt(&mut self, cx: &mut Context<Self>) {
        let Some(frame) = self.ghostex_capture_prompt_frame(cx) else {
            return;
        };
        let Some(window) = self.ghostex_capture.prompt.window.as_mut() else {
            return;
        };
        if window.frame == frame {
            return;
        }
        window.frame = frame;
        if let Some(native) = window.native {
            platform::set_window_frame(native, frame, window.scale);
        }
        let handle = window.handle;
        App::defer(cx, move |cx| {
            let _ = handle.update(cx, |_, window, cx| window.bounds_changed(cx));
        });
    }

    pub(super) fn hide_ghostex_capture_prompt_window(&mut self) {
        if let Some(window) = self.ghostex_capture.prompt.window.as_ref()
            && let Some(native) = window.native
        {
            let away = Bounds::new(point(px(-30000.0), px(-30000.0)), window.frame.size);
            platform::set_window_frame(native, away, window.scale);
        }
    }

    pub(super) fn show_ghostex_capture_prompt_window(&mut self) {
        if let Some(window) = self.ghostex_capture.prompt.window.as_ref()
            && let Some(native) = window.native
        {
            platform::set_window_frame(native, window.frame, window.scale);
        }
    }

    /// A finished picture from the editor: a thumbnail in the box and `[Image #N]` in the text.
    pub(super) fn add_ghostex_capture_attachment(
        &mut self,
        path: PathBuf,
        image: RgbaImage,
        cx: &mut Context<Self>,
    ) {
        let prompt = &mut self.ghostex_capture.prompt;
        prompt.next_number += 1;
        let number = prompt.next_number;
        prompt.attachments.push(Attachment {
            number,
            path,
            thumb: thumbnail(&image),
        });
        let token = format!("[Image #{number}] ");
        match prompt.window.as_ref() {
            Some(window) => {
                let (handle, view) = (window.handle, window.view.clone());
                App::defer(cx, move |cx| {
                    let _ = handle.update(cx, |_, window, cx| {
                        view.update(cx, |view, cx| view.insert(&token, window, cx))
                    });
                });
                self.resize_ghostex_capture_prompt(cx);
            }
            None => {
                if !prompt.draft.is_empty() && !prompt.draft.ends_with(char::is_whitespace) {
                    prompt.draft.push(' ');
                }
                prompt.draft.push_str(&token);
                self.open_ghostex_capture_prompt(cx);
            }
        }
        cx.notify();
    }

    fn remove_ghostex_capture_attachment(&mut self, number: u32, cx: &mut Context<Self>) {
        let prompt = &mut self.ghostex_capture.prompt;
        prompt
            .attachments
            .retain(|attachment| attachment.number != number);
        let token = format!("[Image #{number}]");
        let cleaned = prompt
            .draft
            .replace(&format!("{token} "), "")
            .replace(&token, "");
        if cleaned != prompt.draft {
            prompt.draft = cleaned.clone();
            if let Some(window) = prompt.window.as_ref() {
                let (handle, view) = (window.handle, window.view.clone());
                App::defer(cx, move |cx| {
                    let _ = handle.update(cx, |_, window, cx| {
                        view.update(cx, |view, cx| view.set_text(&cleaned, window, cx))
                    });
                });
            }
        }
        self.resize_ghostex_capture_prompt(cx);
        cx.notify();
    }

    fn toggle_ghostex_capture_picker(&mut self, cx: &mut Context<Self>) {
        self.ghostex_capture.prompt.picker_open = !self.ghostex_capture.prompt.picker_open;
        self.resize_ghostex_capture_prompt(cx);
        cx.notify();
    }

    fn pick_ghostex_capture_target(&mut self, target: Target, cx: &mut Context<Self>) {
        self.ghostex_capture.prompt.target = Some(target);
        self.ghostex_capture.prompt.picker_open = false;
        self.resize_ghostex_capture_prompt(cx);
        cx.notify();
    }
}

pub(crate) struct PromptView {
    app: WeakEntity<GhostexGpuiApp>,
    input: Entity<TextareaState>,
    _subscriptions: Vec<Subscription>,
}

impl PromptView {
    fn new(
        app: WeakEntity<GhostexGpuiApp>,
        draft: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let input = cx.new(|cx| {
            TextareaState::new(window, cx)
                .submit_on_enter(true)
                .auto_grow(3, 7)
                .placeholder("Say what you want. Screenshots are added as [Image #N].")
                .default_value(draft)
        });
        let mut subscriptions = vec![cx.subscribe_in(
            &input,
            window,
            |this: &mut Self, input, event: &InputEvent, _, cx| match event {
                InputEvent::Change => {
                    let text = input.read(cx).value().to_string();
                    this.with_app(cx, move |app, _| app.ghostex_capture.prompt.draft = text);
                }
                InputEvent::PressEnter { shift: false, .. } => {
                    this.with_app(cx, |app, cx| app.send_ghostex_capture_prompt(cx));
                }
                _ => {}
            },
        )];
        if let Some(owner) = app.upgrade() {
            subscriptions.push(cx.observe(&owner, |_, _, cx| cx.notify()));
        }
        Self {
            app,
            input,
            _subscriptions: subscriptions,
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

    pub(crate) fn focus_input(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.input.update(cx, |input, cx| input.focus(window, cx));
    }

    fn insert(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        let text = text.to_string();
        self.input
            .update(cx, |input, cx| input.insert(text, window, cx));
        let value = self.input.read(cx).value().to_string();
        self.with_app(cx, move |app, _| app.ghostex_capture.prompt.draft = value);
        self.focus_input(window, cx);
    }

    fn set_text(&mut self, text: &str, window: &mut Window, cx: &mut Context<Self>) {
        let text = text.to_string();
        self.input
            .update(cx, |input, cx| input.set_value(text, window, cx));
    }

    fn render_picker(
        &self,
        projects: Vec<crate::app::gx_store::CaptureTargetProject>,
        current: Option<Target>,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let mut list = div()
            .id("ghostex-capture-targets")
            .h(px(PICKER_HEIGHT - 8.0))
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(2.0))
            .p(px(6.0))
            .rounded(px(10.0))
            .bg(rgb(0x1b1b1b))
            .border_1()
            .border_color(rgb(0x3a3a3a));
        for project in projects {
            let heading = match &project.machine {
                Some(machine) => format!("{} · {machine}", project.title),
                None => project.title.clone(),
            };
            list = list.child(
                div()
                    .px(px(8.0))
                    .pt(px(6.0))
                    .pb(px(2.0))
                    .text_size(px(11.0))
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(rgb(0x9a9a9a))
                    .child(SharedString::from(heading)),
            );
            let new_session = Target::NewSession {
                project: project.workspace_project_id.clone(),
                title: project.title.clone(),
            };
            list = list.child(target_row(
                SharedString::from(format!("new-{}", project.workspace_project_id)),
                div()
                    .w(px(9.0))
                    .text_color(rgb(0x9a9a9a))
                    .child("+")
                    .into_any_element(),
                "New session".to_string(),
                String::new(),
                current.as_ref() == Some(&new_session),
                cx.listener(move |this, _, _, cx| {
                    let target = new_session.clone();
                    this.with_app(cx, move |app, cx| {
                        app.pick_ghostex_capture_target(target, cx)
                    });
                }),
            ));
            for session in project.sessions {
                let target = Target::Session {
                    session: session.sidebar_session_id.clone(),
                    title: session.title.clone(),
                    project_title: project.title.clone(),
                };
                let (color, square) = if session.question {
                    (0xf472b6, false)
                } else {
                    match session.activity.as_str() {
                        "working" => (0xc68a06, true),
                        "attention" => (0x0093fe, false),
                        _ => (if session.sleeping { 0x5f5f5f } else { 0xd9d9d9 }, false),
                    }
                };
                let dot = div()
                    .flex_none()
                    .size(px(if square { 8.0 } else { 9.0 }))
                    .bg(rgb(color));
                let dot = if square {
                    dot.rounded(px(1.0))
                } else {
                    dot.rounded_full()
                };
                list = list.child(target_row(
                    SharedString::from(format!("session-{}", session.sidebar_session_id)),
                    dot.into_any_element(),
                    session.title.clone(),
                    if session.question {
                        "asking".into()
                    } else {
                        String::new()
                    },
                    current.as_ref() == Some(&target),
                    cx.listener(move |this, _, _, cx| {
                        let target = target.clone();
                        this.with_app(cx, move |app, cx| {
                            app.pick_ghostex_capture_target(target, cx)
                        });
                    }),
                ));
            }
        }
        list.into_any_element()
    }
}

fn target_row(
    id: SharedString,
    marker: AnyElement,
    title: String,
    trailing: String,
    selected: bool,
    on_click: impl Fn(&gpui::ClickEvent, &mut Window, &mut App) + 'static,
) -> AnyElement {
    div()
        .id(id)
        .h(px(28.0))
        .px(px(8.0))
        .flex()
        .items_center()
        .gap(px(8.0))
        .rounded(px(6.0))
        .when(selected, |row| row.bg(rgb(0x2a2a2a)))
        .hover(|row| row.bg(rgb(0x242424)))
        .cursor_pointer()
        .child(marker)
        .child(
            div()
                .flex_1()
                .min_w_0()
                .overflow_hidden()
                .whitespace_nowrap()
                .text_ellipsis()
                .text_size(px(12.5))
                .text_color(rgb(0xc9ccd2))
                .child(SharedString::from(title)),
        )
        .child(
            div()
                .text_size(px(11.5))
                .text_color(rgb(0x5f5f5f))
                .child(SharedString::from(trailing)),
        )
        .on_click(on_click)
        .into_any_element()
}

fn chip(id: &'static str, label: String) -> gpui::Stateful<gpui::Div> {
    div()
        .id(id)
        .h(px(26.0))
        .px(px(9.0))
        .flex()
        .items_center()
        .gap(px(6.0))
        .rounded(px(7.0))
        .bg(rgb(0x1d1d1d))
        .border_1()
        .border_color(rgba(0xffffff14))
        .text_size(px(12.0))
        .text_color(rgb(0xe8e8e8))
        .cursor_pointer()
        .child(SharedString::from(label))
}

fn hotkey(letter: &str) -> String {
    if cfg!(target_os = "macos") {
        format!("⌘⌃⇧{letter}")
    } else {
        format!("Alt+Ctrl+Shift+{letter}")
    }
}

impl Render for PromptView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let Some(app) = self.app.upgrade() else {
            return div().into_any_element();
        };
        let app = app.read(cx);
        let prompt = &app.ghostex_capture.prompt;
        let target = prompt
            .target
            .as_ref()
            .map(Target::label)
            .unwrap_or_else(|| "Pick a project".into());
        let picker_projects = prompt.picker_open.then(|| app.ghostex_capture_targets());
        let current = prompt.target.clone();
        let sending = prompt.sending;
        let thumbs: Vec<(u32, Arc<RenderImage>)> = prompt
            .attachments
            .iter()
            .map(|attachment| (attachment.number, attachment.thumb.clone()))
            .collect();
        let picker = picker_projects.map(|projects| self.render_picker(projects, current, cx));
        let header = div()
            .flex()
            .items_center()
            .gap(px(6.0))
            .child(
                div()
                    .text_size(px(12.0))
                    .text_color(rgb(0x9a9a9a))
                    .child("Send to"),
            )
            .child(
                chip("ghostex-capture-target", format!("{target}  ▾")).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.with_app(cx, |app, cx| app.toggle_ghostex_capture_picker(cx))
                    },
                )),
            )
            .child(div().flex_1())
            .child(
                div()
                    .id("ghostex-capture-prompt-close")
                    .px(px(6.0))
                    .text_size(px(14.0))
                    .text_color(rgb(0x9a9a9a))
                    .cursor_pointer()
                    .child("✕")
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.with_app(cx, |app, cx| app.close_ghostex_capture_prompt(cx))
                    })),
            );
        let mut field = div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .p(px(10.0))
            .rounded(px(12.0))
            .bg(rgb(0x121212))
            .border_1()
            .border_color(rgba(0xffffff29));
        if !thumbs.is_empty() {
            let mut row = div().flex().gap(px(8.0));
            for (number, thumb) in thumbs {
                row = row.child(
                    div()
                        .relative()
                        .w(px(84.0))
                        .h(px(54.0))
                        .rounded(px(7.0))
                        .overflow_hidden()
                        .border_1()
                        .border_color(rgba(0xffffff29))
                        .child(img(ImageSource::Render(thumb)).size_full())
                        .child(
                            div()
                                .absolute()
                                .left(px(4.0))
                                .bottom(px(3.0))
                                .px(px(4.0))
                                .rounded(px(4.0))
                                .bg(rgba(0x000000b3))
                                .text_size(px(10.0))
                                .text_color(rgb(0xe8e8e8))
                                .child(format!("#{number}")),
                        )
                        .child(
                            div()
                                .id(("ghostex-capture-remove", number as usize))
                                .absolute()
                                .right(px(3.0))
                                .top(px(3.0))
                                .size(px(16.0))
                                .rounded_full()
                                .bg(rgba(0x000000b3))
                                .flex()
                                .items_center()
                                .justify_center()
                                .text_size(px(9.0))
                                .text_color(rgb(0xe8e8e8))
                                .cursor_pointer()
                                .child("✕")
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.with_app(cx, move |app, cx| {
                                        app.remove_ghostex_capture_attachment(number, cx)
                                    })
                                })),
                        ),
                );
            }
            field = field.child(row);
        }
        field = field.child(
            Textarea::new(&self.input)
                .appearance(false)
                .text_size(px(13.5))
                .text_color(rgb(0xe8e8e8)),
        );
        let capture_button = |id: &'static str, label: &'static str, letter: &str, action| {
            div()
                .id(id)
                .h(px(26.0))
                .px(px(8.0))
                .flex()
                .items_center()
                .gap(px(6.0))
                .rounded(px(7.0))
                .border_1()
                .border_color(rgba(0xffffff14))
                .text_size(px(11.5))
                .text_color(rgb(0x9a9a9a))
                .hover(|style| style.text_color(rgb(0xe8e8e8)))
                .cursor_pointer()
                .child(label)
                .child(
                    div()
                        .text_size(px(10.0))
                        .text_color(rgb(0x6b6b6b))
                        .child(hotkey(letter)),
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.with_app(cx, move |app, cx| {
                        app.run_ghostex_capture_action(action, cx)
                    })
                }))
        };
        let footer = div()
            .flex()
            .items_center()
            .gap(px(6.0))
            .child(capture_button(
                "ghostex-capture-more-area",
                "Area",
                "A",
                CaptureAction::Area,
            ))
            .child(capture_button(
                "ghostex-capture-more-app",
                "App",
                "Space",
                CaptureAction::CurrentApp,
            ))
            .child(capture_button(
                "ghostex-capture-more-screen",
                "Screen",
                "F",
                CaptureAction::FullScreen,
            ))
            .child(div().flex_1())
            .child(
                div()
                    .id("ghostex-capture-send")
                    .h(px(28.0))
                    .px(px(14.0))
                    .flex()
                    .items_center()
                    .rounded_full()
                    .bg(if sending {
                        rgb(0x3a4a52)
                    } else {
                        rgb(0x86d3f8)
                    })
                    .text_size(px(12.0))
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(rgb(0x0b1a24))
                    .cursor_pointer()
                    .child(if sending { "Sending…" } else { "Send ↵" })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.with_app(cx, |app, cx| app.send_ghostex_capture_prompt(cx))
                    })),
            );
        let mut root = div()
            .id("ghostex-capture-prompt")
            .size_full()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .p(px(10.0))
            .rounded(px(14.0))
            .bg(rgb(0x161616))
            .border_1()
            .border_color(rgb(0x3a3a3a))
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, _, cx| {
                if event.keystroke.key == "escape" {
                    cx.stop_propagation();
                    this.with_app(cx, |app, cx| {
                        if app.ghostex_capture.prompt.picker_open {
                            app.toggle_ghostex_capture_picker(cx);
                        } else {
                            app.close_ghostex_capture_prompt(cx);
                        }
                    });
                }
            }))
            .child(header);
        if let Some(picker) = picker {
            root = root.child(picker);
        }
        root.child(field).child(footer).into_any_element()
    }
}
