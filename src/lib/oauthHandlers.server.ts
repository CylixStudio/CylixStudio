import {
  KICK_AUTHORIZE_URL,
  PROVIDERS,
  buildAuthorizeUrl,
  cookie,
  createState,
  createVerifier,
  exchangeCode,
  fetchStreamlabsSocketToken,
  isOAuthProvider,
  readCookie,
  readOAuthEnv,
  redirectUriFor,
  signSessionHandoff,
  verifyLinkState,
  type OAuthProvider,
} from "@/lib/oauth.server";
import { publicSiteUrl } from "@/lib/siteUrl.server";

function formatOAuthError(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.name ? { name: error.name } : {}),
    };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export async function handleOAuthStart(request: Request, providerRaw: string): Promise<Response> {
  if (!isOAuthProvider(providerRaw)) {
    return new Response("Unknown provider", { status: 404 });
  }
  const provider: OAuthProvider = providerRaw;
  const origin = publicSiteUrl(request);
  const config = PROVIDERS[provider];
  const clientId = readOAuthEnv(config.clientIdEnv);
  const hasClientSecret = Boolean(readOAuthEnv(config.clientSecretEnv));

  if (!clientId) {
    console.info(`[oauth:${provider}] start not_configured`, {
      requestUrl: request.url,
      origin,
      hasClientId: false,
      hasClientSecret,
    });
    return Response.redirect(new URL(`/login?error=${provider}_not_configured`, `${origin}/`), 302);
  }

  const linkState = new URL(request.url).searchParams.get("link");
  const state = linkState && verifyLinkState(linkState) ? linkState : createState();
  const verifier = config.usesPkce ? createVerifier() : null;
  const redirectUri = redirectUriFor(request, provider);

  const location = buildAuthorizeUrl({
    provider,
    clientId,
    redirectUri,
    state,
    verifier,
  });

  let authorizeHost = "(parse_failed)";
  try {
    authorizeHost = new URL(location).host;
  } catch {
    /* ignore */
  }

  console.info(`[oauth:${provider}] start`, {
    requestUrl: request.url,
    origin,
    redirectUri,
    authorizeHost,
    scopes: config.scopes,
    hasClientId: true,
    hasClientSecret,
    usesPkce: config.usesPkce,
  });

  // Kick's consent UI may call api.kick.com under the hood for validation; the
  // 302 Location we send must still be https://id.kick.com/oauth/authorize.
  if (provider === "kick") {
    if (!location.startsWith(KICK_AUTHORIZE_URL)) {
      console.error(`[oauth:kick] refused non-id host Location=${location.slice(0, 120)}`);
      return Response.redirect(
        new URL(`/login?error=oauth_failed`, `${origin}/`),
        302,
      );
    }
  }

  const headers = new Headers({ Location: location });
  headers.append("Set-Cookie", cookie(request, `oauth_state_${provider}`, state, 600));
  if (verifier) {
    headers.append("Set-Cookie", cookie(request, `oauth_verifier_${provider}`, verifier, 600));
  }
  return new Response(null, { status: 302, headers });
}

export async function handleOAuthCallback(request: Request, providerRaw: string): Promise<Response> {
  const origin = publicSiteUrl(request);
  const isProd = process.env["NODE_ENV"] === "production";
  const STABLE_ERRORS = new Set([
    "oauth_failed",
    "missing_code",
    "state_mismatch",
    "access_denied",
    "pkce_verifier_missing",
    "supabase_admin_key",
    "twitch_not_configured",
    "kick_not_configured",
    "streamelements_not_configured",
    "streamlabs_not_configured",
    "tiktok_not_configured",
  ]);
  const fail = (provider: string, reason: string, detail?: string) => {
    console.info(`[oauth:${provider}] callback fail`, {
      reason,
      detail: detail?.slice(0, 500) ?? null,
      origin,
      requestUrl: request.url,
    });
    const stable =
      STABLE_ERRORS.has(reason) || reason.endsWith("_not_configured") ? reason : "oauth_failed";
    const location = new URL(`${origin}/login`);
    location.searchParams.set("error", stable);
    // Never leak raw provider/token errors into the URL in production.
    if (!isProd && detail) {
      location.searchParams.set("detail", detail.slice(0, 120));
    }
    return new Response(null, { status: 302, headers: { Location: location.toString() } });
  };

  if (!isOAuthProvider(providerRaw)) return new Response("Unknown provider", { status: 404 });
  const provider: OAuthProvider = providerRaw;

  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    const providerError = url.searchParams.get("error")!;
    const providerDesc = url.searchParams.get("error_description") ?? undefined;
    if (providerDesc) {
      console.info(`[oauth:${provider}] provider error_description`, providerDesc.slice(0, 500));
    }
    return fail(
      provider,
      providerError === "access_denied" ? "access_denied" : "oauth_failed",
      providerDesc,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = readCookie(request, `oauth_state_${provider}`);
  if (!code) return fail(provider, "missing_code");
  if (!state || !expectedState || state !== expectedState) {
    console.error(`[oauth:${provider}] state mismatch`, {
      hasState: Boolean(state),
      hasExpectedState: Boolean(expectedState),
      cookieHeaderPresent: Boolean(request.headers.get("cookie")),
    });
    return fail(
      provider,
      "state_mismatch",
      !expectedState ? "oauth_state_cookie_missing" : "state_param_mismatch",
    );
  }

  const config = PROVIDERS[provider];
  const clientId = readOAuthEnv(config.clientIdEnv);
  const clientSecret = readOAuthEnv(config.clientSecretEnv);
  if (!clientId || !clientSecret) return fail(provider, `${provider}_not_configured`);

  const verifier = readCookie(request, `oauth_verifier_${provider}`);
  console.info(`[oauth:${provider}] callback begin`, {
    origin,
    requestUrl: request.url,
    hasCode: Boolean(code),
    hasState: Boolean(state),
    hasExpectedState: Boolean(expectedState),
    hasVerifier: Boolean(verifier),
    usesPkce: config.usesPkce,
    redirectUri: redirectUriFor(request, provider),
  });
  if (config.usesPkce && !verifier) {
    return fail(provider, "pkce_verifier_missing", "oauth_verifier_cookie_missing");
  }

  try {
    const tokens = await exchangeCode({
      provider,
      code,
      redirectUri: redirectUriFor(request, provider),
      clientId,
      clientSecret,
      verifier,
    });

    console.info(`[oauth:${provider}] profile fetch start`);
    const profile = await config.fetchProfile(tokens.access_token, clientId);
    console.info(`[oauth:${provider}] profile fetch ok`, {
      id: profile.id,
      username: profile.username,
    });

    const expiresAtIso = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    const scopeList = Array.isArray(tokens.scope)
      ? tokens.scope
      : (tokens.scope ?? config.scopes).split(" ").filter(Boolean);

    const linkedUserId = verifyLinkState(state);
    if (linkedUserId) {
      const { supabaseAdmin } = await import("@/lib/supabase/client.server");
      const socketToken =
        provider === "streamlabs" ? await fetchStreamlabsSocketToken(tokens.access_token) : null;

      const { data: priorLink, error: priorLinkError } = await supabaseAdmin
        .from("platform_connections")
        .select("id")
        .eq("user_id", linkedUserId)
        .eq("platform", config.platform)
        .limit(1);
      const { error: linkUpsertError } = await supabaseAdmin.from("platform_connections").upsert(
        {
          user_id: linkedUserId,
          platform: config.platform,
          platform_user_id: profile.id,
          username: profile.username,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token ?? null,
          scopes: scopeList,
          token_expires_at: expiresAtIso,
          is_active: true,
          metadata: {
            avatar_url: profile.image,
            source: "oauth",
            ...(profile.extra ?? {}),
            ...(socketToken ? { socket_token: socketToken } : {}),
          },
        },
        { onConflict: "user_id,platform,platform_user_id" },
      );
      if (linkUpsertError) {
        console.error(
          `[oauth:${provider}] platform_connections upsert failed`,
          formatOAuthError(linkUpsertError),
        );
      } else if (!priorLinkError && (priorLink?.length ?? 0) === 0) {
        const { notifyPlatformConnected } = await import("@/lib/connectionEmail.server");
        await notifyPlatformConnected({
          userId: linkedUserId,
          platform: config.platform,
          username: profile.username,
        });
      }

      if (provider === "kick") {
        const { ensureKickEventSubscriptions } = await import("@/lib/kickEvents.server");
        const subscriptions = await ensureKickEventSubscriptions(tokens.access_token, profile.id);
        if (!subscriptions.ok) {
          console.error("[kick-events] subscription setup failed", subscriptions.errors);
        }
      }

      if (provider === "twitch") {
        const { ensureTwitchEventSub } = await import("@/lib/twitchEventSub.server");
        const eventSub = await ensureTwitchEventSub({
          broadcasterUserId: profile.id,
          request,
        });
        if (!eventSub.ok) {
          console.error("[twitch-eventsub] subscription setup failed", eventSub.error, eventSub.results);
        }
      }

      const back = new URL(`${origin}/settings`);
      back.searchParams.set("connected", provider);
      const linkHeaders = new Headers({ Location: back.toString() });
      linkHeaders.append("Set-Cookie", cookie(request, `oauth_state_${provider}`, "", 0));
      linkHeaders.append("Set-Cookie", cookie(request, `oauth_verifier_${provider}`, "", 0));
      return new Response(null, { status: 302, headers: linkHeaders });
    }

    const email = profile.email ?? `${provider}_${profile.id}@users.${new URL(origin).hostname}`;

    const { supabaseAdmin, assertSupabaseAdminConfigured } = await import(
      "@/lib/supabase/client.server"
    );
    try {
      await assertSupabaseAdminConfigured();
    } catch (adminConfigError) {
      console.error(`[oauth:${provider}] admin key rejected`, formatOAuthError(adminConfigError));
      return fail(provider, "supabase_admin_key", formatOAuthError(adminConfigError).message);
    }

    // Resolve / create the Supabase auth user. We only need the user id here —
    // the access/refresh session is minted later in /api/auth/session/finish so
    // we never put a magic-link token_hash in a cookie (expire / encoding issues).
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        provider,
        provider_user_id: profile.id,
        username: profile.username,
        avatar_url: profile.image,
      },
    });

    let authUserId = created?.user?.id ?? null;
    if (createError && !/already/i.test(createError.message)) {
      const unregistered = /unregistered api key/i.test(createError.message);
      console.error(`[oauth:${provider}] createUser failed`, {
        ...formatOAuthError(createError),
        status: (createError as { status?: number }).status,
        code: (createError as { code?: string }).code,
        hint: unregistered
          ? "SUPABASE_SERVICE_ROLE_KEY is wrong for this project, or is a publishable/anon key. Use Dashboard → API Keys → service_role (eyJ…) or sb_secret_… matching SUPABASE_URL."
          : undefined,
      });
      if (unregistered) {
        return fail(
          provider,
          "supabase_admin_key",
          "SUPABASE_SERVICE_ROLE_KEY was rejected by Auth (Unregistered API key). Use the service_role or sb_secret_ key from the same project as SUPABASE_URL.",
        );
      }
      throw createError;
    }

    if (!authUserId) {
      // Existing user — generateLink returns the user object (OTP discarded).
      const { data: link, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (linkError || !link?.user?.id) {
        console.error(`[oauth:${provider}] resolve existing user failed`, {
          linkError: linkError?.message ?? null,
          email,
        });
        throw linkError ?? new Error("Could not resolve auth user");
      }
      authUserId = link.user.id;
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;
    const scopes = Array.isArray(tokens.scope)
      ? tokens.scope
      : (tokens.scope ?? config.scopes).split(" ").filter(Boolean);

    const { error: userUpsertError } = await supabaseAdmin.from("users").upsert(
      {
        id: authUserId,
        email,
        name: profile.username,
        image: profile.image,
      },
      { onConflict: "id" },
    );
    if (userUpsertError) {
      // Do not abort the OAuth handoff — session mint only needs authUserId.
      // createWidget / ensureUserProfile can repair the public.users row later.
      console.error(`[oauth:${provider}] users upsert failed`, formatOAuthError(userUpsertError));
    }

    const { error: accountUpsertError } = await supabaseAdmin.from("accounts").upsert(
      {
        user_id: authUserId,
        type: "oauth",
        provider,
        provider_account_id: profile.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        token_type: tokens.token_type ?? "bearer",
        scope: scopes.join(" "),
      },
      { onConflict: "provider,provider_account_id" },
    );
    if (accountUpsertError) {
      console.error(`[oauth:${provider}] accounts upsert failed`, formatOAuthError(accountUpsertError));
    }

    const { data: priorLogin, error: priorLoginError } = await supabaseAdmin
      .from("platform_connections")
      .select("id")
      .eq("user_id", authUserId)
      .eq("platform", config.platform)
      .limit(1);
    const { error: connectionUpsertError } = await supabaseAdmin.from("platform_connections").upsert(
      {
        user_id: authUserId,
        platform: config.platform,
        platform_user_id: profile.id,
        username: profile.username,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        scopes,
        token_expires_at: expiresAt,
        is_active: true,
        metadata: {
          avatar_url: profile.image,
          email,
          ...(profile.extra ?? {}),
        },
      },
      { onConflict: "user_id,platform,platform_user_id" },
    );
    if (connectionUpsertError) {
      console.error(
        `[oauth:${provider}] platform_connections upsert failed`,
        formatOAuthError(connectionUpsertError),
      );
    } else if (!priorLoginError && (priorLogin?.length ?? 0) === 0) {
      const { notifyPlatformConnected } = await import("@/lib/connectionEmail.server");
      await notifyPlatformConnected({
        userId: authUserId,
        platform: config.platform,
        username: profile.username,
      });
    }

    if (provider === "kick") {
      const { ensureKickEventSubscriptions } = await import("@/lib/kickEvents.server");
      const subscriptions = await ensureKickEventSubscriptions(tokens.access_token, profile.id);
      if (!subscriptions.ok) {
        console.error("[kick-events] subscription setup failed", subscriptions.errors);
      }
    }

    if (provider === "twitch") {
      const { ensureTwitchEventSub } = await import("@/lib/twitchEventSub.server");
      const eventSub = await ensureTwitchEventSub({
        broadcasterUserId: profile.id,
        request,
      });
      if (!eventSub.ok) {
        console.error("[twitch-eventsub] subscription setup failed", eventSub.error, eventSub.results);
      }
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: authUserId,
      action: "auth.login",
      entity: "platform_connection",
      entity_id: profile.id,
      metadata: { provider, username: profile.username },
      ip_address:
        request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? null,
    });

    const target = new URL(`${origin}/auth/callback`);
    const handoff = signSessionHandoff(authUserId, 300);
    console.info(`[oauth:${provider}] callback ok → /auth/callback (session handoff)`, {
      origin,
      target: target.toString(),
      authUserId,
      handoffLength: handoff.length,
      publicSite: origin,
    });
    const headers = new Headers({ Location: target.toString() });
    // Share Domain=.cylixstudio.com in prod (same as OAuth state) so a www/apex
    // hop cannot drop the handoff before /auth/callback → session/finish.
    headers.append("Set-Cookie", cookie(request, "oauth_session_handoff", handoff, 300));
    headers.append("Set-Cookie", cookie(request, "oauth_magic_hash", "", 0));
    headers.append("Set-Cookie", cookie(request, `oauth_state_${provider}`, "", 0));
    headers.append("Set-Cookie", cookie(request, `oauth_verifier_${provider}`, "", 0));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const formatted = formatOAuthError(error);
    console.error(`[oauth:${provider}] callback exception`, formatted);
    return fail(provider, "oauth_failed", formatted.message);
  }
}
