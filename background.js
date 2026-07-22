"use strict";

/*
 * Primary proxy: ordinary HTTP proxy.
 * This can carry HTTP, HTTPS, WebSocket, and secure WebSocket traffic.
 */
const HTTP_PROXY = {
  host: "127.0.0.1",
  port: 1080
};

/*
 * Used when Chrome cannot connect to the HTTP proxy.
 */
const SOCKS5_PROXY = {
  host: "127.0.0.1",
  port: 1080
};

/*
 * Chrome tries entries from left to right:
 *
 *   1. HTTP proxy
 *   2. SOCKS5 proxy
 *
 * No DIRECT entry is included, so traffic fails closed when both are down.
 */
const PAC_SCRIPT = `
function FindProxyForURL(url, host) {
  // Similar to the previous "<local>" bypass.
  if (isPlainHostName(host)) {
    return "DIRECT";
  }

  return "PROXY ${HTTP_PROXY.host}:${HTTP_PROXY.port}; " +
         "SOCKS5 ${SOCKS5_PROXY.host}:${SOCKS5_PROXY.port}";
}
`;

const proxyConfig = {
  mode: "pac_script",
  pacScript: {
    data: PAC_SCRIPT,

    // Do not silently use a direct connection if the PAC script is invalid.
    mandatory: true
  }
};

function isOurProxyEnabled(details) {
  return details.value?.mode === "pac_script";
}

function updateIndicator(isEnabled) {
  chrome.action.setBadgeText({
    text: isEnabled ? "P" : "S"
  });

  chrome.action.setTitle({
    title: isEnabled
      ? "HTTP → SOCKS5 proxy enabled — click for System"
      : "System proxy enabled — click for proxy chain"
  });
}

function readState(callback) {
  chrome.proxy.settings.get(
    { incognito: false },
    (details) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return;
      }

      callback(isOurProxyEnabled(details));
    }
  );
}

function setProxyEnabled(enabled) {
  const value = enabled
    ? proxyConfig
    : { mode: "system" };

  chrome.proxy.settings.set(
    {
      value,
      scope: "regular"
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        return;
      }

      updateIndicator(enabled);
    }
  );
}

chrome.action.onClicked.addListener(() => {
  readState((isEnabled) => {
    setProxyEnabled(!isEnabled);
  });
});

function synchronizeIndicator() {
  readState(updateIndicator);
}

chrome.runtime.onInstalled.addListener(synchronizeIndicator);
chrome.runtime.onStartup.addListener(synchronizeIndicator);

// Keep the badge correct if another extension, policy, or Chrome setting
// changes the active proxy configuration.
chrome.proxy.settings.onChange.addListener((details) => {
  updateIndicator(isOurProxyEnabled(details));
});
