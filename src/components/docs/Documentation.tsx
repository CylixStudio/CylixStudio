import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Search, X } from "lucide-react";
import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export type DocItem = { id: string; title: string; keywords: string; group?: string };

type DocGroup = "" | "commands" | "streaming" | "account";

// Static structure. Titles are translation keys; keywords hold a bilingual +
// technical blob (command syntax, variable names, platform names) so search
// works in either language and for technical tokens. IDs stay stable so the
// active section survives a language switch.
const DOC_STRUCTURE: { id: string; titleKey: TranslationKey; group: DocGroup; keywords: string }[] = [
  { id: "intro", titleKey: "docs.nav.intro", group: "", keywords: "بداية توثيق منصة بث introduction start" },
  { id: "connect", titleKey: "docs.nav.connect", group: "", keywords: "ربط حساب Kick Twitch connect platforms" },
  { id: "default-commands", titleKey: "docs.nav.defaultCommands", group: "commands", keywords: "!commands !followage !lurk !so !welcome commands followage lurk shoutout welcome الأوامر الافتراضية" },
  { id: "custom-commands", titleKey: "docs.nav.customCommands", group: "commands", keywords: "!addcom !delcom !editcom محفز prefix صلاحيات cooldown variables الأوامر المخصصة custom command" },
  { id: "points", titleKey: "docs.nav.points", group: "commands", keywords: "!points loyalty points add remove نظام النقاط" },
  { id: "variables", titleKey: "docs.nav.variables", group: "commands", keywords: "{{sender.username}} {{sender.url}} {{param}} {{taggeduser.username}} {{stream.title}} {{stream.category}} {{stream.viewers}} {{randomRange}} {user} template sender streamer taggeduser stream randomItem المتغيرات variables" },
  { id: "alerts", titleKey: "docs.nav.alerts", group: "streaming", keywords: "alerts overlay events test التنبيهات" },
  { id: "widgets", titleKey: "docs.nav.widgets", group: "streaming", keywords: "widget overlay browser source goal counter الودجات" },
  { id: "subathon", titleKey: "docs.nav.subathon", group: "streaming", keywords: "subathon timer rules overlay السابثون" },
  { id: "mark-points", titleKey: "docs.nav.markPoints", group: "streaming", keywords: "!mark !emark mark emark clips timeline ميزة" },
  { id: "timers", titleKey: "docs.nav.timers", group: "streaming", keywords: "message timers interval automatic chat مؤقتات الرسائل" },
  { id: "account", titleKey: "docs.nav.account", group: "account", keywords: "settings subscription pro plan إعدادات الحساب والاشتراك" },
  { id: "faq", titleKey: "docs.nav.faq", group: "account", keywords: "faq مساعدة سؤال الأسئلة الشائعة" },
];

const DOC_IDS = DOC_STRUCTURE.map((x) => x.id);

/** Normalize for search: lower-case and drop trigger/brace punctuation so that
 *  "!points" or "{username}" match "points" / "{{sender.username}}". */
function normalizeForSearch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function docItemsFor(lang: "ar" | "en", t: (key: TranslationKey) => string): DocItem[] {
  return DOC_STRUCTURE.map((x) => ({
    id: x.id,
    title: t(x.titleKey),
    keywords: x.keywords,
    ...(x.group ? { group: x.group } : {}),
  }));
}

export function DocumentationLayout({ children }: { children: ReactNode }) {
  const { dir } = useLanguage();
  return (
    <div className="docs-shell" dir={dir}>
      {children}
    </div>
  );
}

export function DocumentationSearch({ onPick }: { onPick: (id: string) => void }) {
  const { lang, t } = useLanguage();
  const [q, setQ] = useState("");
  const items = useMemo(() => docItemsFor(lang, t), [lang, t]);
  const results = useMemo(() => {
    const needle = normalizeForSearch(q);
    return needle
      ? items
          .filter((x) => normalizeForSearch(`${x.title} ${x.keywords}`).includes(needle))
          .slice(0, 7)
      : [];
  }, [q, items]);
  return (
    <div className="docs-search">
      <Search size={17} />
      <input
        aria-label={t("docs.search.aria")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("docs.search.placeholder")}
      />
      {results.length > 0 && (
        <div className="docs-results">
          {results.map((x) => (
            <button
              key={x.id}
              onClick={() => {
                onPick(x.id);
                setQ("");
              }}
            >
              <span>{x.title}</span>
              <small>{x.group ? t(`docs.group.${x.group}` as TranslationKey) : t("docs.search.startHere")}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const GROUPS: DocGroup[] = ["", "commands", "streaming", "account"];

export function DocumentationSidebar({
  activeId,
  onPick,
  open,
  onClose,
}: {
  activeId: string;
  onPick: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { lang, t } = useLanguage();
  const items = useMemo(() => docItemsFor(lang, t), [lang, t]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ commands: true, streaming: true, account: true });
  const groupLabel = (g: DocGroup) => (g ? t(`docs.group.${g}` as TranslationKey) : "");
  return (
    <aside className={`docs-sidebar ${open ? "is-open" : ""}`}>
      <div className="docs-sidebar-head">
        <div>
          <span className="docs-eyebrow">CYLIXSTUDIO</span>
          <strong>{t("docs.sidebar.hub")}</strong>
        </div>
        <button className="docs-mobile-close" onClick={onClose} aria-label={t("docs.close")}>
          <X size={19} />
        </button>
      </div>
      <DocumentationSearch onPick={(id) => { onPick(id); onClose(); }} />
      <nav>
        {GROUPS.map((g) => {
          const groupItems = items.filter((x) => (x.group ?? "") === g);
          return (
            <div className="docs-nav-group" key={g || "start"}>
              {g && (
                <button className="docs-group-toggle" onClick={() => setExpanded((v) => ({ ...v, [g]: !v[g] }))}>
                  {groupLabel(g)}
                  <ChevronDown size={15} className={expanded[g] ? "rotated" : ""} />
                </button>
              )}
              {(!g || expanded[g]) &&
                groupItems.map((x) => (
                  <button
                    key={x.id}
                    className={activeId === x.id ? "active" : ""}
                    onClick={() => {
                      onPick(x.id);
                      onClose();
                    }}
                  >
                    {x.title}
                  </button>
                ))}
            </div>
          );
        })}
      </nav>
      <div className="docs-footer">
        <a className="docs-dashboard-link" href="/dashboard">
          {t("docs.sidebar.back")} <ExternalLink size={14} />
        </a>
        <LanguageSwitcher />
      </div>
    </aside>
  );
}

export function DocumentationSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="docs-section">
      <a className="docs-anchor" href={`#${id}`}>#</a>
      <header>
        <p className="docs-kicker">CylixStudio Docs</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export function CopyButton({ value }: { value: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button className="docs-copy" onClick={copy}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? t("docs.copied") : t("docs.copy")}
    </button>
  );
}

export function CodeExample({ label, children }: { label?: string; children: string }) {
  const { t } = useLanguage();
  return (
    <div className="docs-code">
      <div>
        <span>{label ?? t("docs.code.example")}</span>
        <CopyButton value={children} />
      </div>
      <pre dir="ltr">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function InfoNotice({ title, children }: { title?: string; children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <aside className="docs-notice">
      <strong>{title ?? t("docs.notice.defaultTitle")}</strong>
      <div>{children}</div>
    </aside>
  );
}

type Row = { name: string; purpose: string; usage: string; access: string; platforms: string; pro?: string };

function DataTable({ rows, variable = false }: { rows: Row[]; variable?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="docs-table-wrap">
      <table>
        <thead>
          <tr>
            <th>{variable ? t("docs.table.variable") : t("docs.table.command")}</th>
            <th>{t("docs.table.purpose")}</th>
            <th>{t("docs.table.usage")}</th>
            <th>{t("docs.table.access")}</th>
            <th>{t("docs.table.platforms")}</th>
            <th>{t("docs.table.pro")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td><code>{r.name}</code></td>
              <td>{r.purpose}</td>
              <td><code>{r.usage}</code></td>
              <td>{r.access}</td>
              <td>{r.platforms}</td>
              <td>{r.pro ?? t("docs.table.no")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CommandTable({ rows }: { rows: Row[] }) {
  return <DataTable rows={rows} />;
}

export function VariableTable({ rows }: { rows: Row[] }) {
  return <DataTable rows={rows} variable />;
}

export function useDocsNavigation() {
  const [active, setActive] = useState("intro");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((x) => x.isIntersecting);
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-18% 0px -70% 0px" },
    );
    DOC_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  const goTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };
  return { activeId: active, goTo };
}
