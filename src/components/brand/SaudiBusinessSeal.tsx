import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const SBC_SEAL_SCRIPT = "https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal.js";
const SBC_TOKEN = "NzNyMEZtczVDeE04SzI4WHN4bmpodz09";

type SaudiBusinessSealProps = {
  className?: string;
};

function isOfficialSealUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    return (
      url.protocol === "https:" &&
      url.hostname === "eauthenticate.saudibusiness.gov.sa" &&
      (url.pathname.includes("/certificate-details/") || url.pathname.includes("/EAuthSealApi/seal"))
    );
  } catch {
    return false;
  }
}

/** Prefer a certificate page over the seal widget iframe when both exist. */
function readSealHref(): string | null {
  const nodes = document.querySelectorAll(
    ".sbc-verify-seal a[href], .sbc-verify-seal iframe[src], .sbc-seal-frame[src]",
  );
  let widgetUrl: string | null = null;
  for (const node of nodes) {
    const value = node.getAttribute("href") ?? node.getAttribute("src");
    if (!value || !isOfficialSealUrl(value)) continue;
    if (value.includes("/certificate-details/")) return value;
    widgetUrl = value;
  }
  return widgetUrl;
}

/**
 * Dashboard footer identity. The official SBC seal stays in the DOM so seal.js
 * can build the verification URL, but it is not shown. The custom link stays
 * unavailable until that URL is copied onto it.
 */
export function SaudiBusinessSeal({ className }: SaudiBusinessSealProps) {
  const [sealHref, setSealHref] = useState<string | null>(null);

  useEffect(() => {
    const apply = () => {
      const href = readSealHref();
      if (href) setSealHref(href);
    };

    const observer = new MutationObserver(apply);
    const seal = document.querySelector(".sbc-verify-seal");
    if (seal) {
      observer.observe(seal, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "src"],
      });
    }
    observer.observe(document.body, { childList: true });
    apply();

    if (!document.querySelector("script[data-sbc-seal-script]")) {
      const script = document.createElement("script");
      script.src = SBC_SEAL_SCRIPT;
      script.async = true;
      script.dataset.sbcSealScript = "1";
      document.body.appendChild(script);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <footer
      className={cn(
        "saudi-identity-footer mt-8 flex justify-center border-t border-[oklch(1_0_0/0.06)] pt-6 pb-1",
        className,
      )}
    >
      <div
        className="sbc-verify-seal"
        data-token={SBC_TOKEN}
        data-position="bottom-left"
        hidden
      />
      <p
        dir="rtl"
        lang="ar"
        className="max-w-full px-1 text-center font-bold text-[0.82rem] leading-none tracking-wide text-muted-foreground"
      >
        صناعة سعودية
        <span aria-hidden className="mx-2 text-[oklch(1_0_0/0.35)]" hidden={!sealHref}>
          •
        </span>
        <a
          id="sbc-custom-button"
          href={sealHref ?? undefined}
          hidden={!sealHref}
          aria-disabled={sealHref ? undefined : true}
          tabIndex={sealHref ? undefined : -1}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          موثق لدى المركز السعودي للأعمال
        </a>
      </p>
    </footer>
  );
}
