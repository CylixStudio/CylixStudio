export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: number | null
          id: string
          id_token: string | null
          provider: string
          provider_account_id: string
          refresh_token: string | null
          scope: string | null
          session_state: string | null
          token_type: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: number | null
          id?: string
          id_token?: string | null
          provider: string
          provider_account_id: string
          refresh_token?: string | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: number | null
          id?: string
          id_token?: string | null
          provider?: string
          provider_account_id?: string
          refresh_token?: string | null
          scope?: string | null
          session_state?: string | null
          token_type?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_codes: {
        Row: {
          code: string
          code_expires_at: string | null
          created_at: string
          created_by: string | null
          duration_days: number
          id: string
          is_active: boolean
          is_revoked: boolean
          is_used: boolean
          notes: string | null
          purchase_id: string | null
          purchaser_user_id: string | null
          redeemed_at: string | null
          redeemed_by_email: string | null
          revoked_at: string | null
          source: string
          used_by_user_id: string | null
        }
        Insert: {
          code: string
          code_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          is_revoked?: boolean
          is_used?: boolean
          notes?: string | null
          purchase_id?: string | null
          purchaser_user_id?: string | null
          redeemed_at?: string | null
          redeemed_by_email?: string | null
          revoked_at?: string | null
          source?: string
          used_by_user_id?: string | null
        }
        Update: {
          code?: string
          code_expires_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          is_revoked?: boolean
          is_used?: boolean
          notes?: string | null
          purchase_id?: string | null
          purchaser_user_id?: string | null
          redeemed_at?: string | null
          redeemed_by_email?: string | null
          revoked_at?: string | null
          source?: string
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_codes_purchaser_user_id_fkey"
            columns: ["purchaser_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_codes_used_by_user_id_fkey"
            columns: ["used_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_purchases: {
        Row: {
          activation_code_id: string | null
          activated_at: string | null
          amount_cents: number | null
          billing_interval: string
          code_delivered_at: string | null
          created_at: string
          currency: string
          duration_days: number
          email: string
          gift_message: string | null
          gift_recipient_email: string | null
          id: string
          metadata: Json
          provider: string
          provider_payment_id: string
          purchase_type: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          activation_code_id?: string | null
          activated_at?: string | null
          amount_cents?: number | null
          billing_interval: string
          code_delivered_at?: string | null
          created_at?: string
          currency?: string
          duration_days: number
          email: string
          gift_message?: string | null
          gift_recipient_email?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_payment_id: string
          purchase_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          activation_code_id?: string | null
          activated_at?: string | null
          amount_cents?: number | null
          billing_interval?: string
          code_delivered_at?: string | null
          created_at?: string
          currency?: string
          duration_days?: number
          email?: string
          gift_message?: string | null
          gift_recipient_email?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_payment_id?: string
          purchase_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          ip_address: string | null
          metadata: Json
          subathon_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          subathon_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          subathon_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_subathon_id_fkey"
            columns: ["subathon_id"]
            isOneToOne: false
            referencedRelation: "subathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_command_settings: {
        Row: {
          created_at: string
          default_length: number
          enabled: boolean
          max_length: number
          response: string
          roles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_length?: number
          enabled?: boolean
          max_length?: number
          response?: string
          roles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_length?: number
          enabled?: boolean
          max_length?: number
          response?: string
          roles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clips: {
        Row: {
          clipped_by: string
          clipped_by_platform_id: string | null
          created_at: string
          duration_seconds: number
          external_id: string | null
          id: string
          platform: Database["public"]["Enums"]["platform_type"]
          share_url: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          url: string
          user_id: string
          view_count: number
        }
        Insert: {
          clipped_by?: string
          clipped_by_platform_id?: string | null
          created_at?: string
          duration_seconds?: number
          external_id?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          share_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url: string
          user_id: string
          view_count?: number
        }
        Update: {
          clipped_by?: string
          clipped_by_platform_id?: string | null
          created_at?: string
          duration_seconds?: number
          external_id?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          share_url?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
          view_count?: number
        }
        Relationships: []
      }
      custom_chat_command_settings: {
        Row: {
          created_at: string
          default_prefix: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_prefix?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_prefix?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_chat_commands: {
        Row: {
          cooldown_seconds: number
          created_at: string
          enabled: boolean
          id: string
          name: string
          platforms: string[]
          prefix: string | null
          response: string
          roles: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          platforms?: string[]
          prefix?: string | null
          response: string
          roles?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          cooldown_seconds?: number
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          platforms?: string[]
          prefix?: string | null
          response?: string
          roles?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      default_chat_commands: {
        Row: {
          command_id: string
          cooldown_seconds: number
          enabled: boolean
          fallback_response: string
          platforms: string[]
          response: string
          updated_at: string
          user_id: string
        }
        Insert: {
          command_id: string
          cooldown_seconds?: number
          enabled?: boolean
          fallback_response?: string
          platforms?: string[]
          response: string
          updated_at?: string
          user_id: string
        }
        Update: {
          command_id?: string
          cooldown_seconds?: number
          enabled?: boolean
          fallback_response?: string
          platforms?: string[]
          response?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          actor_name: string | null
          actor_platform_id: string | null
          amount: number | null
          created_at: string
          currency: string | null
          event_type: Database["public"]["Enums"]["rule_event_type"]
          id: string
          platform: Database["public"]["Enums"]["platform_type"]
          processed_at: string | null
          provider_event_id: string | null
          quantity: number
          raw_payload: Json
          seconds_added: number
          subathon_id: string
        }
        Insert: {
          actor_name?: string | null
          actor_platform_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: Database["public"]["Enums"]["rule_event_type"]
          id?: string
          platform: Database["public"]["Enums"]["platform_type"]
          processed_at?: string | null
          provider_event_id?: string | null
          quantity?: number
          raw_payload?: Json
          seconds_added?: number
          subathon_id: string
        }
        Update: {
          actor_name?: string | null
          actor_platform_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: Database["public"]["Enums"]["rule_event_type"]
          id?: string
          platform?: Database["public"]["Enums"]["platform_type"]
          processed_at?: string | null
          provider_event_id?: string | null
          quantity?: number
          raw_payload?: Json
          seconds_added?: number
          subathon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_subathon_id_fkey"
            columns: ["subathon_id"]
            isOneToOne: false
            referencedRelation: "subathons"
            referencedColumns: ["id"]
          },
        ]
      }
      giveaway_participants: {
        Row: {
          created_at: string
          entries: number
          id: string
          is_subscriber: boolean
          platform: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          entries?: number
          id?: string
          is_subscriber?: boolean
          platform: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          entries?: number
          id?: string
          is_subscriber?: boolean
          platform?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      giveaway_settings: {
        Row: {
          claim_seconds: number
          draw_state: Json | null
          is_open: boolean
          keyword: string
          last_winner: Json | null
          overlay_token: string
          spin_duration: number
          sub_multiplier: number
          subs_only: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          claim_seconds?: number
          draw_state?: Json | null
          is_open?: boolean
          keyword?: string
          last_winner?: Json | null
          overlay_token?: string
          spin_duration?: number
          sub_multiplier?: number
          subs_only?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          claim_seconds?: number
          draw_state?: Json | null
          is_open?: boolean
          keyword?: string
          last_winner?: Json | null
          overlay_token?: string
          spin_duration?: number
          sub_multiplier?: number
          subs_only?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_value: number
          id: string
          target_value: number
          title: string
          unit: string
          updated_at: string
          user_id: string
          widget_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          id?: string
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
          user_id: string
          widget_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          id?: string
          target_value?: number
          title?: string
          unit?: string
          updated_at?: string
          user_id?: string
          widget_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: true
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      kick_stream_buffers: {
        Row: {
          segments: Json
          slug: string
          updated_at: string
          user_id: string
          variant_refreshed_at: string | null
          variant_url: string | null
        }
        Insert: {
          segments?: Json
          slug: string
          updated_at?: string
          user_id: string
          variant_refreshed_at?: string | null
          variant_url?: string | null
        }
        Update: {
          segments?: Json
          slug?: string
          updated_at?: string
          user_id?: string
          variant_refreshed_at?: string | null
          variant_url?: string | null
        }
        Relationships: []
      }
      link_in_bio_links: {
        Row: {
          card_size: string
          col_span: number
          created_at: string
          enabled: boolean
          featured: boolean
          gallery_images: unknown
          grid_x: number
          grid_y: number
          id: string
          kind: string
          platform: string
          row_span: number
          sort_order: number
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          card_size?: string
          col_span?: number
          created_at?: string
          enabled?: boolean
          featured?: boolean
          gallery_images?: unknown
          grid_x?: number
          grid_y?: number
          id?: string
          kind?: string
          platform?: string
          row_span?: number
          sort_order?: number
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          card_size?: string
          col_span?: number
          created_at?: string
          enabled?: boolean
          featured?: boolean
          gallery_images?: unknown
          grid_x?: number
          grid_y?: number
          id?: string
          kind?: string
          platform?: string
          row_span?: number
          sort_order?: number
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      link_in_bio_profiles: {
        Row: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          header_url: string
          published: boolean
          published_at: string | null
          setup_completed: boolean
          slug: string
          updated_at: string
          user_id: string
          username_changed_at: string | null
        }
        Insert: {
          avatar_url?: string
          bio?: string
          created_at?: string
          display_name?: string
          header_url?: string
          published?: boolean
          published_at?: string | null
          setup_completed?: boolean
          slug: string
          updated_at?: string
          user_id: string
          username_changed_at?: string | null
        }
        Update: {
          avatar_url?: string
          bio?: string
          created_at?: string
          display_name?: string
          header_url?: string
          published?: boolean
          published_at?: string | null
          setup_completed?: boolean
          slug?: string
          updated_at?: string
          user_id?: string
          username_changed_at?: string | null
        }
        Relationships: []
      }
      link_in_bio_themes: {
        Row: {
          ambient_enabled: boolean
          ambient_preset: string
          bento_color_mode: string
          bento_custom_accent: string
          bento_custom_fill: string
          countdown_enabled: boolean
          countdown_ends_at: string | null
          countdown_label: string
          created_at: string
          default_card_size: string
          font_family: string
          font_custom_href: string
          font_custom_name: string
          glass_intensity: number
          glow_strength: number
          gradient_style: string
          hairline_borders: boolean
          layout: string
          palette_accent: string
          palette_bg: string
          palette_fg: string
          palette_muted: string
          schedule_enabled: boolean
          surface_style: string
          updated_at: string
          user_id: string
          widget_banner_url: string
        }
        Insert: {
          ambient_enabled?: boolean
          ambient_preset?: string
          bento_color_mode?: string
          bento_custom_accent?: string
          bento_custom_fill?: string
          countdown_enabled?: boolean
          countdown_ends_at?: string | null
          countdown_label?: string
          created_at?: string
          default_card_size?: string
          font_family?: string
          font_custom_href?: string
          font_custom_name?: string
          glass_intensity?: number
          glow_strength?: number
          gradient_style?: string
          hairline_borders?: boolean
          layout?: string
          palette_accent?: string
          palette_bg?: string
          palette_fg?: string
          palette_muted?: string
          schedule_enabled?: boolean
          surface_style?: string
          updated_at?: string
          user_id: string
          widget_banner_url?: string
        }
        Update: {
          ambient_enabled?: boolean
          ambient_preset?: string
          bento_color_mode?: string
          bento_custom_accent?: string
          bento_custom_fill?: string
          countdown_enabled?: boolean
          countdown_ends_at?: string | null
          countdown_label?: string
          created_at?: string
          default_card_size?: string
          font_family?: string
          font_custom_href?: string
          font_custom_name?: string
          glass_intensity?: number
          glow_strength?: number
          gradient_style?: string
          hairline_borders?: boolean
          layout?: string
          palette_accent?: string
          palette_bg?: string
          palette_fg?: string
          palette_muted?: string
          schedule_enabled?: boolean
          surface_style?: string
          updated_at?: string
          user_id?: string
          widget_banner_url?: string
        }
        Relationships: []
      }
      media_playback_state: {
        Row: {
          created_at: string
          current_request_id: string | null
          playback_status: string
          position_seconds: number
          revision: number
          started_at: string | null
          updated_at: string
          user_id: string
          volume: number
        }
        Insert: {
          created_at?: string
          current_request_id?: string | null
          playback_status?: string
          position_seconds?: number
          revision?: number
          started_at?: string | null
          updated_at?: string
          user_id: string
          volume?: number
        }
        Update: {
          created_at?: string
          current_request_id?: string | null
          playback_status?: string
          position_seconds?: number
          revision?: number
          started_at?: string | null
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_playback_state_current_request_id_fkey"
            columns: ["current_request_id"]
            isOneToOne: false
            referencedRelation: "media_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_playback_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      media_request_settings: {
        Row: {
          created_at: string
          display_mode: string
          id: string
          keyword_blacklist: string[]
          kick_reward_id: string | null
          max_duration_seconds: number
          min_view_count: number
          mod_token: string
          overlay_token: string
          player_layout: string
          request_mode: string
          require_approval: boolean
          updated_at: string
          user_blacklist: string[]
          user_id: string
          volume: number
        }
        Insert: {
          created_at?: string
          display_mode?: string
          id?: string
          keyword_blacklist?: string[]
          kick_reward_id?: string | null
          max_duration_seconds?: number
          min_view_count?: number
          mod_token?: string
          overlay_token?: string
          player_layout?: string
          request_mode?: string
          require_approval?: boolean
          updated_at?: string
          user_blacklist?: string[]
          user_id: string
          volume?: number
        }
        Update: {
          created_at?: string
          display_mode?: string
          id?: string
          keyword_blacklist?: string[]
          kick_reward_id?: string | null
          max_duration_seconds?: number
          min_view_count?: number
          mod_token?: string
          overlay_token?: string
          player_layout?: string
          request_mode?: string
          require_approval?: boolean
          updated_at?: string
          user_blacklist?: string[]
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_request_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      media_requests: {
        Row: {
          approved_at: string | null
          created_at: string
          duration_seconds: number
          id: string
          played_at: string | null
          position: number | null
          provider_event_id: string | null
          refunded_at: string | null
          rejection_reason: string | null
          requester_avatar_url: string | null
          requester_platform_id: string | null
          requester_username: string
          reward_id: string | null
          reward_redemption_id: string | null
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          view_count: number | null
          youtube_url: string
          youtube_video_id: string
          platform: string
          artist: string | null
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          duration_seconds: number
          id?: string
          played_at?: string | null
          position?: number | null
          provider_event_id?: string | null
          refunded_at?: string | null
          rejection_reason?: string | null
          requester_avatar_url?: string | null
          requester_platform_id?: string | null
          requester_username: string
          reward_id?: string | null
          reward_redemption_id?: string | null
          status?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
          view_count?: number | null
          youtube_url: string
          youtube_video_id: string
          platform?: string
          artist?: string | null
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          played_at?: string | null
          position?: number | null
          provider_event_id?: string | null
          refunded_at?: string | null
          rejection_reason?: string | null
          requester_avatar_url?: string | null
          requester_platform_id?: string | null
          requester_username?: string
          reward_id?: string | null
          reward_redemption_id?: string | null
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number | null
          youtube_url?: string
          youtube_video_id?: string
          platform?: string
          artist?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_point_settings: {
        Row: {
          cached_staff: string[]
          created_at: string
          kick_username: string
          share_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cached_staff?: string[]
          created_at?: string
          kick_username?: string
          share_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cached_staff?: string[]
          created_at?: string
          kick_username?: string
          share_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mark_point_allowlist: {
        Row: {
          created_at: string
          id: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      message_timers: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          interval_minutes: number
          last_sent_at: string | null
          message: string
          platforms: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_sent_at?: string | null
          message: string
          platforms?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_sent_at?: string | null
          message?: string
          platforms?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      overlays: {
        Row: {
          created_at: string
          id: string
          is_public: boolean
          name: string
          public_token: string
          subathon_id: string
          theme: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          public_token?: string
          subathon_id: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          public_token?: string
          subathon_id?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlays_subathon_id_fkey"
            columns: ["subathon_id"]
            isOneToOne: false
            referencedRelation: "subathons"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          platform: Database["public"]["Enums"]["platform_type"]
          platform_user_id: string | null
          refresh_token: string | null
          scopes: string[]
          token_expires_at: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          platform: Database["public"]["Enums"]["platform_type"]
          platform_user_id?: string | null
          refresh_token?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          platform?: Database["public"]["Enums"]["platform_type"]
          platform_user_id?: string | null
          refresh_token?: string | null
          scopes?: string[]
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["rule_event_type"]
          goal_increment: number
          id: string
          is_enabled: boolean
          max_seconds_per_event: number | null
          min_amount: number | null
          platform: Database["public"]["Enums"]["platform_type"]
          priority: number
          seconds_per_unit: number
          subathon_id: string
          unit_amount: number
          updated_at: string
          widget_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["rule_event_type"]
          goal_increment?: number
          id?: string
          is_enabled?: boolean
          max_seconds_per_event?: number | null
          min_amount?: number | null
          platform?: Database["public"]["Enums"]["platform_type"]
          priority?: number
          seconds_per_unit?: number
          subathon_id: string
          unit_amount?: number
          updated_at?: string
          widget_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["rule_event_type"]
          goal_increment?: number
          id?: string
          is_enabled?: boolean
          max_seconds_per_event?: number | null
          min_amount?: number | null
          platform?: Database["public"]["Enums"]["platform_type"]
          priority?: number
          seconds_per_unit?: number
          subathon_id?: string
          unit_amount?: number
          updated_at?: string
          widget_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_subathon_id_fkey"
            columns: ["subathon_id"]
            isOneToOne: false
            referencedRelation: "subathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_widget_id_fkey"
            columns: ["widget_id"]
            isOneToOne: false
            referencedRelation: "widgets"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          expires: string
          id: string
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires: string
          id?: string
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires?: string
          id?: string
          session_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_marks: {
        Row: {
          author: string
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          note: string
          offline: boolean
          status: string
          source: string
          started_at: string
          stream_started_at: string | null
          updated_at: string
          uptime_end_seconds: number | null
          uptime_start_seconds: number | null
          user_id: string
          viewer_is_mod: boolean
        }
        Insert: {
          author?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          note?: string
          offline?: boolean
          status?: string
          source?: string
          started_at?: string
          stream_started_at?: string | null
          updated_at?: string
          uptime_end_seconds?: number | null
          uptime_start_seconds?: number | null
          user_id: string
          viewer_is_mod?: boolean
        }
        Update: {
          author?: string
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          note?: string
          offline?: boolean
          status?: string
          source?: string
          started_at?: string
          stream_started_at?: string | null
          updated_at?: string
          uptime_end_seconds?: number | null
          uptime_start_seconds?: number | null
          user_id?: string
          viewer_is_mod?: boolean
        }
        Relationships: []
      }
      stream_schedule_settings: {
        Row: {
          created_at: string
          reminder_note: string
          share_token: string
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reminder_note?: string
          share_token?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          reminder_note?: string
          share_token?: string
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stream_schedule_slots: {
        Row: {
          cover_url: string
          created_at: string
          duration_minutes: number
          enabled: boolean
          game: string
          id: string
          notes: string
          occurs_on: string | null
          start_minutes: number
          title: string
          updated_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          cover_url?: string
          created_at?: string
          duration_minutes?: number
          enabled?: boolean
          game?: string
          id?: string
          notes?: string
          occurs_on?: string | null
          start_minutes: number
          title: string
          updated_at?: string
          user_id: string
          weekday: number
        }
        Update: {
          cover_url?: string
          created_at?: string
          duration_minutes?: number
          enabled?: boolean
          game?: string
          id?: string
          notes?: string
          occurs_on?: string | null
          start_minutes?: number
          title?: string
          updated_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: []
      }
      subathons: {
        Row: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          initial_seconds: number
          is_active: boolean
          max_duration_seconds: number | null
          settings: Json
          slug: string
          starts_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          initial_seconds?: number
          is_active?: boolean
          max_duration_seconds?: number | null
          settings?: Json
          slug: string
          starts_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          initial_seconds?: number
          is_active?: boolean
          max_duration_seconds?: number | null
          settings?: Json
          slug?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subathons_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_states: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          last_tick_at: string | null
          paused_at: string | null
          remaining_seconds: number
          started_at: string | null
          status: Database["public"]["Enums"]["timer_status"]
          subathon_id: string
          total_added_seconds: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_tick_at?: string | null
          paused_at?: string | null
          remaining_seconds?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["timer_status"]
          subathon_id: string
          total_added_seconds?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          last_tick_at?: string | null
          paused_at?: string | null
          remaining_seconds?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["timer_status"]
          subathon_id?: string
          total_added_seconds?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_states_subathon_id_fkey"
            columns: ["subathon_id"]
            isOneToOne: true
            referencedRelation: "subathons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          active_code: string | null
          created_at: string
          expires_at: string | null
          is_lifetime: boolean
          subscription_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_code?: string | null
          created_at?: string
          expires_at?: string | null
          is_lifetime?: boolean
          subscription_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_code?: string | null
          created_at?: string
          expires_at?: string | null
          is_lifetime?: boolean
          subscription_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          image: string | null
          name: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          image?: string | null
          name?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          image?: string | null
          name?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      widgets: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_enabled: boolean
          name: string
          public_token: string
          state: Json
          subathon_id: string | null
          type: Database["public"]["Enums"]["widget_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          public_token?: string
          state?: Json
          subathon_id?: string | null
          type?: Database["public"]["Enums"]["widget_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_enabled?: boolean
          name?: string
          public_token?: string
          state?: Json
          subathon_id?: string | null
          type?: Database["public"]["Enums"]["widget_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widgets_subathon_id_fkey"
            columns: ["subathon_id"]
            isOneToOne: false
            referencedRelation: "subathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_goal_increment: {
        Args: { p_amount: number; p_widget_id: string }
        Returns: number
      }
      apply_timer_seconds: {
        Args: { p_seconds: number; p_subathon_id: string }
        Returns: {
          created_at: string
          expires_at: string | null
          id: string
          last_tick_at: string | null
          paused_at: string | null
          remaining_seconds: number
          started_at: string | null
          status: Database["public"]["Enums"]["timer_status"]
          subathon_id: string
          total_added_seconds: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "timer_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_activation_code: {
        Args: { p_duration_days: number; p_notes?: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      overlay_stream_events: {
        Args: { p_limit: number; p_subathon: string }
        Returns: {
          actor_name: string
          amount: number
          created_at: string
          currency: string
          event_type: string
          id: string
          platform: Database["public"]["Enums"]["platform_type"]
          quantity: number
          seconds_added: number
        }[]
      }
      overlay_tiktok_tap_total: {
        Args: { p_subathon: string }
        Returns: number
      }
      overlay_tiktok_tappers: {
        Args: { p_limit: number; p_subathon: string }
        Returns: {
          actor_key: string
          actor_name: string
          avatar_url: string
          last_tap_at: string
          taps: number
        }[]
      }
      redeem_activation_code: { Args: { p_code: string }; Returns: Json }
      revoke_activation_code: { Args: { p_code_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
      platform_type:
        | "TWITCH"
        | "KICK"
        | "STREAMELEMENTS"
        | "STREAMLABS"
        | "MANUAL"
        | "TIKTOK"
        | "YOUTUBE"
        | "X"
      rule_event_type:
        | "FOLLOW"
        | "SUBSCRIPTION"
        | "GIFT_SUB"
        | "BITS"
        | "DONATION"
        | "RAID"
        | "LIKE"
      timer_status: "IDLE" | "RUNNING" | "PAUSED" | "ENDED"
      widget_type:
        | "SUBATHON_TIMER"
        | "GOAL_BAR"
        | "ALERT_BOX"
        | "CHAT_BOX"
        | "SPIN_WHEEL"
        | "EMOTE_RAIN"
        | "CHAT_SPOTLIGHT"
        | "STREAM_EVENTS_SCHEDULE"
        | "TIKTOK_TAPPERS"
        | "TIKTOK_TAP_GOAL"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      platform_type: [
        "TWITCH",
        "KICK",
        "STREAMELEMENTS",
        "STREAMLABS",
        "MANUAL",
        "TIKTOK",
        "YOUTUBE",
        "X",
      ],
      rule_event_type: [
        "FOLLOW",
        "SUBSCRIPTION",
        "GIFT_SUB",
        "BITS",
        "DONATION",
        "RAID",
        "LIKE",
      ],
      timer_status: ["IDLE", "RUNNING", "PAUSED", "ENDED"],
      widget_type: [
        "SUBATHON_TIMER",
        "GOAL_BAR",
        "ALERT_BOX",
        "CHAT_BOX",
        "SPIN_WHEEL",
        "EMOTE_RAIN",
        "CHAT_SPOTLIGHT",
        "STREAM_EVENTS_SCHEDULE",
        "TIKTOK_TAPPERS",
        "TIKTOK_TAP_GOAL",
      ],
    },
  },
} as const
