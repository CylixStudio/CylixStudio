import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { CodeExample, CommandTable, DocumentationLayout, DocumentationSection as Section, DocumentationSidebar, InfoNotice, useDocsNavigation, VariableTable } from "@/components/docs/Documentation";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({ meta: [{ title: "CylixStudio Docs" }] }),
});

function DocsPage() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const { activeId, goTo } = useDocsNavigation();

  useEffect(() => {
    document.title = t("docs.page.title");
  }, [t]);

  const cmdRows = [
    { name: "!commands", purpose: t("docs.purpose.commandList"), usage: "!commands", access: t("docs.access.everyone"), platforms: "Kick / Twitch" },
    { name: "!followage", purpose: t("docs.purpose.followage"), usage: "!followage", access: t("docs.access.everyone"), platforms: "Kick / Twitch" },
    { name: "!lurk", purpose: t("docs.purpose.lurk"), usage: "!lurk", access: t("docs.access.everyone"), platforms: "Kick / Twitch" },
    { name: "!so", purpose: t("docs.purpose.shoutout"), usage: "!so streamer", access: t("docs.access.everyone"), platforms: "Kick / Twitch" },
    { name: "!welcome", purpose: t("docs.purpose.welcome"), usage: "!welcome", access: t("docs.access.everyone"), platforms: "Kick / Twitch" },
    { name: "!points", purpose: t("docs.purpose.pointsShow"), usage: "!points", access: t("docs.access.perSettings"), platforms: "Kick" },
    { name: "!points add", purpose: t("docs.purpose.pointsAdd"), usage: "!points add @name 50", access: t("docs.access.broadcasterDefault"), platforms: "Kick" },
    { name: "!points remove", purpose: t("docs.purpose.pointsRemove"), usage: "!points remove all 10", access: t("docs.access.modBroadcaster"), platforms: "Kick" },
  ];

  const varRows = [
    { name: "{{sender.username}}", purpose: t("docs.var.sender.purpose"), usage: t("docs.var.sender.usage"), access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{sender.url}}", purpose: t("docs.var.senderUrl.purpose"), usage: "{{sender.url}}", access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{param}}", purpose: t("docs.var.param.purpose"), usage: t("docs.var.param.usage"), access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{taggeduser.username}}", purpose: t("docs.var.tagged.purpose"), usage: "!hello @Ahmad", access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{stream.title}}", purpose: t("docs.var.streamTitle.purpose"), usage: "{{stream.title}}", access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{stream.category}}", purpose: t("docs.var.streamCategory.purpose"), usage: "{{stream.category}}", access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{stream.viewers}}", purpose: t("docs.var.streamViewers.purpose"), usage: "{{stream.viewers}}", access: t("docs.access.dash"), platforms: "Kick / Twitch" },
    { name: "{{randomRange(1, 10)}}", purpose: t("docs.var.random.purpose"), usage: "{{randomRange(1, 10)}}", access: t("docs.access.dash"), platforms: "Kick / Twitch" },
  ];

  const markRows = [
    { name: "!mark", purpose: t("docs.mark.start.purpose"), usage: t("docs.mark.start.usage"), access: t("docs.access.staffAllowlist"), platforms: "Kick" },
    { name: "!emark", purpose: t("docs.mark.end.purpose"), usage: t("docs.mark.end.usage"), access: t("docs.access.staffAllowlist"), platforms: "Kick" },
  ];

  return (
    <DocumentationLayout>
      <DocumentationSidebar activeId={activeId} onPick={goTo} open={open} onClose={() => setOpen(false)} />
      <main className="docs-main">
        <button className="docs-menu" onClick={() => setOpen(true)}>
          <Menu size={19} /> {t("docs.sections.button")}
        </button>

        <Section id="intro" title={t("docs.intro.title")} description={t("docs.intro.description")}>
          <div className="docs-hero-card">
            <span>{t("docs.intro.badge")}</span>
            <h2>{t("docs.intro.heading")}</h2>
            <p>{t("docs.intro.body")}</p>
            <button onClick={() => goTo("connect")}>{t("docs.intro.cta")}</button>
          </div>
          <InfoNotice>{t("docs.intro.notice")}</InfoNotice>
        </Section>

        <Section id="connect" title={t("docs.connect.title")} description={t("docs.connect.description")}>
          <ol className="docs-steps">
            <li>{t("docs.connect.step1")}</li>
            <li>{t("docs.connect.step2")}</li>
            <li>{t("docs.connect.step3")}</li>
            <li>{t("docs.connect.step4")}</li>
          </ol>
          <InfoNotice title={t("docs.connect.noticeTitle")}>{t("docs.connect.notice")}</InfoNotice>
        </Section>

        <Section id="default-commands" title={t("docs.defaultCommands.title")} description={t("docs.defaultCommands.description")}>
          <CommandTable rows={cmdRows} />
          <InfoNotice title={t("docs.defaultCommands.noticeTitle")}>{t("docs.defaultCommands.notice")}</InfoNotice>
          <CodeExample label={t("docs.defaultCommands.shoutoutLabel")}>!so cylixstudio</CodeExample>
        </Section>

        <Section id="custom-commands" title={t("docs.customCommands.title")} description={t("docs.customCommands.description")}>
          <ol className="docs-steps">
            <li>{t("docs.customCommands.step1")}</li>
            <li>{t("docs.customCommands.step2")}</li>
            <li>{t("docs.customCommands.step3")}</li>
            <li>{t("docs.customCommands.step4")}</li>
            <li>{t("docs.customCommands.step5")}</li>
          </ol>
          <CodeExample label={t("docs.customCommands.codeLabel")}>{t("docs.customCommands.code")}</CodeExample>
          <InfoNotice>{t("docs.customCommands.notice")}</InfoNotice>
        </Section>

        <Section id="points" title={t("docs.points.title")} description={t("docs.points.description")}>
          <CommandTable rows={cmdRows.slice(5)} />
          <CodeExample label={t("docs.points.codeLabel")}>!points add @sara 50</CodeExample>
          <InfoNotice title={t("docs.points.noticeTitle")}>{t("docs.points.notice")}</InfoNotice>
        </Section>

        <Section id="variables" title={t("docs.variables.title")} description={t("docs.variables.description")}>
          <VariableTable rows={varRows} />
          <CodeExample label={t("docs.variables.codeLabel")}>{t("docs.variables.code")}</CodeExample>
          <InfoNotice>
            {t("docs.variables.noticeBefore")}
            <code>{"{user}"}</code>
            {t("docs.variables.noticeAfter")}
          </InfoNotice>
        </Section>

        <Section id="alerts" title={t("docs.alerts.title")} description={t("docs.alerts.description")}>
          <ol className="docs-steps">
            <li>{t("docs.alerts.step1")}</li>
            <li>{t("docs.alerts.step2")}</li>
            <li>{t("docs.alerts.step3")}</li>
            <li>{t("docs.alerts.step4")}</li>
          </ol>
          <InfoNotice>{t("docs.alerts.notice")}</InfoNotice>
        </Section>

        <Section id="widgets" title={t("docs.widgets.title")} description={t("docs.widgets.description")}>
          <ol className="docs-steps">
            <li>{t("docs.widgets.step1")}</li>
            <li>{t("docs.widgets.step2")}</li>
            <li>{t("docs.widgets.step3")}</li>
            <li>{t("docs.widgets.step4")}</li>
          </ol>
          <InfoNotice title={t("docs.widgets.noticeTitle")}>{t("docs.widgets.notice")}</InfoNotice>
        </Section>

        <Section id="subathon" title={t("docs.subathon.title")} description={t("docs.subathon.description")}>
          <p className="docs-copy-text">{t("docs.subathon.body")}</p>
          <InfoNotice>{t("docs.subathon.notice")}</InfoNotice>
        </Section>

        <Section id="mark-points" title={t("docs.markPoints.title")} description={t("docs.markPoints.description")}>
          <CommandTable rows={markRows} />
          <InfoNotice>
            {t("docs.markPoints.noticeBefore")}
            <code>/</code>
            {t("docs.markPoints.noticeAfter")}
          </InfoNotice>
        </Section>

        <Section id="timers" title={t("docs.timers.title")} description={t("docs.timers.description")}>
          <ol className="docs-steps">
            <li>{t("docs.timers.step1")}</li>
            <li>{t("docs.timers.step2")}</li>
            <li>{t("docs.timers.step3")}</li>
          </ol>
          <CodeExample label={t("docs.timers.codeLabel")}>{t("docs.timers.code")}</CodeExample>
          <InfoNotice>{t("docs.timers.notice")}</InfoNotice>
        </Section>

        <Section id="account" title={t("docs.account.title")} description={t("docs.account.description")}>
          <p className="docs-copy-text">{t("docs.account.body")}</p>
        </Section>

        <Section id="faq" title={t("docs.faq.title")} description={t("docs.faq.description")}>
          <div className="docs-faq">
            <details>
              <summary>{t("docs.faq.q1")}</summary>
              <p>{t("docs.faq.a1")}</p>
            </details>
            <details>
              <summary>{t("docs.faq.q2")}</summary>
              <p>{t("docs.faq.a2")}</p>
            </details>
            <details>
              <summary>{t("docs.faq.q3")}</summary>
              <p>{t("docs.faq.a3")}</p>
            </details>
          </div>
        </Section>
      </main>
    </DocumentationLayout>
  );
}
