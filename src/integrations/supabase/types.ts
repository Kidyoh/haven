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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_notifications: {
        Row: {
          channel: string
          contact_id: string | null
          created_at: string
          error: string | null
          id: string
          incident_id: string
          kind: string
          provider: string | null
          provider_message_id: string | null
          status: string
          to_phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          incident_id: string
          kind: string
          provider?: string | null
          provider_message_id?: string | null
          status: string
          to_phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          contact_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          incident_id?: string
          kind?: string
          provider?: string | null
          provider_message_id?: string | null
          status?: string
          to_phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "emergency_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_contacts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: []
      }
      incident_evidence: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          incident_id: string
          mime_type: string | null
          seq: number
          size_bytes: number | null
          started_at: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          incident_id: string
          mime_type?: string | null
          seq: number
          size_bytes?: number | null
          started_at: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          incident_id?: string
          mime_type?: string | null
          seq?: number
          size_bytes?: number | null
          started_at?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_evidence_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_referrals: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          note: string | null
          organization_id: string
          referred_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          note?: string | null
          organization_id: string
          referred_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          note?: string | null
          organization_id?: string
          referred_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_referrals_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_referrals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_shares: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          share_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          share_token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          share_token?: string
          user_id?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          accuracy_meters: number | null
          activated_at: string | null
          audio_url: string | null
          battery_level: number | null
          created_at: string
          duress_at: string | null
          id: string
          last_location_at: string | null
          latitude: number | null
          longitude: number | null
          photo_url: string | null
          reference_number: string
          resolved_at: string | null
          signal_strength: string | null
          status: string
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          activated_at?: string | null
          audio_url?: string | null
          battery_level?: number | null
          created_at?: string
          duress_at?: string | null
          id?: string
          last_location_at?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          reference_number: string
          resolved_at?: string | null
          signal_strength?: string | null
          status?: string
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          activated_at?: string | null
          audio_url?: string | null
          battery_level?: number | null
          created_at?: string
          duress_at?: string | null
          id?: string
          last_location_at?: string | null
          latitude?: number | null
          longitude?: number | null
          photo_url?: string | null
          reference_number?: string
          resolved_at?: string | null
          signal_strength?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      location_updates: {
        Row: {
          accuracy_meters: number | null
          created_at: string
          id: string
          incident_id: string
          latitude: number
          longitude: number
          recorded_at: string | null
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          created_at?: string
          id?: string
          incident_id: string
          latitude: number
          longitude: number
          recorded_at?: string | null
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          created_at?: string
          id?: string
          incident_id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accepts_referrals: boolean
          address: string | null
          created_at: string
          email: string | null
          hours: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          notes: string | null
          phone: string | null
          region: string | null
          services: string[]
          subcity: string | null
          type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          accepts_referrals?: boolean
          address?: string | null
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          services?: string[]
          subcity?: string | null
          type?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          accepts_referrals?: boolean
          address?: string | null
          created_at?: string
          email?: string | null
          hours?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          region?: string | null
          services?: string[]
          subcity?: string | null
          type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone_number: string
          setup_complete: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          phone_number: string
          setup_complete?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone_number?: string
          setup_complete?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_incident_analytics: {
        Args: {
          p_since: string
        }
        Returns: {
          accuracy_meters: number | null
          activated_at: string | null
          audio_seconds: number
          battery_level: number | null
          clips: number
          contacts_reached: number
          created_at: string
          duress_at: string | null
          id: string
          latitude: number | null
          location_fixes: number
          longitude: number | null
          resolved_at: string | null
          signal_strength: string | null
          sms_failed: number
          sms_sent: number
          status: string
          user_id: string
        }[]
      }
      get_tracking: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin_of: {
        Args: {
          _organization_id: string
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "responder" | "org_admin"
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
      app_role: ["admin", "responder", "org_admin"],
    },
  },
} as const
