import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isGatewayCompleted } from "@/lib/plans";
import { navigateAfterLogin } from "@/lib/postLogin";
import { isTestMode } from "@/lib/testMode";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CylixStudio" },
      {
        name: "tiktok-developers-site-verification",
        content: "k1s5lp842wjBLAa3X1QlqR1A2cNY2Kzi",
      },
      {
        name: "description",
        content:
          "Multi-platform streaming studio: Twitch, Kick, YouTube and TikTok widgets, commands and overlays.",
      },
      { property: "og:title", content: "CylixStudio" },
      {
        property: "og:description",
        content: "Sign in to pick Free or Pro and run your multi-platform stream tools.",
      },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CylixStudio",
          url: "https://cylixstudio.com",
          logo: "https://cylixstudio.com/Logo.svg",
        },
      },
    ],
  }),
  component: AuthGate,
});

function AuthGate() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const goNext = async () => {
      if (!active) return;
      try {
        await navigateAfterLogin(navigate);
      } catch (err) {
        console.warn("[/] post-login routing failed; gateway fallback", err);
        if (active) {
          void navigate({
            to: isGatewayCompleted() ? "/dashboard" : "/welcome",
            replace: true,
          });
        }
      }
    };

    if (isTestMode()) {
      void goNext();
      return () => {
        active = false;
      };
    }
    if (!isSupabaseConfigured()) {
      void navigate({ to: "/login", replace: true });
      return () => {
        active = false;
      };
    }
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (!data.session) {
        void navigate({ to: "/login", replace: true });
        return;
      }
      void goNext();
    });
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-charcoal px-6">
      <p className="text-muted-foreground">Checking your session…</p>
    </main>
  );
}
