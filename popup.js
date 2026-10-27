"use strict";

const { formatSeconds } = LectureAlarmLogic;

const elements = {
  statusDot: document.querySelector("#status-dot"),
  statusText: document.querySelector("#status-text"),
  lectureTitle: document.querySelector("#lecture-title"),
  progressBar: document.querySelector("#progress-bar"),
  timeText: document.querySelector("#time-text"),
  percentText: document.querySelector("#percent-text"),
  enabledToggle: document.querySelector("#enabled-toggle"),
  testButton: document.querySelector("#test-button"),
  hint: document.querySelector("#hint")
};

let activeTabId = null;

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false });
    });
  });
}

function renderState(state, permission) {
  const percent = Math.min(100, Math.max(0, Number(state.percent) || 0));
  elements.statusDot.className = `dot ${state.phase || "searching"}`;
  elements.statusText.textContent = state.statusText || "강의 플레이어 찾는 중";
  elements.lectureTitle.textContent = state.title || "온라인 강의";
  elements.progressBar.style.width = `${percent}%`;
  elements.timeText.textContent = `${formatSeconds(state.currentTime)} / ${formatSeconds(state.duration)}`;
  elements.percentText.textContent = `${Math.round(percent)}%`;

  if (permission === "denied") {
    elements.hint.textContent = "Chrome 알림 권한이 꺼져 있습니다. Windows 알림 설정을 확인해 주세요.";
  }
}

async function refreshStatus() {
  if (!Number.isInteger(activeTabId)) {
    return;
  }
  const response = await sendMessage({ type: "GET_STATUS", tabId: activeTabId });
  if (response.ok) {
    renderState(response.state, response.permission);
  }
}

async function saveSettings() {
  await sendMessage({
    type: "SET_SETTINGS",
    settings: {
      enabled: elements.enabledToggle.checked
    }
  });
}

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;

  const settingsResponse = await sendMessage({ type: "GET_SETTINGS" });
  if (settingsResponse.ok) {
    elements.enabledToggle.checked = settingsResponse.settings.enabled;
  }

  if (!tab?.url?.startsWith("https://lms.cu.ac.kr/")) {
    elements.statusText.textContent = "싸강 탭에서 열어 주세요";
    elements.lectureTitle.textContent = "lms.cu.ac.kr 강의 화면이 아닙니다";
    elements.hint.textContent = "강의 화면으로 이동한 뒤 이 아이콘을 다시 눌러 주세요.";
    return;
  }

  await refreshStatus();
  setInterval(refreshStatus, 1000);
}

elements.enabledToggle.addEventListener("change", saveSettings);
elements.testButton.addEventListener("click", async () => {
  if (!Number.isInteger(activeTabId)) {
    return;
  }
  elements.testButton.disabled = true;
  elements.testButton.textContent = "알림 전송 중…";
  const response = await sendMessage({ type: "TEST_NOTIFICATION", tabId: activeTabId });
  elements.testButton.textContent = response.ok ? "테스트 알림을 보냈습니다" : "알림 전송 실패";
  setTimeout(() => {
    elements.testButton.disabled = false;
    elements.testButton.textContent = "알림 테스트";
  }, 1800);
});

initialize();
