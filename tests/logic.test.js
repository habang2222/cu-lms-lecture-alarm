"use strict";

const assert = require("node:assert/strict");
const {
  clockToSeconds,
  extractClocks,
  formatSeconds,
  hashText,
  cleanTitle,
  isProgressComplete,
  isCountdownComplete
} = require("../logic.js");

assert.equal(clockToSeconds("25:03"), 1503);
assert.equal(clockToSeconds("1:02:03"), 3723);
assert.equal(clockToSeconds("-00:01"), -1);
assert.equal(clockToSeconds("x"), null);

assert.deepEqual(extractClocks("재생 00:10 / 전체 25:00"), [10, 1500]);
assert.deepEqual(extractClocks("남은 시간 -00:03"), [-3]);
assert.deepEqual(extractClocks("시간 없음"), []);

assert.equal(formatSeconds(0), "0:00");
assert.equal(formatSeconds(1503), "25:03");
assert.equal(formatSeconds(3723), "1:02:03");
assert.equal(hashText("same"), hashText("same"));
assert.notEqual(hashText("same"), hashText("different"));
assert.equal(cleanTitle("  1주차 강의   - iLOS  "), "1주차 강의");

assert.equal(isProgressComplete({ current: 1499, total: 1500 }, 1500, 1500), true);
assert.equal(isProgressComplete({ current: 1500, total: 1500 }, 1500, 1500), false);
assert.equal(isProgressComplete(null, 1500, 1500), false);
assert.equal(isCountdownComplete({ seconds: 1, decreased: true, notified: false }, 0), true);
assert.equal(isCountdownComplete({ seconds: 0, decreased: false, notified: false }, 0), false);
assert.equal(isCountdownComplete({ seconds: 1, decreased: true, notified: true }, 0), false);

console.log("logic tests: all passed");
