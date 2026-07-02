# Settings `display()` Fallback for Obsidian < 1.13

**Date:** 2026-07-02
**Status:** Approved

## Problem

The settings tab was migrated (commit `127fa2f`) to Obsidian's 1.13 declarative
settings API: `SemanticGraphSettingTab` implements only `getSettingDefinitions()`
and has no `display()` method. On Obsidian 1.13+, the app auto-renders the pane
from `getSettingDefinitions()`. On older Obsidian (the user runs **1.11.5**, and
the current public stable is **1.12.7**), that API does not exist, so opening the
plugin's settings pane renders **nothing** — the pane is blank.

`minAppVersion` is `1.13.0`, but 1.13 is not yet on the public download channel,
so users cannot simply update to reach it.

## Goal

Make the settings pane render correctly on Obsidian versions that lack the 1.13
declarative API, without duplicating the setting definitions.

## Approach

Add a `display()` method that walks the array returned by
`getSettingDefinitions()` and renders each item using the standard `Setting` API
(available since 1.11). `getSettingDefinitions()` stays the **single source of
truth** — adding or changing a setting means editing that one method, and both
the 1.13 auto-render path and this fallback pick it up.

**Always render from `display()`** — no version detection. Obsidian prefers a
tab's own `display()` when present, so implementing it means the same code runs
on every version; there is no double-render and no branching to maintain. This
also lowers `minAppVersion` to a value the public channel actually ships.

## Scope — what the fallback handles

Only what `getSettingDefinitions()` in this plugin actually uses (YAGNI):

| Feature | Present in this plugin | Fallback handles |
|---|---|---|
| `type: "group"` with `heading` + `items[]` | yes | yes |
| control `dropdown` | yes | yes |
| control `text` | yes | yes |
| control `toggle` | yes | yes |
| control `slider` (`min`/`max`/`step`) | yes | yes |
| `render(setting, group)` imperative rows | yes | yes (delegate to `Setting`) |
| `visible: boolean \| () => boolean` | yes | yes (skip row when false) |
| `name` / `desc` | yes | yes |
| `list` / `page` / `number` / `file` / `folder` / `color` / `action` / `validate` / `disabled` / `search` / `defaultValue` | no | **not implemented** |

Unknown control types are silently skipped rather than throwing, so a future
definition that adds an unsupported control degrades gracefully instead of
blanking the whole pane.

## Design

### `display()`

```
display():
  clear containerEl
  for each item in getSettingDefinitions():
    if item.type is "group":
      render a heading Setting (if item.heading)
      for each child in item.items: renderItem(child)
    else:
      renderItem(item)
```

### `renderItem(def)`

```
if def.visible resolves to false: return          // boolean or () => boolean
setting = new Setting(containerEl)
if def.name: setting.setName(def.name)
if def.desc: setting.setDesc(def.desc)
if def.render: def.render(setting, <group shim>); return
if def.control: applyControl(setting, def.control)
```

`def.render` in this plugin only ever uses the `Setting` argument (add buttons,
text, extra buttons) — it never touches the second `SettingGroup` argument. The
fallback passes a minimal shim (or `undefined` cast) for the group param; this
is verified against the four `render` sites in `getSettingDefinitions()`.

### `applyControl(setting, control)`

Dispatch on `control.type`, wiring value read/write through the **existing**
`getControlValue(key)` / `setControlValue(key, value)` methods:

- `dropdown`: `addDropdown` → `addOptions(control.options)`, set current value,
  `onChange` → `setControlValue`
- `text`: `addText` → placeholder, set value, `onChange` → `setControlValue`
- `toggle`: `addToggle` → set value, `onChange` → `setControlValue`
- `slider`: `addSlider` → `setLimits(min, max, step)`, set value, dynamic
  tooltip, `onChange` → `setControlValue`
- default: skip (unknown type)

### Re-render (`update`)

`getSettingDefinitions()` and `setControlValue()` call `this.update()` to force a
structural re-render (e.g. after language or provider change, which alters
visibility and dropdown option sets). On <1.13 the inherited `update()` may not
exist or may be a no-op. Override `update()` to call `this.display()`, so those
re-render triggers rebuild the pane correctly on all versions.

## Testing

The project has **no test framework** (build is esbuild-only; no vitest/jest).
Introducing one solely for this thin fallback is scope creep. The
definition-walk logic is small and directly readable, and the real risk is
runtime DOM/`Setting` behavior, which a unit test with mocked Obsidian would not
catch faithfully.

Verification strategy:

1. **Type + build check** — `npm run build` must succeed (esbuild + tsc types).
2. **Integration test (primary)** — deploy the built plugin into the local vault
   at `.obsidian/plugins/3d-semantic-graph`, reload on Obsidian **1.11.5**, open
   the plugin settings pane, and confirm every group and control renders and is
   interactive (dropdowns change, sliders move, toggles flip, buttons fire).
   Then confirm the timeline/history feature reads the modified ctimes.

If a test framework is added to this project later, extract `renderItem`'s
visible-evaluation and control-dispatch into a pure helper and cover it then.

## Version / release impact

- Lower `minAppVersion` to a value the public stable channel ships (target
  `1.11.0` or the lowest version whose `Setting` API this fallback relies on —
  `addSlider`/`setHeading` exist well before 1.11, but 1.11 is a safe floor and
  matches the user's installed version).
- Bump plugin version (patch/minor) in `manifest.json`, `package.json`,
  `versions.json`.
- Cut a GitHub release with `main.js`, `manifest.json`, `styles.css`.

## Non-goals

- No refactor of `getSettingDefinitions()` content.
- No support for declarative features the plugin doesn't use.
- No behavior change on Obsidian 1.13+ beyond routing through `display()`.
