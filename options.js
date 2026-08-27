"use strict";

const STATE_PRESENTATION = {
  proxy: {
    label: "Proxy active",
    description: "Chrome is using the configured HTTP proxy with SOCKS5 fallback."
  },
  system: {
    label: "System proxy",
    description: "Chrome is using the operating system’s proxy configuration."
  },
  other: {
    label: "Other mode",
    description: "Chrome is using another proxy mode. Clicking the toolbar icon will enable this proxy chain."
  },
  unavailable: {
    label: "Unavailable",
    description: "A policy or another extension currently controls Chrome’s proxy settings."
  }
};

const form = document.querySelector("#settingsForm");
const saveButton = document.querySelector("#saveButton");
const saveStatus = document.querySelector("#saveStatus");
const stateBadge = document.querySelector("#stateBadge");
const stateLabel = document.querySelector("#stateLabel");
const stateDescription = document.querySelector("#stateDescription");

const fields = {
  httpHost: document.querySelector("#httpHost"),
  httpPort: document.querySelector("#httpPort"),
  socks5Host: document.querySelector("#socks5Host"),
  socks5Port: document.querySelector("#socks5Port"),
  noProxy: document.querySelector("#noProxy")
};

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        const error = new Error(response?.error?.message ?? "The extension did not return a response.");
        error.field = response?.error?.field ?? null;
        reject(error);
        return;
      }

      resolve(response.snapshot);
    });
  });
}

function renderSettings(settings) {
  fields.httpHost.value = settings.http.host;
  fields.httpPort.value = String(settings.http.port);
  fields.socks5Host.value = settings.socks5.host;
  fields.socks5Port.value = String(settings.socks5.port);
  fields.noProxy.value = settings.bypass.join(",");
}

function renderState(state) {
  const presentation = STATE_PRESENTATION[state.kind] ?? {
    label: "Unknown",
    description: "Chrome’s current proxy state could not be identified."
  };

  stateBadge.className = `state-badge state-${state.kind}`;
  stateLabel.textContent = presentation.label;
  stateDescription.textContent = presentation.description;
}

function renderSnapshot(snapshot, includeSettings = true) {
  if (includeSettings) {
    renderSettings(snapshot.settings);
  }
  renderState(snapshot.state);
}

function renderStateError(error) {
  stateBadge.className = "state-badge state-error";
  stateLabel.textContent = "Error";
  stateDescription.textContent = error.message;
}

function clearFieldErrors() {
  for (const field of Object.values(fields)) {
    field.setCustomValidity("");
  }
}

function readSettings() {
  return {
    http: {
      host: fields.httpHost.value,
      port: fields.httpPort.value
    },
    socks5: {
      host: fields.socks5Host.value,
      port: fields.socks5Port.value
    },
    bypass: fields.noProxy.value
  };
}

async function refreshSnapshot(includeSettings = true) {
  try {
    const snapshot = await sendMessage({ type: "getSnapshot" });
    renderSnapshot(snapshot, includeSettings);
  } catch (error) {
    renderStateError(error);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearFieldErrors();
  saveStatus.className = "save-status";
  saveStatus.textContent = "";

  if (!form.reportValidity()) {
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving…";

  try {
    const snapshot = await sendMessage({
      type: "saveSettings",
      settings: readSettings()
    });
    renderSnapshot(snapshot);
    saveStatus.textContent = "Settings saved.";
  } catch (error) {
    saveStatus.className = "save-status error";
    saveStatus.textContent = error.message;

    if (error.field && fields[error.field]) {
      fields[error.field].setCustomValidity(error.message);
      fields[error.field].reportValidity();
      fields[error.field].focus();
    }
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save settings";
  }
});

for (const field of Object.values(fields)) {
  field.addEventListener("input", () => {
    field.setCustomValidity("");
    if (saveStatus.classList.contains("error")) {
      saveStatus.className = "save-status";
      saveStatus.textContent = "";
    }
  });
}

chrome.proxy.settings.onChange.addListener((details) => {
  if (details.incognitoSpecific !== true) {
    refreshSnapshot(false);
  }
});

refreshSnapshot();
