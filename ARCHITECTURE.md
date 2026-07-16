# ArSonKuPik Architecture

## Runtime model

ArSonKuPik uses a Chrome Manifest V3 service worker to coordinate user actions and persistent state. Audio processing is hosted in an offscreen extension document because popup pages are short-lived and cannot reliably own a continuous audio graph.

1. The popup presents the versioned local-processing notice and records explicit consent.
2. The user starts enhancement for a selected tab.
3. The service worker verifies consent before accepting `START_ENHANCE` and requests a stream identifier for the selected tab.
4. The offscreen document consumes the tab stream through `getUserMedia` using Chrome's tab-capture constraints.
5. The Web Audio graph applies the enabled mastering modules.
6. Meter, spectrum, correlation, and routing state are returned to Studio through extension messages.
7. User settings and custom presets are stored in `chrome.storage.local`; short-lived coordination data may use `chrome.storage.session`.

## Major boundaries

### Service worker

`src/background/service-worker.js`

- Owns install/startup defaults.
- Manages the current capture tab and Studio tab.
- Creates the offscreen document when required.
- Enforces versioned privacy consent before capture can start.
- Normalizes and persists engine state.
- Stores only normalized hostnames for per-site preferences and exposes deletion commands.
- Updates action badge/title state per tab.
- Relays commands between UI and DSP contexts.

### Offscreen DSP engine

`src/offscreen/offscreen.js`

- Builds and updates the Web Audio node graph.
- Processes the captured tab stream locally.
- Calculates level, gain-reduction, correlation, and spectrum telemetry.
- Applies system-default playback through an `HTMLMediaElement` sink where available.
- Avoids remote code, remote assets, and network transport.

### Popup

`popup.html`, `src/popup/*`

- Provides a minimal, fast control surface.
- Presents the first-use privacy notice and consent action.
- Starts or stops enhancement.
- Clears per-site preferences or resets all extension-local data.
- Selects a master preset.
- Exposes local audio-system-default playback.
- Opens the full Studio panel.

### Studio

`studio.html`, `src/studio/*`

- Provides advanced visual editing for the complete chain.
- Owns parametric EQ interaction, module controls, A/B slots, history, preset editing, and meters.
- Polls analysis frames only while visible.

### Shared modules

`src/shared/*`

- Keep preset normalization and message contracts consistent across contexts.
- Isolate output-device compatibility logic.
- Convert FFT data into the visual spectrum representation.

## State principles

- Defaults are created centrally in `src/shared/presets.js`.
- Every state write is normalized before it reaches the audio graph or persistent storage.
- User-selected system-default playback is preserved when sonic presets are applied.
- Factory-preset revisions can refresh defaults without overwriting unrelated user choices.

## Privacy boundary

No runtime source file performs an HTTP request, opens a WebSocket, loads remote code, declares a host permission, requests microphone access, or uses `chrome.contentSettings`. Audio frames remain inside the browser's local media and Web Audio pipeline. Named speaker selection is user-initiated through the browser chooser when supported; otherwise routing remains on System Default.
