# ArSonKuPik v0.3.107 Release Audit

## Runtime blocker fixed

The offscreen audio engine referenced `createSilentMeters()` during startup cleanup and public-state fallback, but the helper existed only in the service worker. Because `start()` begins by calling `stop(false)`, the undefined reference could abort every enhancement attempt before tab capture was established.

v0.3.107 defines a complete silent-meter state inside the offscreen module and adds a regression test that requires the declaration to appear before every runtime use.

## Popup preset selector

The Quick Preset selector CSS contained an incomplete comma-separated selector block with no declarations. The browser therefore displayed the platform default select control. v0.3.107 restores full-width dark styling, hover/focus states, a custom arrow, accessible focus visibility, and dark option colors.

## Release gate

The release must pass repository validation, privacy/support tests, audio stability, headless playback, update queues, global state scheduling, runtime startup regression, deterministic packaging, ZIP integrity, and checksum verification before publication.
