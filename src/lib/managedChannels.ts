export type ManagedChannel = {
  ownerUserId: string;
  name: string | null;
  image: string | null;
  role: "moderator" | "granted";
  canOpen: boolean;
};

export type ManagedChannelMenu = {
  account: { name: string | null; image: string | null };
  channels: ManagedChannel[];
};

export type GrantedWorkspace = {
  profile: {
    name: string | null;
    email: string | null;
    image: string | null;
    timezone: string | null;
    default_platform: string | null;
  } | null;
  connections: Array<{
    id: string;
    platform: string;
    username: string | null;
    is_active: boolean;
    token_expires_at: string | null;
    scopes: string[];
    platform_user_id: string | null;
    metadata: Record<string, never>;
    created_at: string;
  }>;
  subathons: Array<{
    id: string;
    title: string;
    slug: string;
    is_active: boolean;
    max_duration_seconds: number | null;
    initial_seconds: number;
    overlays: { public_token: string; is_public: boolean }[];
  }>;
};
