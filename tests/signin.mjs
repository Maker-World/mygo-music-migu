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

  async "reports missing or denied helper without opening the old website"() {
    let opened = false;
    let executable;
    const { api, storage } = await load({
      fetch: async () => assert.fail("An unavailable helper should not start a login request"),
      webSignIn: async () => { opened = true; },
      settings: { signInMethod: "web" }, platform: "windows", arch: "amd64",
      spawn: (command) => { executable = command; throw new Error("Permission denied"); },
    });
    await assert.rejects(api.signIn(), /无法启动网页登录助手.*插件 ZIP.*允许程序/);
    assert.equal(executable, "bin/migu-web-login-windows-amd64.exe");
    assert.equal(opened, false);
    assert.equal(storage.has("token"), false);
  },

  async "reports helper setup failures without opening the old website"() {
    let opened = false;
    const { api } = await load({
      fetch: async () => assert.fail("A setup failure should not start a login request"),
      webSignIn: async () => { opened = true; },
      settings: { signInMethod: "web" }, platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: async () => '{"error":"setup"}',
        closeStdin: () => {},
        wait: async () => 0,
      }),
    });
    await assert.rejects(api.signIn(), /检查系统网页组件/);
    assert.equal(opened, false);
  },

  async "exchanges a Passport callback from the helper and verifies the music account"() {
    const { fetch, seen } = migu();
    let closed = false;
    const { api, storage } = await load({
      fetch, settings: { signInMethod: "web" }, platform: "darwin", arch: "arm64",
      spawn: (command) => {
        assert.equal(command, "bin/migu-web-login-darwin-arm64");
        return {
          readLine: async () => '{"kind":"passport","token":"callback+token"}',
          closeStdin: () => { closed = true; },
          wait: async () => 0,
        };
      },
    });
    assert.equal((await api.signIn()).id, "1");
    assert.equal(closed, true);
    assert.equal(seen.traded.get("token"), "callback+token");
    assert.equal(seen.profile.pacmtoken, "session");
    assert.equal(storage.get("token"), "session");
  },

  async "uses a session token from the helper directly"() {
    const { fetch, seen } = migu();
    const { api, storage } = await load({
      fetch, settings: { signInMethod: "web" }, platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: async () => '{"kind":"session","token":"from-cookie"}',
        closeStdin: () => {},
        wait: async () => 0,
      }),
    });
    await api.signIn();
    assert.equal(seen.traded, null);
    assert.equal(seen.profile.pacmtoken, "from-cookie");
    assert.equal(storage.get("token"), "from-cookie");
  },

  async "checks a session token returned in a generic callback field"() {
    const { fetch, seen } = migu();
    const { api, storage } = await load({
      settings: { signInMethod: "web" }, platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: async () => '{"kind":"passport","token":"already-a-session"}',
        closeStdin: () => {},
        wait: async () => 0,
      }),
      fetch: (url, init) => url.startsWith(TRADE)
        ? Response.json({ code: "850003" })
        : fetch(url, init),
    });
    await api.signIn();
    assert.equal(seen.profile.pacmtoken, "already-a-session");
    assert.equal(storage.get("token"), "already-a-session");
  },

  async "closes a pending helper on sign-out and discards its result"() {
    let finish;
    let closed = false;
    const { api, storage } = await load({
      settings: { signInMethod: "web" }, platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: () => new Promise((resolve) => { finish = resolve; }),
        closeStdin: () => { closed = true; finish('{"kind":"session","token":"late"}'); },
        wait: async () => 0,
      }),
      fetch: async () => assert.fail("A canceled login should not be validated"),
    });
    const first = api.signIn();
    api.signOut();
    await assert.rejects(first, /已取消/);
    assert.equal(closed, true);
    assert.equal(storage.has("token"), false);
  },

  async "keeps the previous session when a candidate fails validation"() {
    const account = { id: "old-user", name: "old" };
    const storage = new Map([["token", "old"], ["account", account], ["renewedAt", Date.now()]]);
    const { api } = await load({
      storage,
      settings: { signInMethod: "web" },
      platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: async () => '{"kind":"session","token":"candidate"}',
        closeStdin: () => {},
        wait: async () => 0,
      }),
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
      platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: async () => '{"kind":"session","token":"web"}',
        closeStdin: () => {},
        wait: async () => 0,
      }),
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
