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
      model_supervised: {
        Row: {
          id: string
          model_state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          model_state: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          model_state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      model_weights: {
        Row: {
          anti_trap_strength: number
          draw_bias: number
          ext_boost: number
          form_weight: number
          history_weight: number
          home_advantage: number
          id: string
          lambda_boost: number
          odds_weight: number
          updated_at: string
          user_id: string
        }
        Insert: {
          anti_trap_strength?: number
          draw_bias?: number
          ext_boost?: number
          form_weight?: number
          history_weight?: number
          home_advantage?: number
          id?: string
          lambda_boost?: number
          odds_weight?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          anti_trap_strength?: number
          draw_bias?: number
          ext_boost?: number
          form_weight?: number
          history_weight?: number
          home_advantage?: number
          id?: string
          lambda_boost?: number
          odds_weight?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prediction_history: {
        Row: {
          away_team: string
          confidence: number
          created_at: string
          event_category_id: string | null
          home_team: string
          id: string
          is_validated: boolean
          match_time: string | null
          odds_away: number
          odds_draw: number
          odds_home: number
          prediction_data: Json
          real_score_away: number | null
          real_score_home: number | null
          round_number: number | null
          score_away: number
          score_home: number
          user_id: string
          value_bet: string | null
          value_bet_odds: number | null
          value_bet_proba: number | null
          win_prob: number
          winner: string
          winner_label: string
        }
        Insert: {
          away_team: string
          confidence: number
          created_at?: string
          event_category_id?: string | null
          home_team: string
          id?: string
          is_validated?: boolean
          match_time?: string | null
          odds_away: number
          odds_draw: number
          odds_home: number
          prediction_data?: Json
          real_score_away?: number | null
          real_score_home?: number | null
          round_number?: number | null
          score_away: number
          score_home: number
          user_id: string
          value_bet?: string | null
          value_bet_odds?: number | null
          value_bet_proba?: number | null
          win_prob: number
          winner: string
          winner_label: string
        }
        Update: {
          away_team?: string
          confidence?: number
          created_at?: string
          event_category_id?: string | null
          home_team?: string
          id?: string
          is_validated?: boolean
          match_time?: string | null
          odds_away?: number
          odds_draw?: number
          odds_home?: number
          prediction_data?: Json
          real_score_away?: number | null
          real_score_home?: number | null
          round_number?: number | null
          score_away?: number
          score_home?: number
          user_id?: string
          value_bet?: string | null
          value_bet_odds?: number | null
          value_bet_proba?: number | null
          win_prob?: number
          winner?: string
          winner_label?: string
        }
        Relationships: []
      }
      team_memory: {
        Row: {
          avg_goals_diff: number
          id: string
          overperform_count: number
          team_name: string
          total_matches: number
          trap_count: number
          underperform_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_goals_diff?: number
          id?: string
          overperform_count?: number
          team_name: string
          total_matches?: number
          trap_count?: number
          underperform_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_goals_diff?: number
          id?: string
          overperform_count?: number
          team_name?: string
          total_matches?: number
          trap_count?: number
          underperform_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_config: {
        Row: {
          default_season: string | null
          event_category_id: string | null
          id: string
          league_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          default_season?: string | null
          event_category_id?: string | null
          id?: string
          league_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          default_season?: string | null
          event_category_id?: string | null
          id?: string
          league_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
