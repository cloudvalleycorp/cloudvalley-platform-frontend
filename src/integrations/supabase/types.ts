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
      admin_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          startup_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          startup_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          batch: string | null
          created_at: string
          id: string
          message: string | null
          organization_id: string
          requested_by: string | null
          responded_at: string | null
          responded_by: string | null
          startup_id: string
          status: string
          year: number | null
        }
        Insert: {
          batch?: string | null
          created_at?: string
          id?: string
          message?: string | null
          organization_id: string
          requested_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          startup_id: string
          status?: string
          year?: number | null
        }
        Update: {
          batch?: string | null
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          requested_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          startup_id?: string
          status?: string
          year?: number | null
        }
        Relationships: []
      }
      document_privacy: {
        Row: {
          document_id: string
          id: string
          is_public: boolean
          startup_id: string
        }
        Insert: {
          document_id: string
          id?: string
          is_public?: boolean
          startup_id: string
        }
        Update: {
          document_id?: string
          id?: string
          is_public?: boolean
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_privacy_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_privacy_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          created_at: string
          document_id: string
          id: string
          message: string | null
          organization_id: string
          requested_by: string
          resolved_at: string | null
          startup_id: string
          status: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          message?: string | null
          organization_id: string
          requested_by: string
          resolved_at?: string | null
          startup_id: string
          status?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          message?: string | null
          organization_id?: string
          requested_by?: string
          resolved_at?: string | null
          startup_id?: string
          status?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: Database["public"]["Enums"]["doc_category"]
          file_url: string | null
          id: string
          is_critical: boolean
          name: string
          stage_required: string
          startup_id: string
          status: Database["public"]["Enums"]["doc_status"]
          task_id: string | null
          updated_at: string
          uploaded_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["doc_category"]
          file_url?: string | null
          id?: string
          is_critical?: boolean
          name: string
          stage_required?: string
          startup_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          task_id?: string | null
          updated_at?: string
          uploaded_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["doc_category"]
          file_url?: string | null
          id?: string
          is_critical?: boolean
          name?: string
          stage_required?: string
          startup_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          task_id?: string | null
          updated_at?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_configs: {
        Row: {
          display_order: number
          id: string
          is_active: boolean
          metric_id: string
          startup_id: string
          target_value: number | null
        }
        Insert: {
          display_order?: number
          id?: string
          is_active?: boolean
          metric_id: string
          startup_id: string
          target_value?: number | null
        }
        Update: {
          display_order?: number
          id?: string
          is_active?: boolean
          metric_id?: string
          startup_id?: string
          target_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_configs_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metric_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_configs_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_definitions: {
        Row: {
          applies_to_model: Database["public"]["Enums"]["business_model"][]
          benchmark: string | null
          category: Database["public"]["Enums"]["metric_category"]
          description: string | null
          formula: string | null
          formula_expression: string | null
          id: string
          input_key: string | null
          is_core: boolean
          metric_type: string
          name: string
          order_index: number
          stage_required: string
          unit: string | null
          why_it_matters: string | null
        }
        Insert: {
          applies_to_model?: Database["public"]["Enums"]["business_model"][]
          benchmark?: string | null
          category: Database["public"]["Enums"]["metric_category"]
          description?: string | null
          formula?: string | null
          formula_expression?: string | null
          id?: string
          input_key?: string | null
          is_core?: boolean
          metric_type?: string
          name: string
          order_index?: number
          stage_required?: string
          unit?: string | null
          why_it_matters?: string | null
        }
        Update: {
          applies_to_model?: Database["public"]["Enums"]["business_model"][]
          benchmark?: string | null
          category?: Database["public"]["Enums"]["metric_category"]
          description?: string | null
          formula?: string | null
          formula_expression?: string | null
          id?: string
          input_key?: string | null
          is_core?: boolean
          metric_type?: string
          name?: string
          order_index?: number
          stage_required?: string
          unit?: string | null
          why_it_matters?: string | null
        }
        Relationships: []
      }
      metric_entries: {
        Row: {
          created_at: string
          id: string
          metric_id: string
          note: string | null
          period_month: number
          period_year: number
          source: Database["public"]["Enums"]["integration_provider"] | null
          startup_id: string
          synced_at: string | null
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          metric_id: string
          note?: string | null
          period_month: number
          period_year: number
          source?: Database["public"]["Enums"]["integration_provider"] | null
          startup_id: string
          synced_at?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          metric_id?: string
          note?: string | null
          period_month?: number
          period_year?: number
          source?: Database["public"]["Enums"]["integration_provider"] | null
          startup_id?: string
          synced_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_entries_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metric_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_entries_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_privacy: {
        Row: {
          id: string
          is_public: boolean
          metric_id: string
          startup_id: string
        }
        Insert: {
          id?: string
          is_public?: boolean
          metric_id: string
          startup_id: string
        }
        Update: {
          id?: string
          is_public?: boolean
          metric_id?: string
          startup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "metric_privacy_metric_id_fkey"
            columns: ["metric_id"]
            isOneToOne: false
            referencedRelation: "metric_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_privacy_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_source_mapping: {
        Row: {
          id: string
          metric_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          source_field: string
        }
        Insert: {
          id?: string
          metric_id: string
          provider: Database["public"]["Enums"]["integration_provider"]
          source_field: string
        }
        Update: {
          id?: string
          metric_id?: string
          provider?: Database["public"]["Enums"]["integration_provider"]
          source_field?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          organization_id: string
          status: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          organization_id: string
          status?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          type: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          type: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          type?: string
          website?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      roadmap_pillars: {
        Row: {
          description: string | null
          id: string
          name: string
          order_index: number
          weight: number
        }
        Insert: {
          description?: string | null
          id?: string
          name: string
          order_index?: number
          weight: number
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          order_index?: number
          weight?: number
        }
        Relationships: []
      }
      roadmap_tasks: {
        Row: {
          criticality: string
          description: string | null
          how_to_do_it: string | null
          id: string
          order_index: number
          pillar_id: string
          requires_doc: boolean
          stage_required: string
          title: string
          why_it_matters: string | null
        }
        Insert: {
          criticality?: string
          description?: string | null
          how_to_do_it?: string | null
          id?: string
          order_index?: number
          pillar_id: string
          requires_doc?: boolean
          stage_required?: string
          title: string
          why_it_matters?: string | null
        }
        Update: {
          criticality?: string
          description?: string | null
          how_to_do_it?: string | null
          id?: string
          order_index?: number
          pillar_id?: string
          requires_doc?: boolean
          stage_required?: string
          title?: string
          why_it_matters?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadmap_tasks_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "roadmap_pillars"
            referencedColumns: ["id"]
          },
        ]
      }
      score_snapshots: {
        Row: {
          dataroom_score: number | null
          growth_score: number | null
          id: string
          legal_score: number | null
          pitch_score: number | null
          snapshot_date: string
          startup_id: string
          total_score: number
        }
        Insert: {
          dataroom_score?: number | null
          growth_score?: number | null
          id?: string
          legal_score?: number | null
          pitch_score?: number | null
          snapshot_date?: string
          startup_id: string
          total_score: number
        }
        Update: {
          dataroom_score?: number | null
          growth_score?: number | null
          id?: string
          legal_score?: number | null
          pitch_score?: number | null
          snapshot_date?: string
          startup_id?: string
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "score_snapshots_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_integrations: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_label: string | null
          api_key: string | null
          api_secret: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token: string | null
          startup_id: string
          status: Database["public"]["Enums"]["integration_status"]
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_label?: string | null
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          startup_id: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_label?: string | null
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          refresh_token?: string | null
          startup_id?: string
          status?: Database["public"]["Enums"]["integration_status"]
          updated_at?: string
        }
        Relationships: []
      }
      startup_members: {
        Row: {
          created_at: string
          id: string
          role: string
          startup_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          startup_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          startup_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_members_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_organizations: {
        Row: {
          batch: string | null
          created_at: string
          id: string
          organization_id: string
          relationship_type: string | null
          startup_id: string
          year: number | null
        }
        Insert: {
          batch?: string | null
          created_at?: string
          id?: string
          organization_id: string
          relationship_type?: string | null
          startup_id: string
          year?: number | null
        }
        Update: {
          batch?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          relationship_type?: string | null
          startup_id?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "startup_organizations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_organizations_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
        ]
      }
      startup_tasks: {
        Row: {
          completed_at: string | null
          doc_url: string | null
          id: string
          notes: string | null
          startup_id: string
          status: Database["public"]["Enums"]["task_status"]
          task_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          doc_url?: string | null
          id?: string
          notes?: string | null
          startup_id: string
          status?: Database["public"]["Enums"]["task_status"]
          task_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          doc_url?: string | null
          id?: string
          notes?: string | null
          startup_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "startup_tasks_startup_id_fkey"
            columns: ["startup_id"]
            isOneToOne: false
            referencedRelation: "startups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "startup_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "roadmap_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      startups: {
        Row: {
          business_model: Database["public"]["Enums"]["business_model"] | null
          cohort_number: number | null
          cohort_year: number | null
          created_at: string
          id: string
          industry: string | null
          name: string
          readiness_score: number
          stage: Database["public"]["Enums"]["startup_stage"] | null
          target_raise_usd: number | null
          updated_at: string
          website: string | null
        }
        Insert: {
          business_model?: Database["public"]["Enums"]["business_model"] | null
          cohort_number?: number | null
          cohort_year?: number | null
          created_at?: string
          id?: string
          industry?: string | null
          name: string
          readiness_score?: number
          stage?: Database["public"]["Enums"]["startup_stage"] | null
          target_raise_usd?: number | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_model?: Database["public"]["Enums"]["business_model"] | null
          cohort_number?: number | null
          cohort_year?: number | null
          created_at?: string
          id?: string
          industry?: string | null
          name?: string
          readiness_score?: number
          stage?: Database["public"]["Enums"]["startup_stage"] | null
          target_raise_usd?: number | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pending_invitations: {
        Args: { _email: string; _user_id: string }
        Returns: undefined
      }
      can_invite_to_org: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      create_startup_with_member:
        | {
            Args: {
              _business_model: Database["public"]["Enums"]["business_model"]
              _industry: string
              _name: string
              _stage: Database["public"]["Enums"]["startup_stage"]
              _target_raise_usd: number
            }
            Returns: string
          }
        | {
            Args: {
              _business_model: Database["public"]["Enums"]["business_model"]
              _cohort_number?: number
              _industry: string
              _name: string
              _stage: Database["public"]["Enums"]["startup_stage"]
              _target_raise_usd: number
            }
            Returns: string
          }
        | {
            Args: {
              _business_model: Database["public"]["Enums"]["business_model"]
              _cohort_number?: number
              _cohort_year?: number
              _industry: string
              _name: string
              _stage: Database["public"]["Enums"]["startup_stage"]
              _target_raise_usd: number
            }
            Returns: string
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_organization_member: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_startup_in_user_orgs: {
        Args: { _startup_id: string; _user_id: string }
        Returns: boolean
      }
      is_startup_member: {
        Args: { _startup_id: string; _user_id: string }
        Returns: boolean
      }
      user_organization_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      app_role: "founder" | "admin" | "org_viewer"
      business_model:
        | "saas"
        | "marketplace"
        | "ecommerce"
        | "b2b_services"
        | "consumer"
        | "other"
      doc_category:
        | "corporate"
        | "equity_cap_table"
        | "ip_legal"
        | "financials"
        | "contracts_hr"
        | "pitch"
      doc_status: "missing" | "uploaded" | "verified"
      integration_provider: "stripe" | "mercury" | "amplitude"
      integration_status: "connected" | "error" | "disconnected" | "pending"
      metric_category:
        | "revenue"
        | "acquisition"
        | "retention"
        | "cash_efficiency"
      startup_stage: "pre_seed" | "seed" | "series_a"
      task_status: "pending" | "in_progress" | "done"
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
      app_role: ["founder", "admin", "org_viewer"],
      business_model: [
        "saas",
        "marketplace",
        "ecommerce",
        "b2b_services",
        "consumer",
        "other",
      ],
      doc_category: [
        "corporate",
        "equity_cap_table",
        "ip_legal",
        "financials",
        "contracts_hr",
        "pitch",
      ],
      doc_status: ["missing", "uploaded", "verified"],
      integration_provider: ["stripe", "mercury", "amplitude"],
      integration_status: ["connected", "error", "disconnected", "pending"],
      metric_category: [
        "revenue",
        "acquisition",
        "retention",
        "cash_efficiency",
      ],
      startup_stage: ["pre_seed", "seed", "series_a"],
      task_status: ["pending", "in_progress", "done"],
    },
  },
} as const
