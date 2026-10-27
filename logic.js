(function (root) {
  "use strict";

  function clockToSeconds(value) {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    const negative = trimmed.startsWith("-");
    const parts = trimmed.replace(/^-/, "").split(":").map(Number);

    if (
      parts.length < 2 ||
      parts.length > 3 ||
      parts.some((part) => !Number.isFinite(part))
    ) {
      return null;
    }

    const seconds = parts.length === 3
      ? parts[0] * 3600 + parts[1] * 60 + parts[2]
      : parts[0] * 60 + parts[1];

    return negative ? -seconds : seconds;
  }

  function extractClocks(text) {
    if (typeof text !== "string") {
      return [];
    }

    const matches = text.match(/-?(?:\d{1,3}:)?\d{1,2}:\d{2}/g) || [];
    return matches
      .map(clockToSeconds)
      .filter((value) => value !== null);
  }

  function formatSeconds(value) {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function hashText(value) {
    const text = String(value || "");
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function cleanTitle(value) {
    const title = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[-|]\s*(iLOS|LMS).*$/i, "")
      .trim();
    return title.slice(0, 80);
  }

  function isProgressComplete(previous, current, total) {
    return Boolean(
      previous &&
      Number.isFinite(current) &&
      Number.isFinite(total) &&
      total >= 10 &&
      current >= total &&
      previous.current < previous.total
    );
  }

  function isCountdownComplete(previous, current) {
    return Boolean(
      previous &&
      !previous.notified &&
      (previous.decreased || current < previous.seconds) &&
      current === 0 &&
      previous.seconds > 0 &&
      previous.seconds <= 5
    );
  }

  const api = {
    clockToSeconds,
    extractClocks,
    formatSeconds,
    hashText,
    cleanTitle,
    isProgressComplete,
    isCountdownComplete
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.LectureAlarmLogic = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
