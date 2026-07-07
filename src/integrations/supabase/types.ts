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
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          severity: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          currency_symbol: string
          factory_name: string
          id: number
          low_stock_raw_threshold: number
          updated_at: string
          wastage_alert_threshold: number
        }
        Insert: {
          currency_symbol?: string
          factory_name?: string
          id?: number
          low_stock_raw_threshold?: number
          updated_at?: string
          wastage_alert_threshold?: number
        }
        Update: {
          currency_symbol?: string
          factory_name?: string
          id?: number
          low_stock_raw_threshold?: number
          updated_at?: string
          wastage_alert_threshold?: number
        }
        Relationships: []
      }
      part_batches: {
        Row: {
          actual_usage_kg: number
          batch_number: string
          created_at: string
          expected_usage_kg: number
          id: string
          is_blocked: boolean
          part_id: string
          quantity: number
          raw_material_batch_id: string
          wastage_kg: number | null
          wastage_notes: string | null
          wastage_reason: string
        }
        Insert: {
          actual_usage_kg: number
          batch_number: string
          created_at?: string
          expected_usage_kg: number
          id?: string
          is_blocked?: boolean
          part_id: string
          quantity: number
          raw_material_batch_id: string
          wastage_kg?: number | null
          wastage_notes?: string | null
          wastage_reason: string
        }
        Update: {
          actual_usage_kg?: number
          batch_number?: string
          created_at?: string
          expected_usage_kg?: number
          id?: string
          is_blocked?: boolean
          part_id?: string
          quantity?: number
          raw_material_batch_id?: string
          wastage_kg?: number | null
          wastage_notes?: string | null
          wastage_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_batches_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_batches_raw_material_batch_id_fkey"
            columns: ["raw_material_batch_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          consumption_per_unit_kg: number
          created_at: string
          current_stock: number
          id: string
          low_stock_threshold: number
          material_type: string
          notes: string | null
          part_name: string
          updated_at: string
        }
        Insert: {
          consumption_per_unit_kg: number
          created_at?: string
          current_stock?: number
          id?: string
          low_stock_threshold?: number
          material_type: string
          notes?: string | null
          part_name: string
          updated_at?: string
        }
        Update: {
          consumption_per_unit_kg?: number
          created_at?: string
          current_stock?: number
          id?: string
          low_stock_threshold?: number
          material_type?: string
          notes?: string | null
          part_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_bom: {
        Row: {
          id: string
          part_id: string
          product_id: string
          quantity_required: number
        }
        Insert: {
          id?: string
          part_id: string
          product_id: string
          quantity_required: number
        }
        Update: {
          id?: string
          part_id?: string
          product_id?: string
          quantity_required?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_bom_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_bom_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batch_parts: {
        Row: {
          id: string
          part_batch_id: string
          production_batch_id: string
          quantity_used: number
        }
        Insert: {
          id?: string
          part_batch_id: string
          production_batch_id: string
          quantity_used: number
        }
        Update: {
          id?: string
          part_batch_id?: string
          production_batch_id?: string
          quantity_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_batch_parts_part_batch_id_fkey"
            columns: ["part_batch_id"]
            isOneToOne: false
            referencedRelation: "part_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_batch_parts_production_batch_id_fkey"
            columns: ["production_batch_id"]
            isOneToOne: false
            referencedRelation: "production_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      production_batches: {
        Row: {
          actual_raw_material_kg: number
          batch_number: string
          created_at: string
          expected_raw_material_kg: number
          extra_raw_material_batch_id: string | null
          id: string
          notes: string | null
          product_id: string
          production_date: string
          quantity_produced: number
          status: string
          wastage_kg: number | null
          wastage_notes: string | null
          wastage_reason: string | null
        }
        Insert: {
          actual_raw_material_kg: number
          batch_number: string
          created_at?: string
          expected_raw_material_kg: number
          extra_raw_material_batch_id?: string | null
          id?: string
          notes?: string | null
          product_id: string
          production_date?: string
          quantity_produced: number
          status?: string
          wastage_kg?: number | null
          wastage_notes?: string | null
          wastage_reason?: string | null
        }
        Update: {
          actual_raw_material_kg?: number
          batch_number?: string
          created_at?: string
          expected_raw_material_kg?: number
          extra_raw_material_batch_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          production_date?: string
          quantity_produced?: number
          status?: string
          wastage_kg?: number | null
          wastage_notes?: string | null
          wastage_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_batches_extra_raw_material_batch_id_fkey"
            columns: ["extra_raw_material_batch_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_plans: {
        Row: {
          created_at: string
          id: string
          plan_number: string
          planned_date: string
          planned_quantity: number
          product_id: string
          required_parts: Json
          required_raw_materials: Json
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_number: string
          planned_date: string
          planned_quantity: number
          product_id: string
          required_parts: Json
          required_raw_materials: Json
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_number?: string
          planned_date?: string
          planned_quantity?: number
          product_id?: string
          required_parts?: Json
          required_raw_materials?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          product_code: string | null
          product_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          product_code?: string | null
          product_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          product_code?: string | null
          product_name?: string
        }
        Relationships: []
      }
      raw_materials: {
        Row: {
          batch_number: string
          created_at: string
          id: string
          initial_quantity_kg: number
          is_blocked: boolean
          material_type: string
          notes: string | null
          purchase_date: string
          rate_per_kg: number
          remaining_quantity_kg: number
          total_cost: number | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          id?: string
          initial_quantity_kg: number
          is_blocked?: boolean
          material_type: string
          notes?: string | null
          purchase_date?: string
          rate_per_kg: number
          remaining_quantity_kg: number
          total_cost?: number | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          id?: string
          initial_quantity_kg?: number
          is_blocked?: boolean
          material_type?: string
          notes?: string | null
          purchase_date?: string
          rate_per_kg?: number
          remaining_quantity_kg?: number
          total_cost?: number | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_materials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          materials_supplied: string[]
          name: string
          notes: string | null
          phone: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          materials_supplied?: string[]
          name: string
          notes?: string | null
          phone: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          materials_supplied?: string[]
          name?: string
          notes?: string | null
          phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      wastage_logs: {
        Row: {
          actual_kg: number
          created_at: string
          expected_kg: number
          id: string
          level: string
          level_name: string
          notes: string | null
          reason: string
          reference_id: string
          wastage_kg: number
          wastage_percentage: number | null
        }
        Insert: {
          actual_kg: number
          created_at?: string
          expected_kg: number
          id?: string
          level: string
          level_name: string
          notes?: string | null
          reason: string
          reference_id: string
          wastage_kg: number
          wastage_percentage?: number | null
        }
        Update: {
          actual_kg?: number
          created_at?: string
          expected_kg?: number
          id?: string
          level?: string
          level_name?: string
          notes?: string | null
          reason?: string
          reference_id?: string
          wastage_kg?: number
          wastage_percentage?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_kpis: { Args: never; Returns: Json }
      get_traceability_backward: {
        Args: { p_production_batch_id: string }
        Returns: Json
      }
      get_traceability_forward: {
        Args: { p_raw_material_id: string }
        Returns: Json
      }
      next_number_for_prefix: {
        Args: { p_column: string; p_prefix: string; p_table: string }
        Returns: number
      }
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
