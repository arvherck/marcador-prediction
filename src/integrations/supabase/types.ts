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
      api_cache: {
        Row: {
          cache_key: string
          data: Json
          expires_at: string
          fetched_at: string
          id: string
        }
        Insert: {
          cache_key: string
          data: Json
          expires_at: string
          fetched_at?: string
          id?: string
        }
        Update: {
          cache_key?: string
          data?: Json
          expires_at?: string
          fetched_at?: string
          id?: string
        }
        Relationships: []
      }
      api_sync_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          description: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: []
      }
      api_usage: {
        Row: {
          calls_made: number
          date: string
          updated_at: string
        }
        Insert: {
          calls_made?: number
          date: string
          updated_at?: string
        }
        Update: {
          calls_made?: number
          date?: string
          updated_at?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          stripe_session_id: string
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          stripe_session_id: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          stripe_session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          admin_notes: string | null
          category: string
          created_at: string
          display_name: string | null
          id: string
          is_read: boolean
          message: string
          page: string | null
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          category: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_read?: boolean
          message: string
          page?: string | null
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          category?: string
          created_at?: string
          display_name?: string | null
          id?: string
          is_read?: boolean
          message?: string
          page?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      matchday_scores: {
        Row: {
          correct_first_scorers: number
          correct_results: number
          created_at: string
          exact_scores: number
          id: string
          matchday_id: number
          rank: number | null
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          correct_first_scorers?: number
          correct_results?: number
          created_at?: string
          exact_scores?: number
          id?: string
          matchday_id: number
          rank?: number | null
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          correct_first_scorers?: number
          correct_results?: number
          created_at?: string
          exact_scores?: number
          id?: string
          matchday_id?: number
          rank?: number | null
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matchday_scores_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      matchdays: {
        Row: {
          created_at: string
          id: number
          is_scored: boolean
          is_test: boolean
          name: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_scored?: boolean
          is_test?: boolean
          name: string
          starts_at: string
        }
        Update: {
          created_at?: string
          id?: number
          is_scored?: boolean
          is_test?: boolean
          name?: string
          starts_at?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          auto_populated: boolean
          away_placeholder: string | null
          away_score: number | null
          away_team: string | null
          city: string | null
          first_scorer: string | null
          group_letter: string | null
          home_placeholder: string | null
          home_score: number | null
          home_team: string | null
          host_country: string | null
          id: number
          is_final: boolean
          kickoff_at: string
          matchday_id: number
          phase: string | null
          points_multiplier: number
          stadium: string | null
          status: string
          teams_confirmed: boolean
        }
        Insert: {
          auto_populated?: boolean
          away_placeholder?: string | null
          away_score?: number | null
          away_team?: string | null
          city?: string | null
          first_scorer?: string | null
          group_letter?: string | null
          home_placeholder?: string | null
          home_score?: number | null
          home_team?: string | null
          host_country?: string | null
          id?: number
          is_final?: boolean
          kickoff_at: string
          matchday_id: number
          phase?: string | null
          points_multiplier?: number
          stadium?: string | null
          status?: string
          teams_confirmed?: boolean
        }
        Update: {
          auto_populated?: boolean
          away_placeholder?: string | null
          away_score?: number | null
          away_team?: string | null
          city?: string | null
          first_scorer?: string | null
          group_letter?: string | null
          home_placeholder?: string | null
          home_score?: number | null
          home_team?: string | null
          host_country?: string | null
          id?: number
          is_final?: boolean
          kickoff_at?: string
          matchday_id?: number
          phase?: string | null
          points_multiplier?: number
          stadium?: string | null
          status?: string
          teams_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "matches_matchday_id_fkey"
            columns: ["matchday_id"]
            isOneToOne: false
            referencedRelation: "matchdays"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          away_goals: number
          booster: boolean
          created_at: string
          first_scorer: string
          home_goals: number
          id: number
          match_id: number
          points: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          away_goals: number
          booster?: boolean
          created_at?: string
          first_scorer: string
          home_goals: number
          id?: number
          match_id: number
          points?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          away_goals?: number
          booster?: boolean
          created_at?: string
          first_scorer?: string
          home_goals?: number
          id?: number
          match_id?: number
          points?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_confirmed: boolean
          consent_recorded_at: string | null
          country: string
          created_at: string
          current_streak: number
          display_name: string
          donor: boolean
          favourite_team: string
          longest_streak: number
          privacy_accepted: boolean
          theme_preference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age_confirmed?: boolean
          consent_recorded_at?: string | null
          country: string
          created_at?: string
          current_streak?: number
          display_name: string
          donor?: boolean
          favourite_team: string
          longest_streak?: number
          privacy_accepted?: boolean
          theme_preference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age_confirmed?: boolean
          consent_recorded_at?: string | null
          country?: string
          created_at?: string
          current_streak?: number
          display_name?: string
          donor?: boolean
          favourite_team?: string
          longest_streak?: number
          privacy_accepted?: boolean
          theme_preference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      test_users: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      tournament_predictions: {
        Row: {
          created_at: string
          id: string
          points_awarded: number | null
          predicted_winner: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points_awarded?: number | null
          predicted_winner: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points_awarded?: number | null
          predicted_winner?: string
          user_id?: string
        }
        Relationships: []
      }
      tournament_settings: {
        Row: {
          actual_winner: string | null
          id: number
          predictions_locked: boolean
          updated_at: string
        }
        Insert: {
          actual_winner?: string | null
          id?: number
          predictions_locked?: boolean
          updated_at?: string
        }
        Update: {
          actual_winner?: string | null
          id?: number
          predictions_locked?: boolean
          updated_at?: string
        }
        Relationships: []
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
      wc_groups: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      wc_standings: {
        Row: {
          drawn: number
          goal_difference: number | null
          goals_against: number
          goals_for: number
          group_id: number
          id: string
          lost: number
          played: number
          points: number | null
          red_cards: number
          team: string
          updated_at: string
          won: number
          yellow_cards: number
        }
        Insert: {
          drawn?: number
          goal_difference?: number | null
          goals_against?: number
          goals_for?: number
          group_id: number
          id?: string
          lost?: number
          played?: number
          points?: number | null
          red_cards?: number
          team: string
          updated_at?: string
          won?: number
          yellow_cards?: number
        }
        Update: {
          drawn?: number
          goal_difference?: number | null
          goals_against?: number
          goals_for?: number
          group_id?: number
          id?: string
          lost?: number
          played?: number
          points?: number | null
          red_cards?: number
          team?: string
          updated_at?: string
          won?: number
          yellow_cards?: number
        }
        Relationships: [
          {
            foreignKeyName: "wc_standings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "wc_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          country: string | null
          display_name: string | null
          user_id: string | null
        }
        Insert: {
          country?: string | null
          display_name?: string | null
          user_id?: string | null
        }
        Update: {
          country?: string | null
          display_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _random_test_scoreline: {
        Args: never
        Returns: {
          away_goals: number
          first_scorer: string
          home_goals: number
        }[]
      }
      add_test_users_to_league: {
        Args: { _caller_id: string; _league_id: string }
        Returns: number
      }
      admin_diag: {
        Args: { _arg: string; _caller_id: string; _kind: string }
        Returns: Json
      }
      cascade_knockout_winners: { Args: { _caller_id: string }; Returns: Json }
      clear_test_scores: {
        Args: { _caller_id: string; _matchday_id?: number; _scope: string }
        Returns: Json
      }
      create_test_user_predictions: {
        Args: { _caller_id: string; _matchday_id: number; _user_id: string }
        Returns: number
      }
      delete_my_account: { Args: { _user_id: string }; Returns: undefined }
      delete_test_users: {
        Args: { _caller_id: string }
        Returns: {
          user_id: string
        }[]
      }
      feedback_unread_count: { Args: never; Returns: number }
      fill_random_scores: {
        Args: { _caller_id: string; _matchday_id?: number; _scope: string }
        Returns: Json
      }
      fill_test_predictions: { Args: { _caller_id: string }; Returns: Json }
      find_league_by_code: { Args: { _code: string }; Returns: string }
      global_leaderboard: {
        Args: { _league_id?: string }
        Returns: {
          correct_first_scorers: number
          correct_results: number
          country: string
          current_streak: number
          display_name: string
          exact_scores: number
          favourite_team: string
          id: string
          last_md_points: number
          rank: number
          scored_predictions: number
          total_points: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_league_member: {
        Args: { _league_id: string; _user_id: string }
        Returns: boolean
      }
      matchday_leaderboard: {
        Args: { _league_id?: string; _matchday_id?: number }
        Returns: {
          correct_first_scorers: number
          correct_results: number
          country: string
          display_name: string
          exact_scores: number
          favourite_team: string
          id: string
          matchday_id: number
          matchday_name: string
          rank: number
          total_points: number
        }[]
      }
      my_leagues: {
        Args: never
        Returns: {
          id: string
          invite_code: string
          member_count: number
          my_points: number
          my_rank: number
          name: string
          owner_id: string
        }[]
      }
      phase_default_multiplier: { Args: { _phase: string }; Returns: number }
      populate_knockout_brackets: {
        Args: { _caller_id: string; _third_assignment?: Json }
        Returns: Json
      }
      recalculate_team_standing: { Args: { _team: string }; Returns: undefined }
      reset_knockout_match: {
        Args: { _caller_id: string; _match_id: number }
        Returns: undefined
      }
      resolve_knockout_placeholder: {
        Args: { _label: string; _runners: Json; _thirds: Json; _winners: Json }
        Returns: string
      }
      run_test_cycle: { Args: { _caller_id: string }; Returns: Json }
      score_match: {
        Args: { _caller_id: string; _match_id: number }
        Returns: number
      }
      score_matchday: {
        Args: { _caller_id: string; _matchday_id: number }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
    },
  },
} as const
