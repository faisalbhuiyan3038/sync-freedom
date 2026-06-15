/**
 * device.ts — Device identity generation and naming
 *
 * Each browser installation gets a stable UUID stored in chrome.storage.local.
 * Device name is auto-detected from userAgent / platform info.
 */

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  lastSeen: number;
}

const STORAGE_KEY = 'sf_device_info';

// ─── Device ID ────────────────────────────────────────────────────────

/**
 * Returns the persistent device ID, creating one if it doesn't exist.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]?.deviceId) {
    return stored[STORAGE_KEY].deviceId as string;
  }
  const id = generateUUID();
  const info = await buildDeviceInfo(id);
  await chrome.storage.local.set({ [STORAGE_KEY]: info });
  return id;
}

/**
 * Returns full DeviceInfo, creating it if it doesn't exist.
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]?.deviceId) {
    // Update lastSeen on every access
    const info = stored[STORAGE_KEY] as DeviceInfo;
    info.lastSeen = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: info });
    return info;
  }
  const id = generateUUID();
  const info = await buildDeviceInfo(id);
  await chrome.storage.local.set({ [STORAGE_KEY]: info });
  return info;
}

/**
 * Update the device name (user-editable in settings).
 */
export async function setDeviceName(name: string): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const info = (stored[STORAGE_KEY] as DeviceInfo) ?? (await getDeviceInfo());
  info.deviceName = name.trim() || info.deviceName;
  await chrome.storage.local.set({ [STORAGE_KEY]: info });
}

// ─── Name detection ───────────────────────────────────────────────────

async function buildDeviceInfo(deviceId: string): Promise<DeviceInfo> {
  return {
    deviceId,
    deviceName: await detectDeviceName(),
    lastSeen: Date.now(),
  };
}

async function detectDeviceName(): Promise<string> {
  const ua = navigator.userAgent;

  // OS detection
  let os = 'Unknown';
  if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  // Try chrome.runtime.getPlatformInfo for better accuracy
  try {
    const platform = await chrome.runtime.getPlatformInfo();
    if (platform.os === 'android') os = 'Android';
    else if (platform.os === 'win') os = 'Windows';
    else if (platform.os === 'mac') os = 'macOS';
    else if (platform.os === 'linux') os = 'Linux';
    else if (platform.os === 'cros') os = 'ChromeOS';
  } catch {
    // Ignore — use UA-based detection
  }

  // Browser detection
  let browser = 'Chrome';
  if (/Kiwi/i.test(ua)) browser = 'Kiwi';
  else if (/Quetta/i.test(ua)) browser = 'Quetta';
  else if (/Helium/i.test(ua)) browser = 'Helium';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua)) browser = 'Opera';
  else if (/Brave/i.test(ua)) browser = 'Brave';
  else if (/Vivaldi/i.test(ua)) browser = 'Vivaldi';

  return `${browser} (${os})`;
}

// ─── UUID generation ──────────────────────────────────────────────────

function generateUUID(): string {
  // Use crypto.randomUUID if available (Chrome 92+)
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: manual UUID v4
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
