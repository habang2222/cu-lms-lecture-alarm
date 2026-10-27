(function () {
  "use strict";

  if (window.__lectureCompletionAlarmInstalled) {
    return;
  }
  window.__lectureCompletionAlarmInstalled = true;

  const {
    cleanTitle,
    extractClocks,
    hashText,
    isProgressComplete,
    isCountdownComplete
  } = LectureAlarmLogic;
  const attachedMedia = new WeakSet();
  const trackedMedia = new Set();
  const observedRoots = new WeakSet();
  const nearEndTimers = new WeakMap();
  const countdownStates = new WeakMap();
  const progressStates = new WeakMap();
  let lastUpdateAt = 0;

  function safeSend(message) {
    try {
      chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
    } catch (_) {
      // 페이지 이동 중 확장 프로그램 컨텍스트가 사라지는 경우는 무시합니다.
    }
  }

  function findLectureTitle() {
    const selectors = [
      "#lecture_title",
      "#online_title",
      ".lecture-title",
      ".content-title",
      ".title h1",
      ".title h2",
      "h1",
      "h2"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const value = cleanTitle(element?.textContent || "");
      if (value && value.length >= 2) {
        return value;
      }
    }

    return cleanTitle(document.title || "");
  }

  function announcePageReady() {
    if (window !== window.top) {
      return;
    }

    safeSend({
      type: "PAGE_READY",
      topFrame: true,
      title: cleanTitle(document.title),
      lectureTitle: findLectureTitle()
    });
  }

  function mediaFingerprint(media) {
    const source = media.currentSrc || media.src ||
      media.querySelector("source")?.src || "unknown-source";
    return hashText(`${location.pathname}|${source}|${media.id || "media"}`);
  }

  function mediaPayload(media) {
    return {
      type: "MEDIA_UPDATE",
      fingerprint: mediaFingerprint(media),
      currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      duration: Number.isFinite(media.duration) ? media.duration : 0,
      paused: media.paused,
      playbackRate: media.playbackRate,
      title: cleanTitle(document.title),
      lectureTitle: findLectureTitle()
    };
  }

  function reportMedia(media, force = false) {
    const now = Date.now();
    if (!force && now - lastUpdateAt < 1500) {
      return;
    }
    lastUpdateAt = now;
    safeSend(mediaPayload(media));
  }

  function reportDone(media, reason) {
    safeSend({
      type: "LECTURE_DONE",
      fingerprint: mediaFingerprint(media),
      reason,
      title: cleanTitle(document.title),
      lectureTitle: findLectureTitle()
    });
  }

  function checkNearEnd(media) {
    if (
      media.loop ||
      !Number.isFinite(media.duration) ||
      media.duration < 2 ||
      !Number.isFinite(media.currentTime)
    ) {
      return;
    }

    const remaining = media.duration - media.currentTime;
    if (remaining > 0.4 || media.currentTime < 1) {
      const existing = nearEndTimers.get(media);
      if (existing) {
        clearTimeout(existing);
        nearEndTimers.delete(media);
      }
      return;
    }

    if (nearEndTimers.has(media)) {
      return;
    }

    const timer = setTimeout(() => {
      nearEndTimers.delete(media);
      const stillAtEnd = media.ended ||
        (Number.isFinite(media.duration) && media.duration - media.currentTime <= 0.4);
      if (stillAtEnd) {
        reportDone(media, "영상 재생이 끝났습니다.");
      }
    }, 900);
    nearEndTimers.set(media, timer);
  }

  function attachMedia(media) {
    if (!(media instanceof HTMLMediaElement) || attachedMedia.has(media)) {
      return;
    }
    attachedMedia.add(media);
    trackedMedia.add(media);

    media.addEventListener("loadedmetadata", () => {
      reportMedia(media, true);
      checkNearEnd(media);
    });
    media.addEventListener("durationchange", () => {
      reportMedia(media, true);
      checkNearEnd(media);
    });
    media.addEventListener("play", () => reportMedia(media, true));
    media.addEventListener("pause", () => {
      reportMedia(media, true);
      checkNearEnd(media);
    });
    media.addEventListener("ratechange", () => reportMedia(media, true));
    media.addEventListener("timeupdate", () => {
      reportMedia(media);
      checkNearEnd(media);
    });
    media.addEventListener("ended", () => {
      reportMedia(media, true);
      reportDone(media, "영상 재생이 끝났습니다.");
    });

    if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
      reportMedia(media, true);
      checkNearEnd(media);
    }
  }

  function scanRoot(root) {
    if (!root || typeof root.querySelectorAll !== "function") {
      return;
    }

    root.querySelectorAll("video, audio").forEach(attachMedia);
    root.querySelectorAll("*").forEach((element) => {
      if (element.shadowRoot) {
        observeRoot(element.shadowRoot);
      }
    });
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) {
      return;
    }
    observedRoots.add(root);
    scanRoot(root);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLMediaElement) {
            attachMedia(node);
          } else if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            scanRoot(node);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  function isVisible(element) {
    if (!(element instanceof Element) || element.getClientRects().length === 0) {
      return false;
    }
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function clockCandidates() {
    const selector = [
      "[id*='remain' i]", "[class*='remain' i]",
      "[id*='left' i]", "[class*='left' i]",
      "[id*='count' i]", "[class*='count' i]",
      "[id*='time' i]", "[class*='time' i]",
      "[id*='study' i]", "[class*='study' i]",
      "[id*='learn' i]", "[class*='learn' i]",
      "[id*='progress' i]", "[class*='progress' i]"
    ].join(",");

    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function inspectClocks() {
    for (const element of clockCandidates()) {
      if (!isVisible(element)) {
        continue;
      }

      const text = String(element.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 100) {
        continue;
      }

      const clocks = extractClocks(text);
      const identity = `${element.id || ""} ${element.className || ""} ${text}`;

      if (clocks.length >= 2) {
        const current = Math.abs(clocks[clocks.length - 2]);
        const total = Math.abs(clocks[clocks.length - 1]);
        const previous = progressStates.get(element);

        if (isProgressComplete(previous, current, total)) {
          safeSend({
            type: "LECTURE_DONE",
            fingerprint: hashText(`${location.pathname}|${identity}`),
            reason: "강의 시간이 모두 재생되었습니다.",
            title: cleanTitle(document.title),
            lectureTitle: findLectureTitle()
          });
        }
        progressStates.set(element, { current, total });
        continue;
      }

      if (clocks.length !== 1 || !/(remain|left|count|남은|잔여)/i.test(identity)) {
        continue;
      }

      const seconds = Math.abs(clocks[0]);
      const previous = countdownStates.get(element) || {
        seconds,
        decreased: false,
        notified: false
      };
      const decreased = previous.decreased || seconds < previous.seconds;

      if (isCountdownComplete(previous, seconds)) {
        safeSend({
          type: "LECTURE_DONE",
          fingerprint: hashText(`${location.pathname}|${identity}`),
          reason: "남은 학습시간이 0초가 되었습니다.",
          title: cleanTitle(document.title),
          lectureTitle: findLectureTitle()
        });
        previous.notified = true;
      }

      previous.seconds = seconds;
      previous.decreased = decreased;
      countdownStates.set(element, previous);
    }
  }

  function start() {
    announcePageReady();
    observeRoot(document);
    inspectClocks();
    setInterval(() => {
      inspectClocks();
      for (const media of trackedMedia) {
        if (!media.isConnected) {
          trackedMedia.delete(media);
          continue;
        }
        reportMedia(media);
        checkNearEnd(media);
      }
    }, 1000);
  }

  window.addEventListener("pagehide", () => {
    for (const media of trackedMedia) {
      if (
        Number.isFinite(media.duration) &&
        media.duration >= 2 &&
        Number.isFinite(media.currentTime) &&
        media.currentTime >= 1 &&
        media.duration - media.currentTime <= 3
      ) {
        reportDone(media, "강의가 끝나며 재생 화면이 닫혔습니다.");
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
