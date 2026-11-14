// Loads index.js the way MyGo Music does, with a stand-in for its host global,
// so the plugin can be tried from Node (22+) against the real Migu.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { SourceTextModule, createContext } from "node:vm";
import { createHash } from "node:crypto";

const dir = fileURLToPath(new URL("..", import.meta.url));

export async function load({
  storage = new Map(), fetch: fetchImpl = fetch, webSignIn, signInPrompt = () => {},
  settings = {}, language = "zh-CN", timers = { setTimeout, clearTimeout },
  platform = process.platform, arch = process.arch, spawn,
} = {}) {
  const locale = JSON.parse(await readFile(join(dir, "locales/zh-CN.json"), "utf8"));
  const host = {
    platform,
    arch,
    dir,
    dataDir: dir,
    storage: {
      get: (k) => (storage.has(k) ? structuredClone(storage.get(k)) : null),
      set: (k, v) => void storage.set(k, structuredClone(v)),
      remove: (k) => void storage.delete(k),
    },
    setting: (key) => settings[key] || "",
    t: (text) => (language === "zh-CN" ? locale[text] ?? text : text),
    language: () => language,
    crypto: { md5: (s) => createHash("md5").update(s).digest("hex") },
    openURL: (u) => console.log("openURL", u),
    signInPrompt,
    ...(spawn ? { spawn } : {}),
    ...(webSignIn ? { webSignIn } : {}),
  };
  const source = await readFile(join(dir, "index.js"), "utf8");
  const mod = new SourceTextModule(source, {
    identifier: "index.js",
    context: createContext({
      URL, URLSearchParams, TextEncoder, TextDecoder, fetch: fetchImpl, AbortController, AbortSignal,
      setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout, console, host, structuredClone,
    }),
  });
  await mod.link(() => {
    throw new Error("plugins import nothing");
  });
  await mod.evaluate();
  return { api: mod.namespace, storage, host };
}
