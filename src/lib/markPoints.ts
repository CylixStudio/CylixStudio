export type MarkSource = "KICK" | "TWITCH" | "STUDIO";
export type MarkCommandKind = "mark" | "emark";
export const MARK_STATUSES = ["pending", "approved", "rejected"] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

export type StreamMark = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  uptimeStartSeconds: number | null;
  uptimeEndSeconds: number | null;
  streamStartedAt: string | null;
  offline: boolean;
  status: MarkStatus;
  author: string;
  source: MarkSource;
  note: string;
  viewerIsMod: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StreamMarkPatch = {
  id: string;
  note?: string;
  status?: MarkStatus;
};

export type MarkShareSettings = {
  shareToken: string;
  kickUsername: string;
};

export type MarkCommandMatch = {
  kind: MarkCommandKind;
  note: string;
};

export const MARK_POINTS_TEST_KEY = "creovix:mark-points";
export const MARK_ALLOWLIST_TEST_KEY = "creovix:mark-point-allowlist";
export const MARK_SETTINGS_TEST_KEY = "creovix:mark-point-settings";
export const MARK_NOTE_MAX = 280;

export function isMarkStatus(value: string): value is MarkStatus {
  return (MARK_STATUSES as readonly string[]).includes(value);
}

export function markStatusLabel(status: MarkStatus, _lang?: "en" | "ar"): string {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

export function kickChannelUrl(username: string | null | undefined): string | null {
  const slug = sanitizeKickUsername(username ?? "");
  return slug ? `https://kick.com/${slug}` : null;
}

export function markSharePath(token: string, markId?: string): string {
  const base = `/marks/${encodeURIComponent(token)}`;
  return markId ? `${base}/${encodeURIComponent(markId)}` : base;
}

export type MarkVodInfo = {
  uuid: string;
  title: string | null;
  watchUrl: string;
  embedUrl: string;
  hlsUrl: string | null;
  thumbnail: string | null;
  seekSeconds: number | null;
  endSeconds: number | null;
};

export type MarkPlaybackPayload = {
  channelName: string;
  channelUrl: string | null;
  mark: StreamMark;
  vod: MarkVodInfo | null;
};

export function markGateCookieName(token: string): string {
  const safe = token.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40);
  return `creovix_mark_${safe || "gate"}`;
}

export function isGateUsernameAllowed(
  username: string,
  names: { owner: string; allowlist: string[]; cachedStaff: string[] },
): boolean {
  const needle = normalizeKickUsername(username);
  if (!needle) return false;
  if (normalizeKickUsername(names.owner) === needle) return true;
  return isAllowlisted(needle, names.allowlist) || isAllowlisted(needle, names.cachedStaff);
}

const MARK_PREFIXES = ["!", "/"] as const;

export function sanitizeMarkNote(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MARK_NOTE_MAX);
}

export function sanitizeKickUsername(raw: string): string {
  return raw.trim().replace(/^@/, "").replace(/\s+/g, "").slice(0, 32);
}

export function normalizeKickUsername(raw: string): string {
  return sanitizeKickUsername(raw).toLowerCase();
}

export function isAllowlisted(username: string, allowlist: string[]): boolean {
  const needle = normalizeKickUsername(username);
  if (!needle) return false;
  return allowlist.some((name) => normalizeKickUsername(name) === needle);
}

export function markStatusDotClass(status: MarkStatus): string {
  if (status === "approved") return "bg-emerald-500";
  if (status === "rejected") return "bg-red-500";
  return "bg-amber-400";
}

/** Kick webhook: owner, moderator, editor, or similar staff badges Kick actually sends. */
export function isMarkStaff(
  badges: string[],
  senderPlatformId?: string | null,
  broadcasterUserId?: string | null,
): boolean {
  if (senderPlatformId && broadcasterUserId && senderPlatformId === broadcasterUserId) {
    return true;
  }
  return badges.some((badge) => {
    const type = badge.toLowerCase().replace(/[_\s]+/g, "-");
    return (
      type.includes("broadcaster") ||
      type.includes("moderator") ||
      type === "mod" ||
      type.includes("editor") ||
      type.includes("staff") ||
      type === "admin" ||
      type.includes("host")
    );
  });
}

export function canTriggerMark(input: {
  badges: string[];
  username: string;
  senderPlatformId?: string | null;
  broadcasterUserId?: string | null;
  allowlist: string[];
}): boolean {
  if (isMarkStaff(input.badges, input.senderPlatformId, input.broadcasterUserId)) return true;
  return isAllowlisted(input.username, input.allowlist);
}

export function uptimeFromSession(streamStartedAt: string, at = Date.now()): number | null {
  const start = Date.parse(streamStartedAt);
  if (!Number.isFinite(start) || at < start) return null;
  return Math.max(0, Math.floor((at - start) / 1000));
}

export function markSpanSeconds(mark: Pick<StreamMark, "uptimeStartSeconds" | "uptimeEndSeconds">): number | null {
  if (mark.uptimeStartSeconds == null || mark.uptimeEndSeconds == null) return null;
  return Math.max(0, mark.uptimeEndSeconds - mark.uptimeStartSeconds);
}

/** Stream uptime `HH:MM:SS`. Null/offline is not invented from a wall clock. */
export function formatUptime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** `!` and `/` only. Prefer `emark` over `mark`. */
export function matchMarkCommand(text: string): MarkCommandMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const prefix = MARK_PREFIXES.find((marker) => trimmed.startsWith(marker));
  if (!prefix) return null;
  const rest = trimmed.slice(prefix.length);
  const emark = /^emark(?:\s+|$)(.*)$/i.exec(rest);
  if (emark) return { kind: "emark", note: sanitizeMarkNote(emark[1] ?? "") };
  const mark = /^mark(?:\s+|$)(.*)$/i.exec(rest);
  if (mark) return { kind: "mark", note: sanitizeMarkNote(mark[1] ?? "") };
  return null;
}

export function markTitle(mark: StreamMark, _lang?: "en" | "ar"): string {
  if (mark.note) return mark.note;
  return "Stream mark";
}

function emptyMarks(): StreamMark[] {
  return [];
}

type StoredTestMarks = StreamMark[] | { sessionStartedAt?: string | null; marks?: StreamMark[] };

function readTestBundle(): { sessionStartedAt: string | null; marks: StreamMark[] } {
  if (typeof window === "undefined") return { sessionStartedAt: null, marks: emptyMarks() };
  try {
    const raw = window.localStorage.getItem(MARK_POINTS_TEST_KEY);
    if (!raw) return { sessionStartedAt: null, marks: emptyMarks() };
    const parsed = JSON.parse(raw) as StoredTestMarks;
    if (Array.isArray(parsed)) return { sessionStartedAt: null, marks: parsed.map(hydrateMark) };
    return {
      sessionStartedAt: typeof parsed.sessionStartedAt === "string" ? parsed.sessionStartedAt : null,
      marks: Array.isArray(parsed.marks) ? parsed.marks.map(hydrateMark) : emptyMarks(),
    };
  } catch {
    return { sessionStartedAt: null, marks: emptyMarks() };
  }
}

function persistTestBundle(sessionStartedAt: string | null, marks: StreamMark[]) {
  window.localStorage.setItem(MARK_POINTS_TEST_KEY, JSON.stringify({ sessionStartedAt, marks }));
}

function hydrateMark(raw: Partial<StreamMark>): StreamMark {
  const now = new Date().toISOString();
  return {
    id: raw.id ?? crypto.randomUUID(),
    startedAt: raw.startedAt ?? now,
    endedAt: raw.endedAt ?? null,
    durationSeconds: raw.durationSeconds ?? null,
    uptimeStartSeconds: raw.uptimeStartSeconds ?? null,
    uptimeEndSeconds: raw.uptimeEndSeconds ?? null,
    streamStartedAt: raw.streamStartedAt ?? null,
    offline: Boolean(raw.offline),
    status: isMarkStatus(raw.status ?? "") ? raw.status : "pending",
    author: raw.author ?? "chat",
    source: raw.source === "TWITCH" || raw.source === "STUDIO" || raw.source === "KICK" ? raw.source : "KICK",
    note: raw.note ?? "",
    viewerIsMod: Boolean(raw.viewerIsMod),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

export function loadTestMarks(): StreamMark[] {
  return readTestBundle().marks;
}

function ensureTestSession(at = new Date().toISOString()): { sessionStartedAt: string; marks: StreamMark[] } {
  const current = readTestBundle();
  if (current.sessionStartedAt) {
    return { sessionStartedAt: current.sessionStartedAt, marks: current.marks };
  }
  persistTestBundle(at, current.marks);
  return { sessionStartedAt: at, marks: current.marks };
}

function newestOpenIndex(marks: StreamMark[]): number {
  let found = -1;
  for (let i = 0; i < marks.length; i += 1) {
    const mark = marks[i];
    if (!mark || mark.endedAt) continue;
    if (found < 0) {
      found = i;
      continue;
    }
    if (Date.parse(mark.createdAt) > Date.parse(marks[found]!.createdAt)) found = i;
  }
  return found;
}

export function applyMarkStart(
  marks: StreamMark[],
  input: {
    author: string;
    source: MarkSource;
    note: string;
    viewerIsMod: boolean;
    at?: string;
    uptimeStartSeconds?: number | null;
    streamStartedAt?: string | null;
    offline?: boolean;
  },
): StreamMark[] {
  const now = input.at ?? new Date().toISOString();
  const row: StreamMark = {
    id: crypto.randomUUID(),
    startedAt: now,
    endedAt: null,
    durationSeconds: null,
    uptimeStartSeconds: input.offline ? null : (input.uptimeStartSeconds ?? null),
    uptimeEndSeconds: null,
    streamStartedAt: input.streamStartedAt ?? null,
    offline: Boolean(input.offline),
    status: "pending",
    author: input.author.trim() || "chat",
    source: input.source,
    note: sanitizeMarkNote(input.note),
    viewerIsMod: Boolean(input.viewerIsMod),
    createdAt: now,
    updatedAt: now,
  };
  return [row, ...marks];
}

export function applyMarkEnd(
  marks: StreamMark[],
  input: {
    note?: string;
    at?: string;
    uptimeEndSeconds?: number | null;
    offline?: boolean;
  },
): { marks: StreamMark[]; closed: StreamMark | null } {
  const index = newestOpenIndex(marks);
  if (index < 0) return { marks, closed: null };
  const open = marks[index]!;
  const now = input.at ?? new Date().toISOString();
  const note = input.note ? sanitizeMarkNote(input.note) : open.note;
  const uptimeEnd =
    input.offline || open.offline
      ? null
      : (input.uptimeEndSeconds ??
        (open.streamStartedAt ? uptimeFromSession(open.streamStartedAt, Date.parse(now)) : null));
  const duration =
    open.uptimeStartSeconds != null && uptimeEnd != null
      ? Math.max(0, uptimeEnd - open.uptimeStartSeconds)
      : null;
  const closed: StreamMark = {
    ...open,
    endedAt: now,
    uptimeEndSeconds: uptimeEnd,
    durationSeconds: duration,
    offline: Boolean(input.offline) || open.offline,
    note,
    updatedAt: now,
  };
  const next = [...marks];
  next[index] = closed;
  return { marks: next, closed };
}

export function applyTestMarkCommand(
  text: string,
  sender: { username: string; viewerIsMod?: boolean; source?: MarkSource } = { username: "Mod" },
): { marks: StreamMark[]; status: string; reason?: string; kind?: MarkCommandKind } {
  const matched = matchMarkCommand(text);
  if (!matched) return { marks: loadTestMarks(), status: "ignored", reason: "not_mark_command" };
  const allowlist = loadTestAllowlist();
  const permitted = canTriggerMark({
    badges: sender.viewerIsMod === false ? [] : ["moderator"],
    username: sender.username,
    allowlist,
  });
  if (!permitted) return { marks: loadTestMarks(), status: "ignored", reason: "not_permitted" };

  const now = new Date().toISOString();
  const session = ensureTestSession(now);
  const uptime = uptimeFromSession(session.sessionStartedAt, Date.parse(now));

  if (matched.kind === "mark") {
    const marks = applyMarkStart(session.marks, {
      author: sender.username,
      source: sender.source ?? "KICK",
      note: matched.note,
      viewerIsMod: sender.viewerIsMod !== false,
      at: now,
      uptimeStartSeconds: uptime,
      streamStartedAt: session.sessionStartedAt,
      offline: false,
    });
    persistTestBundle(session.sessionStartedAt, marks);
    return { marks, status: "started", kind: "mark" };
  }
  const { marks, closed } = applyMarkEnd(session.marks, {
    note: matched.note,
    at: now,
    uptimeEndSeconds: uptime,
  });
  persistTestBundle(session.sessionStartedAt, marks);
  if (!closed) return { marks, status: "ignored", reason: "no_open_start", kind: "emark" };
  return { marks, status: "closed", kind: "emark" };
}

export function updateTestMark(patch: StreamMarkPatch): StreamMark[] {
  const bundle = readTestBundle();
  const now = new Date().toISOString();
  const marks = bundle.marks.map((mark) =>
    mark.id === patch.id
      ? {
          ...mark,
          note: patch.note !== undefined ? sanitizeMarkNote(patch.note) : mark.note,
          status: patch.status ?? mark.status,
          updatedAt: now,
        }
      : mark,
  );
  persistTestBundle(bundle.sessionStartedAt, marks);
  return marks;
}

export function deleteTestMark(id: string): StreamMark[] {
  const bundle = readTestBundle();
  const marks = bundle.marks.filter((mark) => mark.id !== id);
  persistTestBundle(bundle.sessionStartedAt, marks);
  return marks;
}

export function createStudioTestMark(input: { note: string; author?: string }): StreamMark[] {
  const now = new Date().toISOString();
  const session = ensureTestSession(now);
  const marks = applyMarkStart(session.marks, {
    author: input.author?.trim() || "Studio",
    source: "STUDIO",
    note: input.note,
    viewerIsMod: true,
    at: now,
    uptimeStartSeconds: uptimeFromSession(session.sessionStartedAt, Date.parse(now)),
    streamStartedAt: session.sessionStartedAt,
    offline: false,
  });
  persistTestBundle(session.sessionStartedAt, marks);
  return marks;
}

export function loadTestAllowlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MARK_ALLOWLIST_TEST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((name): name is string => typeof name === "string")
      .map(sanitizeKickUsername)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function persistTestAllowlist(names: string[]) {
  window.localStorage.setItem(MARK_ALLOWLIST_TEST_KEY, JSON.stringify(names));
}

export function addTestAllowlistName(raw: string): string[] {
  const username = sanitizeKickUsername(raw);
  if (!username) return loadTestAllowlist();
  const current = loadTestAllowlist();
  if (current.some((name) => normalizeKickUsername(name) === normalizeKickUsername(username))) {
    return current;
  }
  const next = [...current, username];
  persistTestAllowlist(next);
  return next;
}

export function removeTestAllowlistName(raw: string): string[] {
  const needle = normalizeKickUsername(raw);
  const next = loadTestAllowlist().filter((name) => normalizeKickUsername(name) !== needle);
  persistTestAllowlist(next);
  return next;
}

export function setTestMarkStatus(id: string, status: MarkStatus): StreamMark[] {
  return updateTestMark({ id, status });
}

export function loadTestShareSettings(): MarkShareSettings {
  if (typeof window === "undefined") {
    return { shareToken: "test-marks", kickUsername: "testchannel" };
  }
  try {
    const raw = window.localStorage.getItem(MARK_SETTINGS_TEST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MarkShareSettings>;
      if (typeof parsed.shareToken === "string" && parsed.shareToken) {
        return {
          shareToken: parsed.shareToken,
          kickUsername: sanitizeKickUsername(parsed.kickUsername ?? "testchannel") || "testchannel",
        };
      }
    }
  } catch {
    /* ignore */
  }
  const created: MarkShareSettings = {
    shareToken: crypto.randomUUID().replaceAll("-", ""),
    kickUsername: "testchannel",
  };
  window.localStorage.setItem(MARK_SETTINGS_TEST_KEY, JSON.stringify(created));
  return created;
}

export function rotateTestShareToken(): MarkShareSettings {
  const current = loadTestShareSettings();
  const next: MarkShareSettings = {
    ...current,
    shareToken: crypto.randomUUID().replaceAll("-", ""),
  };
  window.localStorage.setItem(MARK_SETTINGS_TEST_KEY, JSON.stringify(next));
  return next;
}

export function testShareGateAllowed(username: string): boolean {
  return isGateUsernameAllowed(username, {
    owner: loadTestShareSettings().kickUsername,
    allowlist: loadTestAllowlist(),
    cachedStaff: ["Mod", "Studio"],
  });
}
