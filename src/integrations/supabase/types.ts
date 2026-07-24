export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          business_name: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
          phone: string;
          profession: string | null;
          quiz_answers: Json | null;
          updated_at: string;
        };
        Insert: {
          business_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone: string;
          profession?: string | null;
          quiz_answers?: Json | null;
          updated_at?: string;
        };
        Update: {
          business_name?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          phone?: string;
          profession?: string | null;
          quiz_answers?: Json | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_activity: {
        Row: {
          id: string;
          profile_id: string | null;
          session_key: string | null;
          event_type: string;
          property_slug: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          session_key?: string | null;
          event_type: string;
          property_slug?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          session_key?: string | null;
          event_type?: string;
          property_slug?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_profiles: {
        Row: {
          id: string;
          role: "owner" | "developer";
          email: string;
          full_name: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role: "owner" | "developer";
          email: string;
          full_name?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: "owner" | "developer";
          email?: string;
          full_name?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          slug: string;
          name: string;
          developer: string | null;
          category: string;
          tagline: string | null;
          image_url: string | null;
          size: string | null;
          size_numeric: number | null;
          super_built_up_area: string | null;
          carpet_area: string | null;
          location: string | null;
          state: string | null;
          city: string | null;
          status: string | null;
          configuration_summary: string | null;
          configurations: Json;
          price_summary: string | null;
          possession: string | null;
          amenities: string[];
          advantages: string[];
          gallery: Json;
          expert_note: string | null;
          is_published: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          plot_size: string | null;
          total_towers: number | null;
          total_floors: number | null;
          units_per_floor: number | null;
          total_units: number | null;
          available_bhk_types: string | null;
          rera_id: string | null;
          rera_url: string | null;
          proposed_start_date_rera: string | null;
          parking_levels: number | null;
          podium_structure: string | null;
          lifts_per_tower: number | null;
          open_space: string | null;
          geyser_heat_pump_provided: string | null;
          vrv_ac_provided: string | null;
          window_glazing: string | null;
          bath_sanitary_fittings: string | null;
          flooring_type: string | null;
          units_per_acre: string | null;
          construction_quality: string | null;
          internal_ceiling_height: string | null;
          clubhouse_size: string | null;
          developer_background: string | null;
          developer_experience_years: number | null;
          total_delivered_projects: number | null;
          ongoing_projects: number | null;
          notable_delivered_projects: string[];
          possession_as_of: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          developer?: string | null;
          category: string;
          tagline?: string | null;
          image_url?: string | null;
          size?: string | null;
          size_numeric?: number | null;
          super_built_up_area?: string | null;
          carpet_area?: string | null;
          location?: string | null;
          state?: string | null;
          city?: string | null;
          status?: string | null;
          configuration_summary?: string | null;
          configurations?: Json;
          price_summary?: string | null;
          possession?: string | null;
          amenities?: string[];
          advantages?: string[];
          gallery?: Json;
          expert_note?: string | null;
          is_published?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          plot_size?: string | null;
          total_towers?: number | null;
          total_floors?: number | null;
          units_per_floor?: number | null;
          total_units?: number | null;
          available_bhk_types?: string | null;
          rera_id?: string | null;
          rera_url?: string | null;
          proposed_start_date_rera?: string | null;
          parking_levels?: number | null;
          podium_structure?: string | null;
          lifts_per_tower?: number | null;
          open_space?: string | null;
          geyser_heat_pump_provided?: string | null;
          vrv_ac_provided?: string | null;
          window_glazing?: string | null;
          bath_sanitary_fittings?: string | null;
          flooring_type?: string | null;
          units_per_acre?: string | null;
          construction_quality?: string | null;
          internal_ceiling_height?: string | null;
          clubhouse_size?: string | null;
          developer_background?: string | null;
          developer_experience_years?: number | null;
          total_delivered_projects?: number | null;
          ongoing_projects?: number | null;
          notable_delivered_projects?: string[];
          possession_as_of?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          developer?: string | null;
          category?: string;
          tagline?: string | null;
          image_url?: string | null;
          size?: string | null;
          size_numeric?: number | null;
          super_built_up_area?: string | null;
          carpet_area?: string | null;
          location?: string | null;
          state?: string | null;
          city?: string | null;
          status?: string | null;
          configuration_summary?: string | null;
          configurations?: Json;
          price_summary?: string | null;
          possession?: string | null;
          amenities?: string[];
          advantages?: string[];
          gallery?: Json;
          expert_note?: string | null;
          is_published?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          plot_size?: string | null;
          total_towers?: number | null;
          total_floors?: number | null;
          units_per_floor?: number | null;
          total_units?: number | null;
          available_bhk_types?: string | null;
          rera_id?: string | null;
          rera_url?: string | null;
          proposed_start_date_rera?: string | null;
          parking_levels?: number | null;
          podium_structure?: string | null;
          lifts_per_tower?: number | null;
          open_space?: string | null;
          geyser_heat_pump_provided?: string | null;
          vrv_ac_provided?: string | null;
          window_glazing?: string | null;
          bath_sanitary_fittings?: string | null;
          flooring_type?: string | null;
          units_per_acre?: string | null;
          construction_quality?: string | null;
          internal_ceiling_height?: string | null;
          clubhouse_size?: string | null;
          developer_background?: string | null;
          developer_experience_years?: number | null;
          total_delivered_projects?: number | null;
          ongoing_projects?: number | null;
          notable_delivered_projects?: string[];
          possession_as_of?: string | null;
        };
        Relationships: [];
      };
      property_submissions: {
        Row: {
          id: string;
          developer_id: string;
          property_id: string | null;
          action: "create" | "update";
          payload: Json;
          status: "pending" | "approved" | "rejected";
          reviewer_id: string | null;
          reviewer_note: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          developer_id: string;
          property_id?: string | null;
          action: "create" | "update";
          payload: Json;
          status?: "pending" | "approved" | "rejected";
          reviewer_id?: string | null;
          reviewer_note?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          developer_id?: string;
          property_id?: string | null;
          action?: "create" | "update";
          payload?: Json;
          status?: "pending" | "approved" | "rejected";
          reviewer_id?: string | null;
          reviewer_note?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
