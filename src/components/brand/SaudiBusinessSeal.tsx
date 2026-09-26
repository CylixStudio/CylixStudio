import { cn } from "@/lib/utils";

/** Official SBC certificate page for CylixStudio (opens in a new tab). */
const SBC_CERTIFICATE_URL =
  "https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000329636/1.INQ.1790439654.0aINawUTKmNh.KSh4fqcmKCATvNnp4YZGd0GOjaDJouP-1vlQk3ePCh4";

type SaudiBusinessSealProps = {
  className?: string;
};

/**
 * Dashboard footer identity — centered SBC verification link + Saudi-made line.
 * Uses local Saudi Web only (exempt from the global IBM Plex Sans Arabic stack).
 */
export function SaudiBusinessSeal({ className }: SaudiBusinessSealProps) {
  return (
    <footer
      className={cn(
        "saudi-identity-footer mt-8 flex justify-center border-t border-[oklch(1_0_0/0.06)] pt-6 pb-1",
        className,
      )}
    >
      <p
        dir="rtl"
        lang="ar"
        className="max-w-full px-1 text-center font-bold text-[0.82rem] leading-none tracking-wide text-muted-foreground"
      >
        صناعة سعودية
        <span aria-hidden className="mx-2 text-[oklch(1_0_0/0.35)]">
          •
        </span>
        <a
          href={SBC_CERTIFICATE_URL}
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
