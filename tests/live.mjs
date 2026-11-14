// Tries what works signed out against the real Migu, and says what came back.
// Run with: node --experimental-vm-modules tests/live.mjs
import assert from "node:assert/strict";
import { load } from "./harness.mjs";

const { api } = await load();
const ok = (name, detail) => console.log(`ok  ${name}${detail ? `: ${detail}` : ""}`);

const found = await api.search({ query: "海阔天空", kind: "tracks", offset: 0 });
assert.ok(found.tracks.length > 0, "search finds songs");
ok("search tracks", `${found.tracks.length}, first ${found.tracks[0].name} - ${found.tracks[0].artists.map((a) => a.name)}`);

for (const kind of ["albums", "artists", "playlists"]) {
  const r = await api.search({ query: "周杰伦", kind, offset: 0 });
  assert.ok(r[kind].length > 0, `search finds ${kind}`);
  ok(`search ${kind}`, `${r[kind].length}, first ${r[kind][0].name} (${r[kind][0].id})`);
}
ok("suggest", (await api.suggest({ query: "周杰" })).slice(0, 3).join(" / "));

// A song anyone can play, at the quality anyone gets.
const free = found.tracks.find((t) => t.id === "600907000000773931") || found.tracks[2];
const s = await api.stream({ id: free.id, quality: "standard" });
assert.match(s.url, /^https:\/\//);
const head = await fetch(s.url, { headers: { range: "bytes=0-15" } });
assert.equal(head.status, 206);
ok("stream", `${s.type} ${s.quality} ${head.headers.get("content-type")}`);

const lyr = await api.lyrics({ id: free.id });
assert.match(lyr.lrc, /\[\d\d:\d\d/);
ok("lyrics", lyr.lrc.split("\n")[0]);

const home = await api.home();
assert.ok(home.sections.length > 0);
ok("home", home.sections.map((s) => `${s.title}(${(s.tracks || s.playlists || s.links || []).length})`).join(", "));

const charts = await api.browse({ page: "charts" });
const firstRank = charts.sections[0].links[0];
const rank = await api.browse({ page: firstRank.page });
assert.ok(rank.sections[0].tracks.length > 0);
ok("chart", `${rank.title}: ${rank.sections[0].tracks.length}, ${rank.sections[0].tracks[0].name} ${rank.sections[0].tracks[0].duration}ms`);

const square = await api.browse({ page: "square" });
const tagLink = square.sections.find((s) => s.links)?.links[0];
const tag = await api.browse({ page: tagLink.page });
assert.ok(tag.sections[0].playlists.length > 0);
ok("playlist tag", `${tag.title}: ${tag.sections[0].playlists.length}`);

const pl = await api.playlist({ id: tag.sections[0].playlists[0].id });
assert.ok(pl.tracks.length > 0);
ok("playlist", `${pl.name}: ${pl.tracks.length} of ${pl.trackCount}`);

const album = await api.album({ id: "8592" });
assert.ok(album.tracks.length > 0);
ok("album", `${album.album.name} - ${album.album.artists.map((a) => a.name)}: ${album.tracks.length}`);

const dAlbums = await api.search({ query: "周杰伦 最伟大的作品", kind: "albums", offset: 0 });
const d = dAlbums.albums.find((a) => a.id.startsWith("d"));
if (d) {
  const da = await api.album({ id: d.id });
  ok("digital album", `${da.album.name}: ${da.tracks.length}`);
}

const artist = await api.artist({ id: "112" });
assert.ok(artist.tracks.length > 0 && artist.albums.length > 0);
ok("artist", `${artist.artist.name}: ${artist.tracks.length} songs, ${artist.albums.length} albums`);

const singers = await api.browse({ page: "singers:oumei-nv" });
ok("singers", `${singers.sections[1].artists.length}, first ${singers.sections[1].artists[0]?.name}`);

const stations = await api.stations();
assert.ok(stations.length > 0);
const next = await api.stationNext({ id: stations[0].id });
assert.ok(next.length > 0);
ok("station", `${stations.length} stations, ${stations[0].name}: ${next.map((t) => t.name).join(", ")}`);

assert.equal(await api.account(), null);
await assert.rejects(api.liked({ offset: 0 }), (e) => e.code === "signIn");
ok("signed out", "liked asks to sign in");
