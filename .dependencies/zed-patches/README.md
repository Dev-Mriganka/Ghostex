# GPUI terminal shader patch

This patch targets the Zed revision recorded in `UPSTREAM`. It adds a macOS
Metal effect group to GPUI: capture painted terminal content, run a chain of
Ghostty-compatible fragment shaders, and composite the result in the existing
scene. It does not change terminal input, PTYs, or Ghostex session protocols.

The patch is tracked in the Ghostex repository because uncommitted changes
inside the Zed submodule are not included when someone clones Ghostex.
The canonical desktop launcher applies it after initializing dependencies.
The macOS runtime preparation and packaging scripts also apply it, covering
normal builds and release packaging:

```sh
bun tooling/apply-zed-patches.mjs
```

Run that command before a direct `cargo check` or desktop build in a fresh
checkout. It accepts an already applied patch and refuses conflicts instead
of resetting or replacing local dependency changes.

After intentionally editing the GPUI effect implementation, regenerate the
patch from the pinned Zed checkout and review its contents:

```sh
git -C .dependencies/zed diff --binary -- crates/gpui crates/gpui_apple crates/gpui_macos > .dependencies/zed-patches/0001-terminal-shader-effects.patch
```

The Metal renderer supports this effect. Other backends keep painting the
original content. The public API is macOS-only; the web and Linux/Windows
terminal paths retain their existing rendering.
