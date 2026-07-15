export const DEFAULT_AUDIO_OUTPUT_DEVICE = {
  deviceId: 'default',
  label: 'System Default',
  kind: 'audiooutput',
  isDefault: true
};

export function normalizeOutputDeviceId(deviceId) {
  const value = String(deviceId || 'default').trim();
  return value && value !== 'undefined' && value !== 'null' ? value : 'default';
}

export function deviceIdToSinkId(deviceId) {
  const normalized = normalizeOutputDeviceId(deviceId);
  return normalized === 'default' ? '' : normalized;
}

export function canUseBrowserAudioOutputChooser() {
  return typeof navigator.mediaDevices?.selectAudioOutput === 'function';
}

export function canRequestAudioOutputDeviceListAccess() {
  return canUseBrowserAudioOutputChooser();
}

export async function listAudioOutputDevices(extraDevices = []) {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return uniqueAudioOutputs([DEFAULT_AUDIO_OUTPUT_DEVICE, ...extraDevices]);
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const outputs = devices
    .filter((device) => device.kind === 'audiooutput')
    .map((device, index) => toAudioOutputDevice(device, index));

  return uniqueAudioOutputs([DEFAULT_AUDIO_OUTPUT_DEVICE, ...outputs, ...extraDevices]);
}

export async function detectAudioOutputDevices(options = {}) {
  const requestAccess = Boolean(options?.requestAccess);
  let accessError = '';
  let selectedDevice = null;

  if (requestAccess && canUseBrowserAudioOutputChooser()) {
    try {
      selectedDevice = await openBrowserAudioOutputChooser();
    } catch (error) {
      accessError = error?.name === 'AbortError' || error?.name === 'NotAllowedError'
        ? 'Output chooser was cancelled.'
        : (error?.message || String(error || 'Unable to choose an audio output device.'));
    }
  }

  const devices = await listAudioOutputDevices(selectedDevice ? [selectedDevice] : [])
    .catch(() => uniqueAudioOutputs([DEFAULT_AUDIO_OUTPUT_DEVICE, selectedDevice].filter(Boolean)));

  return {
    ok: !accessError,
    method: 'enumerateDevices',
    permissionModel: canUseBrowserAudioOutputChooser() ? 'selectAudioOutput' : 'browser-default',
    chooserAvailable: canUseBrowserAudioOutputChooser(),
    accessError,
    selectedDevice,
    devices,
    nonDefaultCount: countNonDefaultAudioOutputs(devices)
  };
}

export async function openBrowserAudioOutputChooser() {
  if (!canUseBrowserAudioOutputChooser()) {
    throw new Error('Browser audio-output chooser is not available. Use System Default or update Chrome.');
  }
  const selected = await navigator.mediaDevices.selectAudioOutput();
  return toAudioOutputDevice(selected, 0);
}

export function watchAudioOutputDeviceChanges(callback) {
  if (typeof callback !== 'function' || !navigator.mediaDevices?.addEventListener) return () => {};
  const handler = () => callback();
  navigator.mediaDevices.addEventListener('devicechange', handler);
  return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
}

function toAudioOutputDevice(device, index = 0) {
  const deviceId = normalizeOutputDeviceId(device?.deviceId);
  const isDefault = deviceId === 'default' || deviceId === '';
  return {
    kind: 'audiooutput',
    deviceId: isDefault ? 'default' : deviceId,
    groupId: device?.groupId || '',
    label: cleanDeviceLabel(device?.label, index, deviceId),
    isDefault
  };
}

function uniqueAudioOutputs(devices = []) {
  const output = [];
  const seen = new Set();
  for (const device of [DEFAULT_AUDIO_OUTPUT_DEVICE, ...devices]) {
    const normalized = normalizeOutputDeviceId(device?.deviceId);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push({
      kind: 'audiooutput',
      deviceId: normalized,
      groupId: device?.groupId || '',
      label: normalized === 'default' ? 'System Default' : (device?.label || cleanDeviceLabel('', output.length, normalized)),
      isDefault: normalized === 'default'
    });
  }
  return output;
}

function countNonDefaultAudioOutputs(devices = []) {
  return devices.filter((device) => !device.isDefault && device.deviceId !== 'communications').length;
}

function cleanDeviceLabel(label, index, deviceId) {
  const text = String(label || '').trim();
  if (text) return text.replace(/\s+\(.*?\)$/g, (match) => match.length > 40 ? '' : match);
  if (deviceId === 'default' || deviceId === '') return 'System Default';
  if (deviceId === 'communications') return 'Communications';
  return index <= 0 ? 'Selected output device' : `Output Device ${index + 1}`;
}
