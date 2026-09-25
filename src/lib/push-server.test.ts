import assert from "node:assert/strict";
import test from "node:test";
import { validPushEndpoint } from "./push-server";

test("push delivery accepts browser services but rejects private hosts", () => {
  assert.equal(validPushEndpoint("https://web.push.apple.com/abc"), true);
  assert.equal(validPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(validPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(validPushEndpoint("https://127.0.0.1/push"), false);
  assert.equal(validPushEndpoint("http://web.push.apple.com/abc"), false);
  assert.equal(validPushEndpoint("https://web.push.apple.com.evil.example/abc"), false);
});
