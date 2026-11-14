// The cipher Migu wraps where a song's audio is in: what encrypt makes,
// decrypt reads back, whatever random shift it picked, and anything without
// its header is left alone. Run with: node --experimental-vm-modules tests/crypto.mjs
import assert from "node:assert/strict";
import { load } from "./harness.mjs";

const { api } = await load({ fetch: () => assert.fail("no network here") });

const text = JSON.stringify({ code: "000000", data: { url: "https://freetyst.nf.migu.cn/a.mp3?x=周杰伦" } });
for (let i = 0; i < 50; i++) {
  const bytes = api.encrypt(text);
  assert.deepEqual([...bytes.slice(0, 3)], [171, 205, 1]);
  assert.equal(api.decrypt(bytes), text);
}
assert.equal(api.decrypt(new TextEncoder().encode('{"code":"000000"}')), null);
console.log("ok  crypto");
