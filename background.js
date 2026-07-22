"use strict";

const STORAGE_KEY = "proxySettings";
const PAC_MARKER = "// Proxy Switcher managed PAC";

const DEFAULT_SETTINGS = {
  http: {
    host: "127.0.0.1",
    port: 1080
  },
  socks5: {
    host: "127.0.0.1",
    port: 1080
  }
};

const INDICATORS = {
  proxy: {
    badge: "P",
    color: "#188038",
    title: "Proxy chain enabled — click for System"
  },
  system: {
    badge: "S",
    color: "#5f6368",
    title: "System proxy enabled — click for proxy chain"
  },
  other: {
    badge: "?",
    color: "#b06000",
    title: "Another Chrome proxy mode is active — click for proxy chain"
  },
  unavailable: {
    badge: "!",
    color: "#b3261e",
    title: "Proxy settings are controlled elsewhere — open Options for details"
  },
  error: {
    badge: "!",
    color: "#b3261e",
    title: "Proxy switch failed — open Options for details"
  }
};

class SettingsError extends Error {
  constructor(field, message) {
    super(message);
    this.name = "SettingsError";
    this.field = field;
  }
}

function cloneDefaultSettings() {
  return {
    http: { ...DEFAULT_SETTINGS.http },
    socks5: { ...DEFAULT_SETTINGS.socks5 }
  };
}

function normalizeHost(value, field) {
  if (typeof value !== "string") {
    throw new SettingsError(field, "Enter a proxy host.");
  }

  let host = value.trim();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  } else if (host.includes("[") || host.includes("]")) {
    throw new SettingsError(field, "Enter a valid hostname or IP address.");
  }

  if (!host) {
    throw new SettingsError(field, "Enter a proxy host.");
  }

  if (host.includes("://") || host.includes("/") || host.includes("@")) {
    throw new SettingsError(field, "Enter a hostname or IP address without a scheme, path, or credentials.");
  }

  if (host.includes(":")) {
    if (!/^[0-9a-f.:]+$/i.test(host)) {
      throw new SettingsError(field, "Enter a valid IPv6 address.");
    }

    try {
      new URL(`http://[${host}]/`);
    } catch {
      throw new SettingsError(field, "Enter a valid IPv6 address.");
    }

    return host.toLowerCase();
  }

  if (host.length > 253 || !/^[a-z0-9.-]+$/i.test(host)) {
    throw new SettingsError(field, "Enter an ASCII hostname or IP address without a scheme.");
  }

  const labels = host.split(".");
  const hasInvalidLabel = labels.some((label) => (
    !label ||
    label.length > 63 ||
    label.startsWith("-") ||
    label.endsWith("-")
  ));

  if (hasInvalidLabel) {
    throw new SettingsError(field, "Enter a valid hostname or IP address.");
  }

  return host.toLowerCase();
}

function normalizePort(value, field) {
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
    throw new SettingsError(field, "Enter a port from 1 to 65535.");
  }

  const port = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SettingsError(field, "Enter a port from 1 to 65535.");
  }

  return port;
}

function validateSettings(value) {
  const candidate = value && typeof value === "object" ? value : {};
  const http = candidate.http && typeof candidate.http === "object"
    ? candidate.http
    : {};
  const socks5 = candidate.socks5 && typeof candidate.socks5 === "object"
    ? candidate.socks5
    : {};

  return {
    http: {
      host: normalizeHost(http.host, "httpHost"),
      port: normalizePort(http.port, "httpPort")
    },
    socks5: {
      host: normalizeHost(socks5.host, "socks5Host"),
      port: normalizePort(socks5.port, "socks5Port")
    }
  };
}

function mergeWithDefaults(value) {
  const candidate = value && typeof value === "object" ? value : {};

  return {
    http: {
      ...DEFAULT_SETTINGS.http,
      ...(candidate.http && typeof candidate.http === "object" ? candidate.http : {})
    },
    socks5: {
      ...DEFAULT_SETTINGS.socks5,
      ...(candidate.socks5 && typeof candidate.socks5 === "object" ? candidate.socks5 : {})
    }
  };
}

function formatPacHost(host) {
  return host.includes(":") ? `[${host}]` : host;
}

function buildProxyConfig(settings) {
  const httpEndpoint = `${formatPacHost(settings.http.host)}:${settings.http.port}`;
  const socks5Endpoint = `${formatPacHost(settings.socks5.host)}:${settings.socks5.port}`;
  const proxyChain = `PROXY ${httpEndpoint}; SOCKS5 ${socks5Endpoint}`;
  const pacScript = `${PAC_MARKER}
function FindProxyForURL(url, host) {
  if (isPlainHostName(host)) {
    return "DIRECT";
  }

  return ${JSON.stringify(proxyChain)};
}`;

  return {
    mode: "pac_script",
    pacScript: {
      data: pacScript,
      mandatory: true
    }
  };
}

function getStoredSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      try {
        const value = result[STORAGE_KEY] === undefined
          ? cloneDefaultSettings()
          : mergeWithDefaults(result[STORAGE_KEY]);
        resolve(validateSettings(value));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function storeSettings(settings) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: settings }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function getProxyDetails() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({ incognito: false }, (details) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(details);
    });
  });
}

function setProxyValue(value) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value, scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function classifyProxyState(details) {
  const levelOfControl = details.levelOfControl;
  if (
    levelOfControl === "not_controllable" ||
    levelOfControl === "controlled_by_other_extensions"
  ) {
    return {
      kind: "unavailable",
      levelOfControl,
      mode: details.value?.mode ?? "unknown"
    };
  }

  if (
    levelOfControl === "controlled_by_this_extension" &&
    details.value?.mode === "pac_script"
  ) {
    return {
      kind: "proxy",
      levelOfControl,
      mode: "pac_script"
    };
  }

  if (details.value?.mode === "system") {
    return {
      kind: "system",
      levelOfControl,
      mode: "system"
    };
  }

  return {
    kind: "other",
    levelOfControl,
    mode: details.value?.mode ?? "unknown"
  };
}

function updateIndicator(state) {
  const indicator = INDICATORS[state.kind] ?? INDICATORS.error;
  chrome.action.setBadgeText({ text: indicator.badge });
  chrome.action.setBadgeBackgroundColor({ color: indicator.color });
  chrome.action.setTitle({ title: indicator.title });
}

async function getSnapshot() {
  const [settings, details] = await Promise.all([
    getStoredSettings(),
    getProxyDetails()
  ]);

  return {
    settings,
    state: classifyProxyState(details)
  };
}

async function synchronizeIndicator(details) {
  const currentDetails = details ?? await getProxyDetails();
  updateIndicator(classifyProxyState(currentDetails));
}

async function toggleProxy() {
  const details = await getProxyDetails();
  const state = classifyProxyState(details);

  if (state.kind === "unavailable") {
    throw new Error("Chrome proxy settings are controlled by policy or another extension.");
  }

  if (state.kind === "proxy") {
    await setProxyValue({ mode: "system" });
  } else {
    const settings = await getStoredSettings();
    await setProxyValue(buildProxyConfig(settings));
  }

  await synchronizeIndicator();
}

async function saveSettings(value) {
  const settings = validateSettings(value);
  const beforeSave = classifyProxyState(await getProxyDetails());

  await storeSettings(settings);

  if (beforeSave.kind === "proxy") {
    try {
      await setProxyValue(buildProxyConfig(settings));
    } catch (error) {
      throw new Error(`Settings were saved, but the active proxy could not be updated: ${error.message}`);
    }
  }

  const details = await getProxyDetails();
  const state = classifyProxyState(details);
  updateIndicator(state);

  return { settings, state };
}

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    field: error instanceof SettingsError ? error.field : null
  };
}

function runAndReport(operation) {
  operation().catch((error) => {
    console.error(error);
    updateIndicator({ kind: "error" });
  });
}

let toggleQueue = Promise.resolve();

chrome.action.onClicked.addListener(() => {
  toggleQueue = toggleQueue
    .then(toggleProxy)
    .catch((error) => {
      console.error(error);
      updateIndicator({ kind: "error" });
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getSnapshot") {
    getSnapshot()
      .then((snapshot) => sendResponse({ ok: true, snapshot }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }

  if (message?.type === "saveSettings") {
    saveSettings(message.settings)
      .then((snapshot) => sendResponse({ ok: true, snapshot }))
      .catch((error) => sendResponse({ ok: false, error: serializeError(error) }));
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  runAndReport(synchronizeIndicator);
});

chrome.runtime.onStartup.addListener(() => {
  runAndReport(synchronizeIndicator);
});

chrome.proxy.settings.onChange.addListener((details) => {
  if (details.incognitoSpecific === true) {
    return;
  }

  runAndReport(() => synchronizeIndicator(details));
});

runAndReport(synchronizeIndicator);
