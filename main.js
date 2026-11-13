// Resumes the Claude Code sessions that were running in Herdr terminals when the
// app (or the machine) stopped.
//
// Every 30 s it notes which Claude session runs in which terminal: the terminal's
// foreground pid (hc get) maps to ~/.claude/sessions/<pid>.json. When Herdr starts,
// each noted terminal that is back at a shell prompt gets
// `cd <folder> && claude --resume <id>`, unless that session already runs elsewhere.
// Needs a block in the layout to run: { "type": "block", "size": { "px": 0 },
// "content": { "mod": "claude-resume" } }.

import { View, div } from "gpui-kit";
import { hc, home, appHome, notify } from "herdr";
import * as fs from "fs/promises";

const SNAPSHOT_MS = 30000;
const READY_TIMEOUT_MS = 120000;
const SHELLS = /^-?(zsh|bash|fish|sh|dash|nu|pwsh|powershell|cmd)(\.exe)?$/i;
const CLAUDE = /^claude(\.exe)?$/i;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const snapshotPath = () => `${appHome()}/data/claude-resume/snapshot.json`;

function sleep(cx, ms) {
  return new Promise((resolve) => cx.timer.after(ms, () => resolve()));
}

async function hcJson(args) {
  const r = await hc(args);
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

async function liveTerminals() {
  const d = await hcJson(["ls"]);
  return (d?.terminals ?? []).filter((t) => t.state === "live" && typeof t.address === "string");
}

async function foreground(address) {
  const d = await hcJson(["get", address]);
  return d?.foreground ?? null;
}

async function sessionOfPid(pid) {
  if (!Number.isInteger(pid)) return null;
  try {
    const d = JSON.parse(await fs.readFile(`${home()}/.claude/sessions/${pid}.json`, "utf8"));
    return ID.test(d.sessionId ?? "") ? { session: d.sessionId, cwd: d.cwd ?? null } : null;
  } catch {
    return null;
  }
}

// Sessions already running in a Herdr terminal (portable: no process table needed).
async function runningSessions() {
  const ids = new Set();
  for (const t of await liveTerminals()) {
    const fg = await foreground(t.address);
    if (!CLAUDE.test(fg?.name ?? "")) continue;
    const s = await sessionOfPid(fg.pid);
    if (s) ids.add(s.session);
  }
  return ids;
}

async function takeSnapshot() {
  const terminals = {};
  const seen = new Set();
  for (const t of await liveTerminals()) {
    const fg = await foreground(t.address);
    if (!CLAUDE.test(fg?.name ?? "")) continue;
    const s = await sessionOfPid(fg.pid);
    if (!s || seen.has(s.session)) continue;
    seen.add(s.session);
    terminals[t.address] = { session: s.session, cwd: s.cwd ?? fg.cwd ?? null };
  }
  try {
    await fs.mkdir(`${appHome()}/data/claude-resume`, { recursive: true });
  } catch {}
  await fs.writeFile(snapshotPath(), JSON.stringify({ at: Date.now(), terminals }));
}

async function readSnapshot() {
  try {
    const d = JSON.parse(await fs.readFile(snapshotPath(), "utf8"));
    return d && typeof d.terminals === "object" ? d.terminals : {};
  } catch {
    return {};
  }
}

function resumeCommand(shell, cwd, session) {
  if (!cwd) return `claude --resume ${session}`;
  if (/^(pwsh|powershell)/i.test(shell)) return `Set-Location -LiteralPath '${String(cwd).replace(/'/g, "''")}'; claude --resume ${session}`;
  if (/^cmd/i.test(shell)) return `cd /d "${cwd}" && claude --resume ${session}`;
  return `cd '${String(cwd).replace(/'/g, "'\\''")}' && claude --resume ${session}`;
}

async function restore(cx) {
  const noted = await readSnapshot();
  const wanted = Object.keys(noted);
  if (wanted.length === 0) return 0;

  const deadline = Date.now() + READY_TIMEOUT_MS;
  let live = new Set();
  while (Date.now() < deadline) {
    live = new Set((await liveTerminals()).map((t) => t.address));
    if (wanted.some((a) => live.has(a))) break;
    await sleep(cx, 3000);
  }
  await sleep(cx, 3000);

  const running = await runningSessions();
  let resumed = 0;
  for (const address of wanted) {
    const rec = noted[address];
    if (!live.has(address) || !rec || !ID.test(rec.session ?? "") || running.has(rec.session)) continue;
    const fg = await foreground(address);
    if (!fg || !SHELLS.test(fg.name ?? "")) continue;
    const shell = String(fg.name).replace(/^-/, "");
    const r = await hc(["send", address, resumeCommand(shell, rec.cwd || fg.cwd, rec.session)]);
    if (r.code === 0) {
      running.add(rec.session);
      resumed += 1;
    }
  }
  return resumed;
}

export default class ClaudeResume extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      let resumed = 0;
      try {
        resumed = await restore(cx);
      } catch (e) {
        console.log(`claude-resume: restore failed: ${e}`);
      }
      if (resumed > 0)
        notify({ title: "Claude", body: `${resumed} session(s) reprise(s)`, level: "success" });
      cx.timer.every(SNAPSHOT_MS, (cx) => {
        cx.spawn(async () => {
          try {
            await takeSnapshot();
          } catch (e) {
            console.log(`claude-resume: snapshot failed: ${e}`);
          }
        });
      });
    });
  }

  render() {
    return div().size(0);
  }
}
