"use strict";

importScripts("logic.js");

const { cleanTitle, formatSeconds } = LectureAlarmLogic;
const DEFAULT_SETTINGS = Object.freeze({ enabled: true });
const NATIVE_HOST_NAME = "com.sgang.lecture_alarm";
const ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAAHYcAAB2HAY/l8WUAAADXSURBVFhH7Y9BDoMwDAT5QY/9AxL/P/KJ/gfEAakaYnsdklKqRppLiMfD8HiOy5UMvPg09wqYXrMMZy2kAMoz0EXCAAproFMOoOgMdIcBFLSAO8wADhLv8C3hrkMAB9TFPJy1IuSAmkNHGMCHvQLeI6QARVh67838A+QARUaUmUMAH5SEvLeoCvAiIhn5vYBdyjuLaPmGFNDq0Pu9AYxodazlYUAv3IBMhPeXFtxVDFAiePi9BHe4AdkIfiN0SwFKhAKdqYCzEXQRKWCHcg/OWqQCenB5wAq0419vPn1kcQAAAABJRU5ErkJggg==";

const tabStates = new Map();

function newState() {
  return {
    phase: "searching",
    statusText: "강의 플레이어 찾는 중",
    title: "온라인 강의",
    currentTime: 0,
    duration: 0,
    percent: 0,
    paused: true,
    playbackRate: 1,
    fingerprint: "",
    done: false,
    lastDoneAt: 0,
    updatedAt: Date.now()
  };
}

function completionAlarmName(tabId) {
  return `lecture-complete-${tabId}`;
}

async function syncCompletionAlarm(tabId, state) {
  const name = completionAlarmName(tabId);
  const currentTime = Number(state.currentTime) || 0;
  const duration = Number(state.duration) || 0;
  const remaining = duration - currentTime;
  const rate = Math.max(0.25, Number(state.playbackRate) || 1);

  if (state.done || currentTime < 1 || duration < 2 || remaining > 8 * 60 * 60) {
    await chrome.alarms.clear(name).catch(() => {});
    return;
  }

  if (state.paused && remaining > 3) {
    await chrome.alarms.clear(name).catch(() => {});
    return;
  }

  const delayMs = state.paused
    ? 1500
    : Math.max(1000, (Math.max(0, remaining) / rate) * 1000 + 1200);
  await chrome.alarms.create(name, { when: Date.now() + delayMs }).catch(() => {});
}

async function injectIntoOpenLmsTabs() {
  const tabs = await chrome.tabs.query({ url: ["https://lms.cu.ac.kr/*"] }).catch(() => []);
  for (const tab of tabs) {
    if (!Number.isInteger(tab.id)) {
      continue;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["logic.js", "content.js"]
    }).catch(() => {});
  }
}

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function getState(tabId) {
  if (tabStates.has(tabId)) {
    return tabStates.get(tabId);
  }

  const key = `lecture-state-${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const state = stored[key] || newState();
  tabStates.set(tabId, state);
  return state;
}

async function saveState(tabId, state) {
  state.updatedAt = Date.now();
  tabStates.set(tabId, state);
  await chrome.storage.session.set({ [`lecture-state-${tabId}`]: state });
}

function titleFrom(message, fallback) {
  const candidate = cleanTitle(message.lectureTitle || message.title || "");
  if (!candidate || /^(온라인\s*강의|iLOS|LMS)$/i.test(candidate)) {
    return fallback || "온라인 강의";
  }
  return candidate;
}

async function setBadge(tabId, state) {
  let text = "…";
  let color = "#64748b";

  if (state.phase === "done") {
    text = "끝";
    color = "#16a34a";
  } else if (state.phase === "playing" || state.phase === "paused") {
    text = state.duration > 0 ? `${Math.min(99, Math.max(0, Math.round(state.percent)))}%` : "ON";
    color = state.phase === "playing" ? "#0f766e" : "#ca8a04";
  }

  await Promise.all([
    chrome.action.setBadgeText({ tabId, text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color })
  ]).catch(() => {});
}

async function showCompletion(tabId, state, reason, isTest = false) {
  const settings = await getSettings();
  if (!isTest && !settings.enabled) {
    return { sent: false, permission: "disabled" };
  }

  const title = isTest ? "싸강 알림 테스트" : "싸강 시간이 다 됐어요!";
  const lectureTitle = state.title || "온라인 강의";
  const detail = isTest
    ? "알림이 정상 작동합니다. 이제 강의가 끝나면 이렇게 알려드릴게요."
    : `${lectureTitle}\n${reason || "강의 재생이 완료되었습니다."}`;
  const notificationId = `${isTest ? "test" : "done"}-lecture-${tabId}-${Date.now()}`;

  const permission = await chrome.notifications.getPermissionLevel().catch(() => "unknown");
  let sent = false;

  if (permission === "granted") {
    try {
      const createdId = await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: ICON_DATA_URL,
        title,
        message: detail,
        contextMessage: "대구가톨릭대학교 iLOS",
        priority: 2,
        requireInteraction: true,
        silent: true,
        buttons: [{ title: "강의 탭 보기" }]
      });
      sent = Boolean(createdId);
    } catch (_) {
      sent = false;
    }
  }

  return { sent, permission };
}

async function showWindowsDialog(state, reason, isTest = false) {
  const settings = await getSettings();
  if (!isTest && !settings.enabled) {
    return { sent: false, error: "disabled" };
  }

  const title = isTest ? "싸강 알림 테스트" : "싸강 시간이 다 됐어요!";
  const message = isTest
    ? "Windows 경고창이 정상 작동합니다."
    : `${state.title || "온라인 강의"}\n\n${reason || "강의 재생이 완료되었습니다."}`;
  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { title, message });
    return {
      sent: Boolean(response?.ok),
      error: response?.ok ? "" : String(response?.error || "Windows 경고창 실행 실패")
    };
  } catch (error) {
    return { sent: false, error: error?.message || String(error) };
  }
}

async function deliverAlert(tabId, state, reason, isTest = false) {
  const dialog = await showWindowsDialog(state, reason, isTest);
  const notification = dialog.sent
    ? { sent: false, permission: "not-needed" }
    : await showCompletion(tabId, state, reason, isTest);
  return { dialog, notification };
}

async function handlePageReady(tabId, message) {
  const state = newState();
  state.title = titleFrom(message, state.title);
  await saveState(tabId, state);
  await setBadge(tabId, state);
  return state;
}

async function handleMediaUpdate(tabId, message) {
  const state = await getState(tabId);
  const nextFingerprint = String(message.fingerprint || "");

  if (nextFingerprint && state.fingerprint && nextFingerprint !== state.fingerprint) {
    state.done = false;
  }

  state.fingerprint = nextFingerprint || state.fingerprint;
  state.title = titleFrom(message, state.title);
  state.currentTime = Math.max(0, Number(message.currentTime) || 0);
  state.duration = Math.max(0, Number(message.duration) || 0);
  state.playbackRate = Math.max(0.25, Number(message.playbackRate) || 1);
  state.percent = state.duration > 0
    ? Math.min(100, (state.currentTime / state.duration) * 100)
    : 0;
  state.paused = Boolean(message.paused);

  if (!state.done) {
    state.phase = state.paused ? "paused" : "playing";
    state.statusText = state.paused
      ? `일시정지 · ${formatSeconds(state.currentTime)} / ${formatSeconds(state.duration)}`
      : `재생 중 · ${formatSeconds(state.currentTime)} / ${formatSeconds(state.duration)}`;
  }

  await saveState(tabId, state);
  await setBadge(tabId, state);
  await syncCompletionAlarm(tabId, state);
  return state;
}

async function handleDone(tabId, message) {
  const state = await getState(tabId);
  if (state.done || (state.lastDoneAt && Date.now() - state.lastDoneAt < 10_000)) {
    return state;
  }

  state.done = true;
  state.lastDoneAt = Date.now();
  state.phase = "done";
  state.statusText = "강의 재생 완료";
  state.percent = 100;
  state.title = titleFrom(message, state.title);
  await chrome.alarms.clear(completionAlarmName(tabId)).catch(() => {});
  await saveState(tabId, state);
  await setBadge(tabId, state);
  const reason = String(message.reason || "");
  await deliverAlert(tabId, state, reason);
  return state;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set(settings);
  await injectIntoOpenLmsTabs();
});

chrome.runtime.onStartup.addListener(injectIntoOpenLmsTabs);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const tabId = Number.isInteger(message.tabId)
      ? message.tabId
      : sender.tab?.id;

    if (message.type === "GET_SETTINGS") {
      sendResponse({ ok: true, settings: await getSettings() });
      return;
    }

    if (message.type === "SET_SETTINGS") {
      const current = await getSettings();
      const next = {
        enabled: message.settings?.enabled ?? current.enabled
      };
      await chrome.storage.local.set(next);
      sendResponse({ ok: true, settings: next });
      return;
    }

    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: "강의 탭을 찾을 수 없습니다." });
      return;
    }

    if (message.type === "PAGE_READY" && message.topFrame) {
      sendResponse({ ok: true, state: await handlePageReady(tabId, message) });
      return;
    }

    if (message.type === "MEDIA_UPDATE") {
      sendResponse({ ok: true, state: await handleMediaUpdate(tabId, message) });
      return;
    }

    if (message.type === "LECTURE_DONE") {
      sendResponse({ ok: true, state: await handleDone(tabId, message) });
      return;
    }

    if (message.type === "GET_STATUS") {
      const state = await getState(tabId);
      const permission = await chrome.notifications.getPermissionLevel();
      sendResponse({ ok: true, state, permission });
      return;
    }

    if (message.type === "TEST_NOTIFICATION") {
      const state = await getState(tabId);
      const delivery = await deliverAlert(tabId, state, "", true);
      sendResponse({ ok: true, delivery });
      return;
    }

    sendResponse({ ok: false, error: "알 수 없는 요청입니다." });
  })().catch((error) => {
    sendResponse({ ok: false, error: error?.message || String(error) });
  });

  return true;
});

function focusNotificationTab(notificationId) {
  const match = notificationId.match(/-lecture-(\d+)-/);
  if (!match) {
    return;
  }

  const tabId = Number(match[1]);
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      return;
    }
    chrome.tabs.update(tabId, { active: true });
    if (Number.isInteger(tab.windowId)) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
  });
}

chrome.notifications.onClicked.addListener(focusNotificationTab);
chrome.notifications.onButtonClicked.addListener(focusNotificationTab);

chrome.alarms.onAlarm.addListener((alarm) => {
  const match = /^lecture-complete-(\d+)$/.exec(alarm.name);
  if (!match) {
    return;
  }

  const tabId = Number(match[1]);
  void (async () => {
    const state = await getState(tabId);
    if (state.done || state.currentTime < 1 || state.duration < 2) {
      return;
    }
    await handleDone(tabId, {
      lectureTitle: state.title,
      fingerprint: state.fingerprint,
      reason: "예상된 강의 재생 시간이 모두 지났습니다."
    });
  })();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = tabStates.get(tabId) || await getState(tabId);
  const remaining = (Number(state.duration) || 0) - (Number(state.currentTime) || 0);
  if (!state.done && state.currentTime >= 1 && state.duration >= 2 && remaining <= 5) {
    await handleDone(tabId, {
      lectureTitle: state.title,
      fingerprint: state.fingerprint,
      reason: "강의가 끝나며 재생 창이 닫혔습니다."
    });
  } else {
    await chrome.alarms.clear(completionAlarmName(tabId)).catch(() => {});
  }
  tabStates.delete(tabId);
  await chrome.storage.session.remove(`lecture-state-${tabId}`);
});

void injectIntoOpenLmsTabs();
