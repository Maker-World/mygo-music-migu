// Signing in, by QR code and on the website, against a stand-in for Migu.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load } from "./harness.mjs";

// A QR code as Migu sends it: a JPEG in a data: address.
const PICTURE = readFileSync(new URL("./fixtures/qr.txt", import.meta.url), "utf8");
const PASSPORT = "https://passport.migu.cn/api/qrcWeb/";
const TRADE = "https://c.musicapp.migu.cn/user/h5/token-validate/v3.0";
const timers = { setTimeout: (fn, delay) => setTimeout(fn, delay === 1500 ? 0 : delay), clearTimeout };

function migu({ expired = false } = {}) {
  const seen = { traded: null, asked: 0, profile: null, created: null };
  const fetch = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith("https://passport.migu.cn/login")) {
      assert.equal(new URL(url).searchParams.get("sourceid"), "204040");
      return new Response("", { headers: { "set-cookie": "mgnd_session_id=passport-session; Path=/; Secure" } });
    }
    if (url.startsWith(`${PASSPORT}qrcLogin`)) {
      seen.created = { url: new URL(url), init };
      return Response.json({ status: "2000", result: { qrcUrl: PICTURE, qrc_sessionid: "s1" } });
    }
    if (url.startsWith(`${PASSPORT}qrcquery`)) {
      seen.asked++;
      assert.equal(new URL(url).searchParams.get("qrc_sessionid"), "s1");
      if (expired) return Response.json({ status: "4072" });
      if (seen.asked === 1) return Response.json({ status: 4074 });
      if (seen.asked === 2) return Response.json({ status: "4073" });
      return Response.json({ status: 2000, result: { token: "pass-token", redirectURL: "https://music.migu.cn/v3/user/login" } });
    }
    if (url.startsWith(TRADE)) {
      seen.traded = new URL(url).searchParams;
      return Response.json({ code: "000000" }, { headers: { "set-cookie": "pacmtoken=session; Domain=migu.cn; Path=/" } });
    }
    if (url.includes("/user/h5/user-info/")) {
      seen.profile = init.headers;
      return Response.json({ code: "000000", data: { userId: "1", nickName: "someone" } });
    }
    assert.fail(`Unexpected request ${url}`);
  };
  return { fetch, seen };
}

const tests = {
  async "signs in by QR code by default"() {
    const { fetch, seen } = migu();
    const prompts = [];
    const { api, storage } = await load({
      fetch, timers, signInPrompt: (p) => prompts.push(p),
    });
    const me = await api.signIn();
    assert.equal(me.id, "1");
    assert.match(prompts[0].qr, /^https:\/\/passport\.migu\.cn\/qrc\//);
    assert.match(prompts[0].text, /咪咕音乐/);
    assert.ok(prompts.some((p) => p.text.includes("确认")));
    assert.equal(seen.traded.get("token"), "pass-token");
    assert.equal(seen.created.url.searchParams.get("sourceid"), "204040");
    assert.equal(seen.created.init.headers.Cookie, "mgnd_session_id=passport-session");
    assert.equal(seen.traded.get("sourceId"), "220029");
    assert.equal(storage.get("token"), "session");
    assert.equal(seen.profile.pacmtoken, "session");
  },

  async "reports a QR code expired by Migu"() {
    const { fetch, seen } = migu({ expired: true });
    const { api, storage } = await load({ fetch, timers });
    await assert.rejects(api.signIn(), /二维码已过期/);
    assert.equal(seen.traded, null);
    assert.equal(storage.has("token"), false);
  },

  async "opens the website when selected"() {
    const { fetch, seen } = migu();
    let opened = null;
    const webSignIn = async (o) => ((opened = o), { cookie: "pacmtoken=web%2Btoken; other=1" });
    const { api, storage } = await load({ fetch, webSignIn, settings: { signInMethod: "web" } });
    assert.equal((await api.signIn()).id, "1");
    assert.equal(opened.url, "https://music.migu.cn/v5/");
    assert.equal(opened.cookiesOf, opened.url);
    assert.equal(seen.created, null);
    assert.equal(seen.profile.pacmtoken, "web+token");
    assert.equal(storage.get("token"), "web+token");
  },

  async "keeps the previous session when a candidate fails validation"() {
    const account = { id: "old-user", name: "old" };
    const storage = new Map([["token", "old"], ["account", account], ["renewedAt", Date.now()]]);
    const { api } = await load({
      storage,
      settings: { signInMethod: "web" },
      webSignIn: async () => ({ cookie: "pacmtoken=candidate" }),
      fetch: async (_, init) => {
        assert.equal(init.headers.pacmtoken, "candidate");
        assert.equal(init.headers.uid, undefined);
        assert.equal(storage.get("token"), "old");
        return Response.json({ code: "290001" });
      },
    });
    await assert.rejects(api.signIn(), /无法验证/);
    assert.equal(storage.get("token"), "old");
    assert.deepEqual(storage.get("account"), account);
  },

  async "discards a QR exchange that finishes after a replacement sign-in"() {
    const { fetch, seen } = migu();
    let finishTrade;
    let reachedTrade;
    const trading = new Promise((resolve) => { reachedTrade = resolve; });
    const settings = { signInMethod: "" };
    const { api, storage } = await load({
      settings, timers,
      webSignIn: async () => ({ cookie: "pacmtoken=web" }),
      fetch: (url, init) => String(url).startsWith(TRADE)
        ? new Promise((resolve) => { finishTrade = resolve; reachedTrade(); })
        : fetch(url, init),
    });
    const first = api.signIn();
    await trading;
    settings.signInMethod = "web";
    await api.signIn();
    finishTrade(Response.json({ code: "000000", data: { pacToken: "late" } }));
    await assert.rejects(first, /已取消/);
    assert.equal(seen.profile.pacmtoken, "web");
    assert.equal(storage.get("token"), "web");
  },

  async "discards a website login that completes after sign-out"() {
    let finish;
    const { api, storage } = await load({
      settings: { signInMethod: "web" },
      webSignIn: () => new Promise((resolve) => { finish = resolve; }),
      fetch: async () => assert.fail("A canceled login should not be validated"),
    });
    const first = api.signIn();
    api.signOut();
    finish({ cookie: "pacmtoken=late" });
    await assert.rejects(first, /已取消/);
    assert.equal(storage.has("token"), false);
  },
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${e.stack}`);
  }
}
process.exit(failed ? 1 : 0);
