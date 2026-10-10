import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/media-request/$token/live")({ server: { handlers: { GET: async ({ params }) => {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data: settings } = await supabaseAdmin.from("media_request_settings").select("user_id,display_mode,player_layout,volume").eq("overlay_token",params.token).maybeSingle();
  if (!settings) return Response.json({error:"overlay_not_found"},{status:404});
  const { userHasActivePro } = await import("@/lib/subscription.server");
  if (!(await userHasActivePro(supabaseAdmin, settings.user_id))) return Response.json({error:"overlay_not_found"},{status:404});
  const { data: playback } = await supabaseAdmin.from("media_playback_state").select("*").eq("user_id",settings.user_id).maybeSingle();
  let current = null;
  if (playback?.current_request_id) {
    const { data } = await supabaseAdmin.from("media_requests").select("id,platform,artist,youtube_video_id,youtube_url,title,requester_username,requester_avatar_url,duration_seconds,thumbnail_url").eq("id",playback.current_request_id).maybeSingle(); current = data;
  }
  return Response.json({settings,playback,current},{headers:{"Cache-Control":"no-store"}});
} } } });
