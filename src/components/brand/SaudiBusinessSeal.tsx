import { useEffect, useState } from "react";

import { resolveSbcCertificateUrl } from "@/lib/sbcSeal.functions";
import { cn } from "@/lib/utils";

const SBC_SEAL_SCRIPT = "https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal.js";
const SBC_TOKEN = "NzNyMEZtczVDeE04SzI4WHN4bmpodz09";

type SaudiBusinessSealProps = {
  className?: string;
};

function isCertificateUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    return (
      url.protocol === "https:" &&
      url.hostname === "eauthenticate.saudibusiness.gov.sa" &&
      (url.pathname.includes("/certificate-details/") || url.pathname.includes("/request/"))
    );
  } catch {
    return false;
  }
}

function absoluteCertificateHref(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    return isCertificateUrl(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

/** Read a certificate anchor the seal script placed in the parent document. */
function readDirectCertificateHref(): string | null {
  const anchors = document.querySelectorAll<HTMLAnchorElement>(
    ".sbc-verify-seal a[href], .sbc-seal-frame a[href]",
  );
  for (const anchor of anchors) {
    const href = absoluteCertificateHref(anchor.getAttribute("href") ?? "", anchor.href);
    if (href) return href;
  }
  return null;
}

/** The certificate link lives inside the seal iframe. Same-origin reads work; cross-origin throws. */
function readFrameCertificateHref(frame: HTMLIFrameElement): string | null {
  try {
    const anchor = frame.contentDocument?.querySelector<HTMLAnchorElement>(
      "a.sbc-link, a[href*='certificate-details'], a[href*='/request/']",
    );
    if (!anchor) return null;
    return absoluteCertificateHref(anchor.getAttribute("href") ?? anchor.href, frame.src);
  } catch {
    return null;
  }
}

function findSealFrame(): HTMLIFrameElement | null {
  const frame = document.querySelector(".sbc-verify-seal iframe, iframe.sbc-seal-frame");
  return frame instanceof HTMLIFrameElement ? frame : null;
}

/**
 * Dashboard footer identity. The official SBC seal stays in the DOM so seal.js
 * can run, but it is not shown. The custom link stays hidden until the
 * certificate page URL (not the seal frame) is known.
 */
export function SaudiBusinessSeal({ className }: SaudiBusinessSealProps) {
  const [sealHref, setSealHref] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let lookupStarted = false;

    const publish = (href: string | null) => {
      if (!cancelled && href) setSealHref(href);
    };

    const apply = () => {
      const direct = readDirectCertificateHref();
      if (direct) {
        publish(direct);
        return;
      }

      const frame = findSealFrame();
      if (!frame?.src) return;

      const fromFrame = readFrameCertificateHref(frame);
      if (fromFrame) {
        publish(fromFrame);
        return;
      }

      if (lookupStarted) return;
      lookupStarted = true;
      void resolveSbcCertificateUrl({ data: { sealUrl: frame.src } })
        .then((result) => publish(result.href))
        .catch(() => {
          lookupStarted = false;
        });
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

    return () => {
      cancelled = true;
      observer.disconnect();
    };
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
