import { useState } from "react";

import {
  ownerSubscriberTier,
  readKickDefaultSubscriberBadge,
  readOwnerSubscriberTiers,
  subscriberBadgeFileError,
  SUBSCRIBER_BADGE_BUCKET,
  type KickSubscriberTier,
} from "@/lib/kickBadgeResolver";
import { supabase } from "@/lib/supabase/client";

/**
 * Channel owner uploads the subscriber images Kick does not send on chat.
 * A failed upload leaves the saved list unchanged.
 */
export function KickSubscriberBadgesField({
  userId,
  config,
  onChange,
  onUseDefault,
}: {
  userId: string;
  config: unknown;
  onChange: (tiers: KickSubscriberTier[]) => void;
  onUseDefault: (enabled: boolean) => void;
}) {
  const tiers = readOwnerSubscriberTiers(config);
  const useDefault = readKickDefaultSubscriberBadge(config);
  const [months, setMonths] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload(file: File) {
    const invalid = subscriberBadgeFileError(file);
    if (invalid) {
      setNotice(invalid);
      return;
    }
    const duration = Math.round(months);
    if (!Number.isInteger(duration) || duration < 1 || duration > 120) {
      setNotice("Enter months from 1 to 120. Nothing was saved.");
      return;
    }
    if (!userId) {
      setNotice("Sign in before uploading. Nothing was saved.");
      return;
    }
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/kick-subscriber-badges/${crypto.randomUUID()}.${ext}`;
    setPending(true);
    const { error } = await supabase.storage.from(SUBSCRIBER_BADGE_BUCKET).upload(path, file, {
      contentType: file.type === "image/jpg" ? "image/jpeg" : file.type,
      upsert: false,
    });
    setPending(false);
    if (error) {
      setNotice("Upload failed. The badge was not saved.");
      return;
    }
    const publicUrl = supabase.storage.from(SUBSCRIBER_BADGE_BUCKET).getPublicUrl(path).data.publicUrl;
    const tier = ownerSubscriberTier(duration, publicUrl);
    if (!tier) {
      setNotice("Upload failed. The badge was not saved.");
      return;
    }
    onChange([...tiers.filter((item) => item.months !== tier.months), tier].sort((a, b) => a.months - b.months));
    setNotice(null);
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Subscriber badge images</p>
      <p className="text-[11px] text-muted-foreground">
        Upload this channel&apos;s subscriber images. The overlay shows the highest saved tier at or below the
        subscriber&apos;s months. Files are public so OBS can load them, and each owner can only write inside their own
        folder.
      </p>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={useDefault}
          onChange={(event) => onUseDefault(event.target.checked)}
        />
        <span>
          This channel uses Kick&apos;s default subscriber badge. Leave this off if the channel has custom subscriber
          art. The default file stays hidden while any uploaded tier is saved, and it is off until you turn it on.
        </span>
      </label>
      <label className="block text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Months
        <input
          type="number"
          min={1}
          max={120}
          value={months}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          onChange={(event) => setMonths(Number(event.target.value))}
        />
      </label>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={pending}
        className="block w-full text-xs"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {notice ? <p className="text-xs text-red-300">{notice}</p> : null}
      {tiers.length > 0 ? (
        <ul className="space-y-2">
          {tiers.map((tier) => (
            <li key={tier.months} className="flex items-center gap-2">
              <img src={tier.url} alt={`${tier.months} month subscriber image`} className="h-8 w-8 object-contain" />
              <span className="text-xs text-muted-foreground">{tier.months} months</span>
              <button
                type="button"
                className="ml-auto text-xs text-red-300"
                onClick={() => onChange(tiers.filter((item) => item.months !== tier.months))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No subscriber images saved for this channel.</p>
      )}
    </div>
  );
}
