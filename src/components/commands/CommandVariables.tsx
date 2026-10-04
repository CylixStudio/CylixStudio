import { useLanguage, type TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type CommandVariableGroup = {
  id: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  tags: readonly string[];
};

export const COMMAND_VARIABLE_GROUPS: readonly CommandVariableGroup[] = [
  {
    id: "general",
    labelKey: "commands.vars.general.label",
    descriptionKey: "commands.vars.general.description",
    tags: ["{user}", "{command}"],
  },
  {
    id: "sender",
    labelKey: "commands.vars.sender.label",
    descriptionKey: "commands.vars.sender.description",
    tags: ["{{sender.username}}", "{{sender.followers}}", "{{sender.followage}}", "{{sender.url}}"],
  },
  {
    id: "streamer",
    labelKey: "commands.vars.streamer.label",
    descriptionKey: "commands.vars.streamer.description",
    tags: ["{{streamer.username}}", "{{streamer.followers}}", "{{streamer.url}}"],
  },
  {
    id: "param",
    labelKey: "commands.vars.param.label",
    descriptionKey: "commands.vars.param.description",
    tags: ["{{param}}", "{{taggedUser.username}}", "{{taggedUser.followers}}", "{{taggedUser.followage}}"],
  },
  {
    id: "stream",
    labelKey: "commands.vars.stream.label",
    descriptionKey: "commands.vars.stream.description",
    tags: ["{{stream.title}}", "{{stream.category}}", "{{stream.viewers}}"],
  },
  {
    id: "random",
    labelKey: "commands.vars.random.label",
    descriptionKey: "commands.vars.random.description",
    tags: ['{{randomRange(1,100)}}', '{{randomItem("a","b","c")}}'],
  },
  {
    id: "api",
    labelKey: "commands.vars.api.label",
    descriptionKey: "commands.vars.api.description",
    tags: ['{{request("https://api.example.com").value}}'],
  },
];

export function CommandVariablesSidebar({
  onInsert,
  className,
}: {
  onInsert: (tag: string) => void;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <aside
      className={cn(
        "w-full shrink-0 space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 sm:w-64",
        className,
      )}
    >
      <p className="text-[0.72rem] font-medium uppercase tracking-wide text-muted-foreground">
        {t("commands.vars.sidebarTitle")}
      </p>
      {COMMAND_VARIABLE_GROUPS.map((group) => (
        <div key={group.id} className="space-y-1.5">
          <p className="text-[0.68rem] font-semibold tracking-wide text-zinc-300">{t(group.labelKey)}</p>
          <p className="text-[0.68rem] leading-snug text-muted-foreground">{t(group.descriptionKey)}</p>
          <div className="flex flex-wrap gap-1">
            {group.tags.map((tag) => (
              <VariableTag key={tag} tag={tag} onInsert={onInsert} />
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}

function VariableTag({ tag, onInsert }: { tag: string; onInsert: (tag: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onInsert(tag)}
      className="max-w-full truncate rounded-md border border-white/[0.08] bg-zinc-900/80 px-1.5 py-0.5 font-mono text-[0.62rem] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-foreground"
      title={tag}
    >
      {tag}
    </button>
  );
}
