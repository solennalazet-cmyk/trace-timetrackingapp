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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          created_at: string | null
          id: string
          paused_at: string | null
          session_type: string | null
          started_at: string
          total_paused_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          paused_at?: string | null
          session_type?: string | null
          started_at: string
          total_paused_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          paused_at?: string | null
          session_type?: string | null
          started_at?: string
          total_paused_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string | null
          currency: string | null
          default_rate: number | null
          email: string | null
          id: string
          name: string
          nif: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          default_rate?: number | null
          email?: string | null
          id?: string
          name: string
          nif?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          default_rate?: number | null
          email?: string | null
          id?: string
          name?: string
          nif?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string | null
          currency: string
          date_range_end: string
          date_range_start: string
          delivery_method: string | null
          id: string
          paid_at: string | null
          sent_at: string | null
          status: string | null
          stripe_invoice_id: string | null
          total_amount: number
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          currency: string
          date_range_end: string
          date_range_start: string
          delivery_method?: string | null
          id?: string
          paid_at?: string | null
          sent_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          total_amount: number
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          currency?: string
          date_range_end?: string
          date_range_start?: string
          delivery_method?: string | null
          id?: string
          paid_at?: string | null
          sent_at?: string | null
          status?: string | null
          stripe_invoice_id?: string | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          full_name: string | null
          id: string
          plan: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          trial_started_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          full_name?: string | null
          id: string
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_started_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          full_name?: string | null
          id?: string
          plan?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          trial_started_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          client_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          name: string
          rate: number | null
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          name: string
          rate?: number | null
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string
          rate?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          created_at: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          billable: boolean | null
          billable_value: number | null
          billing_status: string | null
          break_minutes: number | null
          client_id: string | null
          created_at: string | null
          duration_minutes: number
          entry_date: string | null
          entry_type: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          project_id: string | null
          rate_amount: number | null
          rate_currency: string | null
          rate_unit: string | null
          tags: string[] | null
          task_id: string | null
          user_id: string
        }
        Insert: {
          billable?: boolean | null
          billable_value?: number | null
          billing_status?: string | null
          break_minutes?: number | null
          client_id?: string | null
          created_at?: string | null
          duration_minutes: number
          entry_date?: string | null
          entry_type?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          project_id?: string | null
          rate_amount?: number | null
          rate_currency?: string | null
          rate_unit?: string | null
          tags?: string[] | null
          task_id?: string | null
          user_id: string
        }
        Update: {
          billable?: boolean | null
          billable_value?: number | null
          billing_status?: string | null
          break_minutes?: number | null
          client_id?: string | null
          created_at?: string | null
          duration_minutes?: number
          entry_date?: string | null
          entry_type?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          project_id?: string | null
          rate_amount?: number | null
          rate_currency?: string | null
          rate_unit?: string | null
          tags?: string[] | null
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          created_at: string | null
          id: string
          message: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          id: string
          pause_mode: string | null
          show_logged_today: boolean | null
          theme: string | null
          timer_presets: number[] | null
          timer_sound: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          pause_mode?: string | null
          show_logged_today?: boolean | null
          theme?: string | null
          timer_presets?: number[] | null
          timer_sound?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          pause_mode?: string | null
          show_logged_today?: boolean | null
          theme?: string | null
          timer_presets?: number[] | null
          timer_sound?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          error: string | null
          event_type: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          stripe_event_id: string | null
        }
        Insert: {
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          stripe_event_id?: string | null
        }
        Update: {
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          stripe_event_id?: string | null
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
