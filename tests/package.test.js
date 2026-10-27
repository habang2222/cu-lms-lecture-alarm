"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "2.2.0");
assert.deepEqual(manifest.host_permissions, ["https://lms.cu.ac.kr/*"]);
assert.equal(manifest.permissions.includes("notifications"), true);
assert.equal(manifest.permissions.includes("nativeMessaging"), true);
assert.equal(manifest.permissions.includes("alarms"), true);
assert.equal(manifest.permissions.includes("scripting"), true);
assert.equal(manifest.permissions.includes("tts"), false);
assert.equal(manifest.content_scripts[0].all_frames, true);
assert.deepEqual(manifest.content_scripts[0].matches, ["https://lms.cu.ac.kr/*"]);

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...manifest.content_scripts.flatMap((entry) => entry.js)
];

for (const file of referencedFiles) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `missing: ${file}`);
}

const sourceFiles = ["background.js", "content.js", "popup.js", "logic.js"];
for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const urls = source.match(/https?:\/\/[^"'\s)]+/g) || [];
  for (const url of urls) {
    assert.equal(
      url.startsWith("https://lms.cu.ac.kr/"),
      true,
      `unexpected remote URL in ${file}: ${url}`
    );
  }
}

const backgroundSource = fs.readFileSync(path.join(root, "background.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "content.js"), "utf8");
assert.match(backgroundSource, /com\.sgang\.lecture_alarm/);
assert.match(backgroundSource, /sendNativeMessage/);
assert.match(backgroundSource, /chrome\.alarms\.create/);
assert.match(backgroundSource, /injectIntoOpenLmsTabs/);
assert.doesNotMatch(backgroundSource, /127\.0\.0\.1:17891/);
assert.doesNotMatch(contentSource, /강의 알림 켜짐/);
assert.match(contentSource, /pagehide/);

const publicKey = Buffer.from(manifest.key, "base64");
const extensionId = Array.from(crypto.createHash("sha256").update(publicKey).digest().subarray(0, 16))
  .map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15)))
  .join("");
assert.equal(extensionId, "jepclmecfaamkahjphldfbigcjmjdbbd");

const installerSource = fs.readFileSync(path.join(root, "네이티브경고창_설치.ps1"), "utf8");
assert.match(installerSource, new RegExp(extensionId));
assert.match(installerSource, /LOCALAPPDATA/);
assert.match(installerSource, /ConvertTo-Json/);

for (const file of [
  "manifest.json",
  "background.js",
  "content.js",
  "네이티브경고창_설치.ps1",
  path.join("native_host", "Program.cs")
]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  assert.doesNotMatch(source, /C:\\Users\\victo/i, `personal path leaked in ${file}`);
}

console.log("package tests: all passed");
