// Keeping the session going, against a stand-in for Migu.
import assert from "node:assert/strict";
import { load } from "./harness.mjs";

const CHECK = "https://c.musicapp.migu.cn/mgateway/api/checkPacMtoken";

const ME = "https://app.c.nf.migu.cn/user/h5/user-info/v1.0";
const signInFirst = () => Response.json({ code: "290001", info: "请先登录" });
const profile = () => Response.json({ code: "000000", data: { userId: "1", nickName: "someone" } });
const MINUTE = 60 * 1000;

// A Migu that answers who one is to any token, and renews tokens unless told
// the check is down. A dead session is turned down by the check and by who
// one is; other asks answer what `other` says.
function migu({ checkDown = false, dead = false, other } = {}) {
  const seen = { checks: [], tokens: [] };
  const fetch = async (url, init = {}) => {
    const h = init.headers || {};
    if (String(url).startsWith(CHECK)) {
      seen.checks.push(h.pacmtoken);
      if (checkDown) return new Response("{}", { status: 502 });
      if (dead) return Response.json({ code: "850001", info: "未登录" });
      return Response.json({ code: "000000", info: "成功" }, { headers: { pacmtoken: `${h.pacmtoken}+` } });
    }
    seen.tokens.push(h.pacmtoken);
    if (String(url).startsWith(ME)) {
      if (dead) return signInFirst();
      return profile();
    }
    return other ? other() : Response.json({ code: "000000", data: {} });
  };
  return { fetch, seen };
}

const session = (more = []) => new Map([["token", "old"], ["account", { id: "1", name: "someone" }], ...more]);
const renewedNow = () => ["renewedAt", Date.now()];

const tests = {
  // Opening the app with a session not renewed lately swaps in the fresh token
  // Migu hands back, and uses it from then on.
  async "renews a stale session"() {
    const { fetch, seen } = migu();
    const { api, storage } = await load({ fetch, storage: new Map([["token", "old"]]) });
    assert.equal((await api.account()).id, "1");
    assert.deepEqual(seen.checks, ["old"]);
    assert.equal(storage.get("token"), "old+");
    assert.equal(seen.tokens.at(-1), "old+");
  },

  async "shares one renewal across concurrent calls"() {
    const { fetch, seen } = migu();
    const { api } = await load({ fetch, storage: new Map([["token", "old"]]) });
    await Promise.all([api.account(), api.account()]);
    await api.playlists().catch(() => {});
    assert.equal(seen.checks.length, 1);
  },

  // A check that fails leaves the session as it was, still signed in.
  async "keeps the session when the check fails"() {
    const { fetch, seen } = migu({ checkDown: true });
    const { api, storage } = await load({ fetch, storage: new Map([["token", "old"]]) });
    assert.equal((await api.account()).id, "1");
    assert.equal(storage.get("token"), "old");
    assert.equal(storage.get("renewedAt"), undefined);
    await api.account();
    assert.deepEqual(seen.checks, ["old"]);
  },

  // A session that ended at Migu is forgotten as soon as something answers
  // 请先登录: the account and its token went on before, and the app kept
  // showing someone signed in while nothing of theirs worked.
  async "forgets a session Migu ended"() {
    const { fetch } = migu({ dead: true, other: signInFirst });
    const { api, storage } = await load({ fetch, storage: session([renewedNow()]) });
    await assert.rejects(api.playlists(), { code: "signIn" });
    assert.equal(storage.get("token"), undefined);
    assert.equal(storage.get("account"), undefined);
  },

  // A renewal Migu turns down finds out the session is gone too, as pages
  // like the daily picks answer one that's gone all the same.
  async "forgets a session the renewal turns down"() {
    const { fetch } = migu({ dead: true });
    const { api, storage } = await load({ fetch, storage: session() });
    await api.home().catch(() => {});
    assert.equal(storage.get("token"), undefined);
  },

  async "recovers an API call with a rotated token"() {
    const { fetch, seen } = migu();
    const { api, storage } = await load({
      storage: session([renewedNow()]),
      fetch: (url, init) => {
        if (String(url).includes("/trust-uid/") && init.headers.pacmtoken === "old") return signInFirst();
        return fetch(url, init);
      },
    });
    assert.equal((await api.playlists()).length, 0);
    assert.deepEqual(seen.checks, ["old"]);
    assert.equal(storage.get("token"), "old+");
  },

  async "checks a rotated token when the retried request still asks for sign-in"() {
    const { fetch, seen } = migu({ other: signInFirst });
    const { api, storage } = await load({
      storage: session([renewedNow()]),
      fetch: (url, init) => String(url) === ME ? signInFirst() : fetch(url, init),
    });
    await assert.rejects(api.playlists(), { code: "signIn" });
    assert.deepEqual(seen.checks, ["old"]);
    assert.equal(storage.has("token"), false);
  },

  async "keeps a session Migu still knows and avoids a login prompt"() {
    const { fetch } = migu({ checkDown: true, other: signInFirst });
    const { api, storage } = await load({ fetch, storage: session([renewedNow()]) });
    await assert.rejects(api.playlists(), (e) => e.code !== "signIn" && /请重试/.test(e.message));
    assert.equal(storage.get("token"), "old");
  },

  async "keeps credentials for an ambiguous account or gateway error"() {
    const { api, storage } = await load({
      storage: session(),
      fetch: async (url) => String(url) === CHECK
        ? Response.json({ code: "850003", info: "内部错误" })
        : Response.json({ code: "290001", info: "登录服务器繁忙" }, { status: 502 }),
    });
    assert.equal((await api.account()).id, "1");
    assert.equal(storage.get("token"), "old");
  },

  async "renews without a user request and schedules an earlier retry on failure"() {
    const { fetch, seen } = migu({ checkDown: true });
    let next;
    const timers = {
      setTimeout: (run, delay) => { next = { run, delay }; return next; },
      clearTimeout: (timer) => { if (next === timer) next = null; },
    };
    const { api } = await load({ fetch, timers, storage: session() });
    assert.equal(next.delay, 0);
    next.run();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(seen.checks, ["old"]);
    assert.ok(next.delay > 4 * MINUTE && next.delay <= 5 * MINUTE);
    api.signOut();
    assert.equal(next, null);
  },

  async "schedules an earlier retry when an on-demand renewal fails"() {
    const { fetch } = migu({ checkDown: true, other: signInFirst });
    let nextDelay;
    const { api } = await load({
      fetch, storage: session([renewedNow()]),
      timers: { setTimeout: (_, delay) => { nextDelay = delay; }, clearTimeout: () => {} },
    });
    assert.ok(nextDelay > 29 * MINUTE && nextDelay <= 30 * MINUTE);
    await assert.rejects(api.playlists(), /请重试/);
    assert.ok(nextDelay > 4 * MINUTE && nextDelay <= 5 * MINUTE);
  },

  async "does not reuse an old renewal response after signing back into the same token"() {
    let finish;
    const storage = session();
    const { api } = await load({
      storage,
      settings: { signInMethod: "web" },
      platform: "darwin", arch: "arm64",
      spawn: () => ({
        readLine: async () => '{"kind":"session","token":"old"}',
        closeStdin: () => {},
        wait: async () => 0,
      }),
      fetch: (url) => String(url) === CHECK
        ? new Promise((resolve) => { finish = resolve; })
        : profile(),
    });
    const first = api.account();
    api.signOut();
    await api.signIn();
    finish(Response.json({ code: "000000" }, { headers: { pacmtoken: "late" } }));
    await first;
    assert.equal(storage.get("token"), "old");
  },

  async "does not replay writes after renewing"() {
    const { fetch, seen } = migu();
    let writes = 0;
    const { api, storage } = await load({
      storage: session([renewedNow()]),
      fetch: (url, init) => {
        if (String(url).includes("/del_collection.do")) {
          writes++;
          return signInFirst();
        }
        return fetch(url, init);
      },
    });
    await assert.rejects(api.savePlaylist({ id: "1", on: false }), /请重试/);
    assert.equal(writes, 1);
    assert.deepEqual(seen.checks, ["old"]);
    assert.equal(storage.get("token"), "old+");
  },

  async "can still play a free song when the saved session is expired"() {
    const storage = session([renewedNow(), ["song:1", { copyrightId: "2", lrcUrl: "" }]]);
    const { fetch } = migu({ dead: true });
    const { api } = await load({
      storage,
      fetch: (url, init) => {
        if (!String(url).includes("/listen/")) return fetch(url, init);
        if (init.headers.pacmtoken) {
          return Response.json({ code: "000000", data: { dialogInfo: { text: "请先登录" } } });
        }
        return Response.json({ code: "000000", data: { url: "https://music.migu.cn/free.mp3" } });
      },
    });
    assert.equal((await api.stream({ id: "1", quality: "standard" })).url, "https://music.migu.cn/free.mp3");
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
