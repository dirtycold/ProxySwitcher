"use strict";

// Change these three values.
const PREDEFINED_PROXY = {
  scheme: "http",       // http, https, socks4, or socks5
  host: "127.0.0.1",
  port: 1080
};

const fixedConfig = {
  mode: "fixed_servers",
  rules: {
    singleProxy: PREDEFINED_PROXY,
    bypassList: ["<local>"]
  }
};

function updateIndicator(isProxyEnabled) {
  chrome.action.setBadgeText({
    text: isProxyEnabled ? "P" : "S"
  });

  chrome.action.setTitle({
    title: isProxyEnabled
      ? "Predefined proxy enabled — click for System"
      : "System proxy enabled — click for Proxy"
  });
}

function readState(callback) {
  chrome.proxy.settings.get(
    { incognito: false },
    (details) => {
      const isProxyEnabled = details.value?.mode === "fixed_servers";
      callback(isProxyEnabled);
    }
  );
}

chrome.action.onClicked.addListener(() => {
  readState((isProxyEnabled) => {
    const value = isProxyEnabled
      ? { mode: "system" }
      : fixedConfig;

    chrome.proxy.settings.set(
      { value, scope: "regular" },
      () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          return;
        }

        updateIndicator(!isProxyEnabled);
      }
    );
  });
});

function synchronizeIndicator() {
  readState(updateIndicator);
}

chrome.runtime.onInstalled.addListener(synchronizeIndicator);
chrome.runtime.onStartup.addListener(synchronizeIndicator);
