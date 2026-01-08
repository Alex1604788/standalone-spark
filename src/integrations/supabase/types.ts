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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_reply_history: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          model: string | null
          new_text: string
          old_text: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          model?: string | null
          new_text: string
          old_text?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          model?: string | null
          new_text?: string
          old_text?: string | null
          type?: string
        }
        Relationships: []
      }
      allocation_lines: {
        Row: {
          cluster_id: string
          comment: string | null
          created_at: string
          id: string
          is_novelty_allocation: boolean
          marketplace_id: string
          metadata: Json
          offer_id: string
          quantity: number
          source: string
          updated_at: string
          version_id: string
        }
        Insert: {
          cluster_id: string
          comment?: string | null
          created_at?: string
          id?: string
          is_novelty_allocation?: boolean
          marketplace_id: string
          metadata?: Json
          offer_id: string
          quantity?: number
          source?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          cluster_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          is_novelty_allocation?: boolean
          marketplace_id?: string
          metadata?: Json
          offer_id?: string
          quantity?: number
          source?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_lines_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_lines_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_lines_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "allocation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_rules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          marketplace_id: string
          name: string
          rules: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          marketplace_id: string
          name: string
          rules?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          marketplace_id?: string
          name?: string
          rules?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rules_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_sessions: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          marketplace_id: string
          metadata: Json
          status: string
          updated_at: string
          working_date: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          marketplace_id: string
          metadata?: Json
          status?: string
          updated_at?: string
          working_date: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          marketplace_id?: string
          metadata?: Json
          status?: string
          updated_at?: string
          working_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_sessions_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_sessions_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_versions: {
        Row: {
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          marketplace_id: string
          metadata: Json
          session_id: string
          status: string
          updated_at: string
          version_no: number
          version_type: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_id: string
          metadata?: Json
          session_id: string
          status?: string
          updated_at?: string
          version_no: number
          version_type?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_id?: string
          metadata?: Json
          session_id?: string
          status?: string
          updated_at?: string
          version_no?: number
          version_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_versions_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_versions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "allocation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_metrics: {
        Row: {
          answered_questions: number | null
          answered_reviews: number | null
          avg_response_time_minutes: number | null
          created_at: string | null
          id: string
          metric_date: string
          rating_change: number | null
          total_questions: number | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          answered_questions?: number | null
          answered_reviews?: number | null
          avg_response_time_minutes?: number | null
          created_at?: string | null
          id?: string
          metric_date: string
          rating_change?: number | null
          total_questions?: number | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          answered_questions?: number | null
          answered_reviews?: number | null
          avg_response_time_minutes?: number | null
          created_at?: string | null
          id?: string
          metric_date?: string
          rating_change?: number | null
          total_questions?: number | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          image_urls: string[] | null
          is_image: boolean | null
          is_read: boolean | null
          message_id: string
          moderate_status: string | null
          sender_name: string | null
          sender_type: string
          sent_at: string
          text: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          image_urls?: string[] | null
          is_image?: boolean | null
          is_read?: boolean | null
          message_id: string
          moderate_status?: string | null
          sender_name?: string | null
          sender_type: string
          sent_at: string
          text: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          image_urls?: string[] | null
          is_image?: boolean | null
          is_read?: boolean | null
          message_id?: string
          moderate_status?: string | null
          sender_name?: string | null
          sender_type?: string
          sent_at?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          chat_id: string
          created_at: string
          expires_at: string | null
          id: string
          last_message_at: string | null
          last_message_from: string | null
          last_message_text: string | null
          marketplace_id: string
          order_number: string | null
          posting_number: string
          product_sku: string | null
          status: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_from?: string | null
          last_message_text?: string | null
          marketplace_id: string
          order_number?: string | null
          posting_number: string
          product_sku?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_message_at?: string | null
          last_message_from?: string | null
          last_message_text?: string | null
          marketplace_id?: string
          order_number?: string | null
          posting_number?: string
          product_sku?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_warehouses: {
        Row: {
          cluster_id: string
          created_at: string
          id: string
          is_active: boolean
          marketplace_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          cluster_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          cluster_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_warehouses_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_warehouses_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_warehouses_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "ozon_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      clusters: {
        Row: {
          consumption_percent: number
          created_at: string
          id: string
          is_active: boolean
          marketplace_id: string
          name: string
          priority: number
          short_name: string
          updated_at: string
        }
        Insert: {
          consumption_percent?: number
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_id: string
          name: string
          priority?: number
          short_name: string
          updated_at?: string
        }
        Update: {
          consumption_percent?: number
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_id?: string
          name?: string
          priority?: number
          short_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clusters_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          accepted_at: string | null
          consent_text: string
          consent_type: string
          created_at: string | null
          declined_at: string | null
          id: string
          ip_address: string | null
          marketplace_id: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["consent_status"]
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          consent_text: string
          consent_type: string
          created_at?: string | null
          declined_at?: string | null
          id?: string
          ip_address?: string | null
          marketplace_id?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          consent_text?: string
          consent_type?: string
          created_at?: string | null
          declined_at?: string | null
          id?: string
          ip_address?: string | null
          marketplace_id?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["consent_status"]
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_logs_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      excess_shipments: {
        Row: {
          cluster_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          id: string
          import_batch_id: string | null
          marketplace_id: string
          offer_id: string
          quantity: number
          shipped_date: string
          status: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          cluster_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          marketplace_id: string
          offer_id: string
          quantity?: number
          shipped_date: string
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          cluster_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          import_batch_id?: string | null
          marketplace_id?: string
          offer_id?: string
          quantity?: number
          shipped_date?: string
          status?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "excess_shipments_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excess_shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excess_shipments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excess_shipments_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "excess_shipments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "ozon_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      fallback_action_logs: {
        Row: {
          action_type: string
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          marketplace_id: string
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          marketplace_id: string
          status: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          marketplace_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fallback_action_logs_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      import_column_mappings: {
        Row: {
          created_at: string
          id: string
          import_type: string
          mapping: Json
          marketplace_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_type: string
          mapping: Json
          marketplace_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          import_type?: string
          mapping?: Json
          marketplace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_column_mappings_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      import_logs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          file_name: string | null
          id: string
          import_type: string
          marketplace_id: string
          period_end: string | null
          period_start: string | null
          records_failed: number | null
          records_imported: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          import_type: string
          marketplace_id: string
          period_end?: string | null
          period_start?: string | null
          records_failed?: number | null
          records_imported?: number | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          import_type?: string
          marketplace_id?: string
          period_end?: string | null
          period_start?: string | null
          records_failed?: number | null
          records_imported?: number | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      logs_ai: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          item_id: string | null
          model: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          item_id?: string | null
          model?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          item_id?: string | null
          model?: string | null
          type?: string
        }
        Relationships: []
      }
      marketplace_api_credentials: {
        Row: {
          access_token: string | null
          api_type: string
          auto_sync_enabled: boolean | null
          client_id: string
          client_secret: string
          created_at: string
          created_by: string | null
          error_count: number | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_sync_at: string | null
          marketplace_id: string
          next_sync_at: string | null
          refresh_token: string | null
          sync_frequency: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          api_type: string
          auto_sync_enabled?: boolean | null
          client_id: string
          client_secret: string
          created_at?: string
          created_by?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          marketplace_id: string
          next_sync_at?: string | null
          refresh_token?: string | null
          sync_frequency?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          api_type?: string
          auto_sync_enabled?: boolean | null
          client_id?: string
          client_secret?: string
          created_at?: string
          created_by?: string | null
          error_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_sync_at?: string | null
          marketplace_id?: string
          next_sync_at?: string | null
          refresh_token?: string | null
          sync_frequency?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_api_credentials_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          created_at: string | null
          id: string
          marketplace_id: string
          questions_mode: string | null
          reply_length: string | null
          reviews_mode_1: string | null
          reviews_mode_2: string | null
          reviews_mode_3: string | null
          reviews_mode_4: string | null
          reviews_mode_5: string | null
          updated_at: string | null
          use_templates_1: boolean | null
          use_templates_2: boolean | null
          use_templates_3: boolean | null
          use_templates_4: boolean | null
          use_templates_5: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          marketplace_id: string
          questions_mode?: string | null
          reply_length?: string | null
          reviews_mode_1?: string | null
          reviews_mode_2?: string | null
          reviews_mode_3?: string | null
          reviews_mode_4?: string | null
          reviews_mode_5?: string | null
          updated_at?: string | null
          use_templates_1?: boolean | null
          use_templates_2?: boolean | null
          use_templates_3?: boolean | null
          use_templates_4?: boolean | null
          use_templates_5?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          marketplace_id?: string
          questions_mode?: string | null
          reply_length?: string | null
          reviews_mode_1?: string | null
          reviews_mode_2?: string | null
          reviews_mode_3?: string | null
          reviews_mode_4?: string | null
          reviews_mode_5?: string | null
          updated_at?: string | null
          use_templates_1?: boolean | null
          use_templates_2?: boolean | null
          use_templates_3?: boolean | null
          use_templates_4?: boolean | null
          use_templates_5?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_settings_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: true
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplaces: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          fallback_enabled: boolean | null
          fallback_mode: Database["public"]["Enums"]["fallback_mode"]
          fallback_rate_limit: number | null
          id: string
          is_active: boolean | null
          kill_switch_enabled: boolean | null
          last_chats_sync_at: string | null
          last_check_at: string | null
          last_fallback_action_at: string | null
          last_questions_sync_at: string | null
          last_reviews_sync_at: string | null
          last_sync_at: string | null
          last_sync_count: number | null
          last_sync_error: string | null
          last_sync_products_at: string | null
          last_sync_reviews_at: string | null
          last_sync_status: string | null
          last_sync_total: number | null
          name: string
          ozon_seller_id: string | null
          service_account_email: string | null
          session_expires_at: string | null
          session_token_encrypted: string | null
          sync_mode: string | null
          type: Database["public"]["Enums"]["marketplace_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          fallback_enabled?: boolean | null
          fallback_mode?: Database["public"]["Enums"]["fallback_mode"]
          fallback_rate_limit?: number | null
          id?: string
          is_active?: boolean | null
          kill_switch_enabled?: boolean | null
          last_chats_sync_at?: string | null
          last_check_at?: string | null
          last_fallback_action_at?: string | null
          last_questions_sync_at?: string | null
          last_reviews_sync_at?: string | null
          last_sync_at?: string | null
          last_sync_count?: number | null
          last_sync_error?: string | null
          last_sync_products_at?: string | null
          last_sync_reviews_at?: string | null
          last_sync_status?: string | null
          last_sync_total?: number | null
          name: string
          ozon_seller_id?: string | null
          service_account_email?: string | null
          session_expires_at?: string | null
          session_token_encrypted?: string | null
          sync_mode?: string | null
          type: Database["public"]["Enums"]["marketplace_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          fallback_enabled?: boolean | null
          fallback_mode?: Database["public"]["Enums"]["fallback_mode"]
          fallback_rate_limit?: number | null
          id?: string
          is_active?: boolean | null
          kill_switch_enabled?: boolean | null
          last_chats_sync_at?: string | null
          last_check_at?: string | null
          last_fallback_action_at?: string | null
          last_questions_sync_at?: string | null
          last_reviews_sync_at?: string | null
          last_sync_at?: string | null
          last_sync_count?: number | null
          last_sync_error?: string | null
          last_sync_products_at?: string | null
          last_sync_reviews_at?: string | null
          last_sync_status?: string | null
          last_sync_total?: number | null
          name?: string
          ozon_seller_id?: string | null
          service_account_email?: string | null
          session_expires_at?: string | null
          session_token_encrypted?: string | null
          sync_mode?: string | null
          type?: Database["public"]["Enums"]["marketplace_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplaces_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_accruals: {
        Row: {
          accepted_or_service_date: string | null
          accrual_date: string
          accrual_type: string
          accrual_type_norm: string | null
          accrual_type_raw: string | null
          amount_before_commission: number | null
          amount_before_fees: number | null
          avg_delivery_hours: number | null
          canceled_or_unclaimed_processing: number | null
          cancelled_processing: number | null
          commission_amount: number | null
          commission_percent: number | null
          dropoff_pickup_processing: number | null
          id: string
          import_batch_id: string | null
          imported_at: string
          item_name: string | null
          last_mile: number | null
          linehaul: number | null
          localization_index: string | null
          logistics: number | null
          main_route: number | null
          marketplace_id: string
          offer_id: string
          order_assembly: number | null
          order_date: string | null
          ozon_fee_amount: number | null
          ozon_fee_percent: number | null
          posting_number_or_service_id: string | null
          product_name: string | null
          quantity: number | null
          return_logistics: number | null
          return_main_route: number | null
          return_processing: number | null
          reverse_linehaul: number | null
          reverse_logistics: number | null
          shipment_number: string | null
          shipment_processing: number | null
          sku: string | null
          total_amount: number | null
          total_rub: number | null
          undelivered_processing: number | null
          unredeemed_processing: number | null
          warehouse: string | null
        }
        Insert: {
          accepted_or_service_date?: string | null
          accrual_date: string
          accrual_type: string
          accrual_type_norm?: string | null
          accrual_type_raw?: string | null
          amount_before_commission?: number | null
          amount_before_fees?: number | null
          avg_delivery_hours?: number | null
          canceled_or_unclaimed_processing?: number | null
          cancelled_processing?: number | null
          commission_amount?: number | null
          commission_percent?: number | null
          dropoff_pickup_processing?: number | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          item_name?: string | null
          last_mile?: number | null
          linehaul?: number | null
          localization_index?: string | null
          logistics?: number | null
          main_route?: number | null
          marketplace_id: string
          offer_id: string
          order_assembly?: number | null
          order_date?: string | null
          ozon_fee_amount?: number | null
          ozon_fee_percent?: number | null
          posting_number_or_service_id?: string | null
          product_name?: string | null
          quantity?: number | null
          return_logistics?: number | null
          return_main_route?: number | null
          return_processing?: number | null
          reverse_linehaul?: number | null
          reverse_logistics?: number | null
          shipment_number?: string | null
          shipment_processing?: number | null
          sku?: string | null
          total_amount?: number | null
          total_rub?: number | null
          undelivered_processing?: number | null
          unredeemed_processing?: number | null
          warehouse?: string | null
        }
        Update: {
          accepted_or_service_date?: string | null
          accrual_date?: string
          accrual_type?: string
          accrual_type_norm?: string | null
          accrual_type_raw?: string | null
          amount_before_commission?: number | null
          amount_before_fees?: number | null
          avg_delivery_hours?: number | null
          canceled_or_unclaimed_processing?: number | null
          cancelled_processing?: number | null
          commission_amount?: number | null
          commission_percent?: number | null
          dropoff_pickup_processing?: number | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          item_name?: string | null
          last_mile?: number | null
          linehaul?: number | null
          localization_index?: string | null
          logistics?: number | null
          main_route?: number | null
          marketplace_id?: string
          offer_id?: string
          order_assembly?: number | null
          order_date?: string | null
          ozon_fee_amount?: number | null
          ozon_fee_percent?: number | null
          posting_number_or_service_id?: string | null
          product_name?: string | null
          quantity?: number | null
          return_logistics?: number | null
          return_main_route?: number | null
          return_processing?: number | null
          reverse_linehaul?: number | null
          reverse_logistics?: number | null
          shipment_number?: string | null
          shipment_processing?: number | null
          sku?: string | null
          total_amount?: number | null
          total_rub?: number | null
          undelivered_processing?: number | null
          unredeemed_processing?: number | null
          warehouse?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_accruals_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_accruals_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_avg_delivery_time: {
        Row: {
          attention_level: string | null
          average_delivery_time: number | null
          average_delivery_time_status: string | null
          clusters_data: Json
          created_at: string
          delivery_cluster_id: number
          exact_impact_share: string | null
          id: string
          impact_share: number | null
          lost_profit: number | null
          marketplace_id: string
          offer_id: string | null
          orders_fast_percent: number | null
          orders_fast_value: number | null
          orders_long_percent: number | null
          orders_long_value: number | null
          orders_medium_percent: number | null
          orders_medium_value: number | null
          orders_total: number | null
          raw_payload: Json
          recommended_supply: number | null
          sku: string
          snapshot_at: string
          sync_id: string | null
        }
        Insert: {
          attention_level?: string | null
          average_delivery_time?: number | null
          average_delivery_time_status?: string | null
          clusters_data?: Json
          created_at?: string
          delivery_cluster_id: number
          exact_impact_share?: string | null
          id?: string
          impact_share?: number | null
          lost_profit?: number | null
          marketplace_id: string
          offer_id?: string | null
          orders_fast_percent?: number | null
          orders_fast_value?: number | null
          orders_long_percent?: number | null
          orders_long_value?: number | null
          orders_medium_percent?: number | null
          orders_medium_value?: number | null
          orders_total?: number | null
          raw_payload?: Json
          recommended_supply?: number | null
          sku: string
          snapshot_at?: string
          sync_id?: string | null
        }
        Update: {
          attention_level?: string | null
          average_delivery_time?: number | null
          average_delivery_time_status?: string | null
          clusters_data?: Json
          created_at?: string
          delivery_cluster_id?: number
          exact_impact_share?: string | null
          id?: string
          impact_share?: number | null
          lost_profit?: number | null
          marketplace_id?: string
          offer_id?: string | null
          orders_fast_percent?: number | null
          orders_fast_value?: number | null
          orders_long_percent?: number | null
          orders_long_value?: number | null
          orders_medium_percent?: number | null
          orders_medium_value?: number | null
          orders_total?: number | null
          raw_payload?: Json
          recommended_supply?: number | null
          sku?: string
          snapshot_at?: string
          sync_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_avg_delivery_time_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_avg_delivery_time_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "ozon_sync_history"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_credentials: {
        Row: {
          api_key: string
          client_id: string
          created_at: string | null
          id: string
          marketplace_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          api_key: string
          client_id: string
          created_at?: string | null
          id?: string
          marketplace_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          api_key?: string
          client_id?: string
          created_at?: string | null
          id?: string
          marketplace_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_credentials_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_performance_daily: {
        Row: {
          add_to_cart: number | null
          add_to_cart_conversion: number | null
          additional_data: Json | null
          avg_bill: number | null
          campaign_id: string
          campaign_name: string | null
          campaign_type: string | null
          clicks: number | null
          conversion: number | null
          cpc: number | null
          ctr: number | null
          drr: number | null
          favorites: number | null
          id: string
          import_batch_id: string | null
          imported_at: string
          marketplace_id: string
          money_spent: number | null
          offer_id: string | null
          orders: number | null
          orders_model: number | null
          revenue: number | null
          revenue_model: number | null
          sku: string
          stat_date: string
          views: number | null
        }
        Insert: {
          add_to_cart?: number | null
          add_to_cart_conversion?: number | null
          additional_data?: Json | null
          avg_bill?: number | null
          campaign_id: string
          campaign_name?: string | null
          campaign_type?: string | null
          clicks?: number | null
          conversion?: number | null
          cpc?: number | null
          ctr?: number | null
          drr?: number | null
          favorites?: number | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          marketplace_id: string
          money_spent?: number | null
          offer_id?: string | null
          orders?: number | null
          orders_model?: number | null
          revenue?: number | null
          revenue_model?: number | null
          sku: string
          stat_date: string
          views?: number | null
        }
        Update: {
          add_to_cart?: number | null
          add_to_cart_conversion?: number | null
          additional_data?: Json | null
          avg_bill?: number | null
          campaign_id?: string
          campaign_name?: string | null
          campaign_type?: string | null
          clicks?: number | null
          conversion?: number | null
          cpc?: number | null
          ctr?: number | null
          drr?: number | null
          favorites?: number | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          marketplace_id?: string
          money_spent?: number | null
          offer_id?: string | null
          orders?: number | null
          orders_model?: number | null
          revenue?: number | null
          revenue_model?: number | null
          sku?: string
          stat_date?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_performance_daily_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_performance_daily_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_sales_by_warehouse_daily: {
        Row: {
          created_at: string
          id: string
          marketplace_id: string
          offer_id: string
          orders_qty: number
          raw_payload: Json
          revenue: number
          sale_date: string
          sku: string | null
          sync_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marketplace_id: string
          offer_id: string
          orders_qty?: number
          raw_payload?: Json
          revenue?: number
          sale_date: string
          sku?: string | null
          sync_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marketplace_id?: string
          offer_id?: string
          orders_qty?: number
          raw_payload?: Json
          revenue?: number
          sale_date?: string
          sku?: string | null
          sync_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ozon_sales_by_warehouse_daily_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_sales_by_warehouse_daily_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "ozon_sync_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_sales_by_warehouse_daily_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "ozon_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_stock_by_warehouse: {
        Row: {
          created_at: string
          id: string
          in_transit_qty: number
          marketplace_id: string
          offer_id: string
          raw_payload: Json
          reserved_qty: number
          sku: string | null
          snapshot_at: string
          stock_qty: number
          sync_id: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          in_transit_qty?: number
          marketplace_id: string
          offer_id: string
          raw_payload?: Json
          reserved_qty?: number
          sku?: string | null
          snapshot_at?: string
          stock_qty?: number
          sync_id?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          in_transit_qty?: number
          marketplace_id?: string
          offer_id?: string
          raw_payload?: Json
          reserved_qty?: number
          sku?: string | null
          snapshot_at?: string
          stock_qty?: number
          sync_id?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ozon_stock_by_warehouse_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_stock_by_warehouse_sync_id_fkey"
            columns: ["sync_id"]
            isOneToOne: false
            referencedRelation: "ozon_sync_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ozon_stock_by_warehouse_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "ozon_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_sync_history: {
        Row: {
          campaigns_count: number | null
          chunks_count: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          marketplace_id: string
          metadata: Json | null
          period_from: string
          period_to: string
          retries: number | null
          rows_inserted: number | null
          started_at: string
          status: string
          trigger_type: string
          triggered_by: string | null
          updated_at: string | null
        }
        Insert: {
          campaigns_count?: number | null
          chunks_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          marketplace_id: string
          metadata?: Json | null
          period_from: string
          period_to: string
          retries?: number | null
          rows_inserted?: number | null
          started_at?: string
          status?: string
          trigger_type: string
          triggered_by?: string | null
          updated_at?: string | null
        }
        Update: {
          campaigns_count?: number | null
          chunks_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          marketplace_id?: string
          metadata?: Json | null
          period_from?: string
          period_to?: string
          retries?: number | null
          rows_inserted?: number | null
          started_at?: string
          status?: string
          trigger_type?: string
          triggered_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_sync_history_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_ui_connections: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_sync_at: string | null
          marketplace_id: string | null
          ozon_seller_id: string | null
          pairing_code: string
          status: string
          updated_at: string
          user_id: string
          verified_email: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          last_sync_at?: string | null
          marketplace_id?: string | null
          ozon_seller_id?: string | null
          pairing_code: string
          status?: string
          updated_at?: string
          user_id: string
          verified_email?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_sync_at?: string | null
          marketplace_id?: string | null
          ozon_seller_id?: string | null
          pairing_code?: string
          status?: string
          updated_at?: string
          user_id?: string
          verified_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_ui_connections_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ozon_warehouses: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          marketplace_id: string
          name: string | null
          ozon_warehouse_id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_id: string
          name?: string | null
          ozon_warehouse_id: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          marketplace_id?: string
          name?: string | null
          ozon_warehouse_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ozon_warehouses_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_business_data: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_complete: boolean | null
          large_box_quantity: number | null
          marketplace_id: string
          min_ship_qty: number | null
          missing_fields: string[] | null
          offer_id: string
          packaging_notes: string | null
          product_subtype: string | null
          product_type: string | null
          purchase_price: number | null
          purchase_price_updated_at: string | null
          rounding_enabled: boolean
          small_box_quantity: number | null
          storage_zone: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_complete?: boolean | null
          large_box_quantity?: number | null
          marketplace_id: string
          min_ship_qty?: number | null
          missing_fields?: string[] | null
          offer_id: string
          packaging_notes?: string | null
          product_subtype?: string | null
          product_type?: string | null
          purchase_price?: number | null
          purchase_price_updated_at?: string | null
          rounding_enabled?: boolean
          small_box_quantity?: number | null
          storage_zone?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_complete?: boolean | null
          large_box_quantity?: number | null
          marketplace_id?: string
          min_ship_qty?: number | null
          missing_fields?: string[] | null
          offer_id?: string
          packaging_notes?: string | null
          product_subtype?: string | null
          product_type?: string | null
          purchase_price?: number | null
          purchase_price_updated_at?: string | null
          rounding_enabled?: boolean
          small_box_quantity?: number | null
          storage_zone?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_business_data_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_business_data_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          marketplace_id: string
          product_id: string
          relevance_score: number | null
          source_question_id: string | null
          source_reply_id: string | null
          source_review_id: string | null
          source_type: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_id: string
          product_id: string
          relevance_score?: number | null
          source_question_id?: string | null
          source_reply_id?: string | null
          source_review_id?: string | null
          source_type: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_id?: string
          product_id?: string
          relevance_score?: number | null
          source_question_id?: string | null
          source_reply_id?: string | null
          source_review_id?: string | null
          source_type?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_knowledge_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_source_reply_id_fkey"
            columns: ["source_reply_id"]
            isOneToOne: false
            referencedRelation: "replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_source_review_id_fkey"
            columns: ["source_review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      product_volume_history: {
        Row: {
          created_at: string
          data_source: string | null
          height_cm: number | null
          id: string
          is_different_from_standard: boolean | null
          length_cm: number | null
          marketplace_id: string
          measured_date: string
          offer_id: string
          sku: string
          volume_liters: number | null
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          created_at?: string
          data_source?: string | null
          height_cm?: number | null
          id?: string
          is_different_from_standard?: boolean | null
          length_cm?: number | null
          marketplace_id: string
          measured_date: string
          offer_id: string
          sku: string
          volume_liters?: number | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          created_at?: string
          data_source?: string | null
          height_cm?: number | null
          id?: string
          is_different_from_standard?: boolean | null
          length_cm?: number | null
          marketplace_id?: string
          measured_date?: string
          offer_id?: string
          sku?: string
          volume_liters?: number | null
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_volume_history_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_volume_standards: {
        Row: {
          created_at: string
          id: string
          marketplace_id: string
          offer_id: string
          set_by_user_id: string | null
          standard_height_cm: number | null
          standard_length_cm: number | null
          standard_volume_liters: number | null
          standard_weight_kg: number | null
          standard_width_cm: number | null
          tolerance_percent: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          marketplace_id: string
          offer_id: string
          set_by_user_id?: string | null
          standard_height_cm?: number | null
          standard_length_cm?: number | null
          standard_volume_liters?: number | null
          standard_weight_kg?: number | null
          standard_width_cm?: number | null
          tolerance_percent?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marketplace_id?: string
          offer_id?: string
          set_by_user_id?: string | null
          standard_height_cm?: number | null
          standard_length_cm?: number | null
          standard_volume_liters?: number | null
          standard_weight_kg?: number | null
          standard_width_cm?: number | null
          tolerance_percent?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_volume_standards_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcodes: string | null
          brand: string | null
          category: string | null
          commissions: Json | null
          created_at: string
          currency_code: string | null
          description_category_id: number | null
          external_id: string
          id: string
          image_url: string | null
          image_urls: Json | null
          is_archived: boolean | null
          is_discounted: boolean | null
          is_kgt: boolean | null
          is_seasonal: boolean | null
          is_super: boolean | null
          marketing_price: number | null
          marketplace_id: string
          min_price: number | null
          model_info: Json | null
          name: string
          offer_id: string | null
          old_price: number | null
          price: number | null
          price_indexes: Json | null
          promotions: Json | null
          questions_count: number | null
          rating: number | null
          reviews_count: number | null
          sku: string | null
          sources: Json | null
          statuses: Json | null
          stocks: Json | null
          type_id: number | null
          updated_at: string
          url: string | null
          vat: string | null
          volume_weight: number | null
        }
        Insert: {
          barcodes?: string | null
          brand?: string | null
          category?: string | null
          commissions?: Json | null
          created_at?: string
          currency_code?: string | null
          description_category_id?: number | null
          external_id: string
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          is_archived?: boolean | null
          is_discounted?: boolean | null
          is_kgt?: boolean | null
          is_seasonal?: boolean | null
          is_super?: boolean | null
          marketing_price?: number | null
          marketplace_id: string
          min_price?: number | null
          model_info?: Json | null
          name: string
          offer_id?: string | null
          old_price?: number | null
          price?: number | null
          price_indexes?: Json | null
          promotions?: Json | null
          questions_count?: number | null
          rating?: number | null
          reviews_count?: number | null
          sku?: string | null
          sources?: Json | null
          statuses?: Json | null
          stocks?: Json | null
          type_id?: number | null
          updated_at?: string
          url?: string | null
          vat?: string | null
          volume_weight?: number | null
        }
        Update: {
          barcodes?: string | null
          brand?: string | null
          category?: string | null
          commissions?: Json | null
          created_at?: string
          currency_code?: string | null
          description_category_id?: number | null
          external_id?: string
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          is_archived?: boolean | null
          is_discounted?: boolean | null
          is_kgt?: boolean | null
          is_seasonal?: boolean | null
          is_super?: boolean | null
          marketing_price?: number | null
          marketplace_id?: string
          min_price?: number | null
          model_info?: Json | null
          name?: string
          offer_id?: string | null
          old_price?: number | null
          price?: number | null
          price_indexes?: Json | null
          promotions?: Json | null
          questions_count?: number | null
          rating?: number | null
          reviews_count?: number | null
          sku?: string | null
          sources?: Json | null
          statuses?: Json | null
          stocks?: Json | null
          type_id?: number | null
          updated_at?: string
          url?: string | null
          vat?: string | null
          volume_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          language: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          language?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          language?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotion_costs: {
        Row: {
          clicks: number | null
          id: string
          import_batch_id: string | null
          imported_at: string
          impressions: number | null
          marketplace_id: string
          offer_id: string | null
          orders: number | null
          period_end: string
          period_start: string
          promotion_cost: number | null
          promotion_type: string | null
          revenue: number | null
          sku: string
        }
        Insert: {
          clicks?: number | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          impressions?: number | null
          marketplace_id: string
          offer_id?: string | null
          orders?: number | null
          period_end: string
          period_start: string
          promotion_cost?: number | null
          promotion_type?: string | null
          revenue?: number | null
          sku: string
        }
        Update: {
          clicks?: number | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          impressions?: number | null
          marketplace_id?: string
          offer_id?: string | null
          orders?: number | null
          period_end?: string
          period_start?: string
          promotion_cost?: number | null
          promotion_type?: string | null
          revenue?: number | null
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_costs_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_costs_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          author_name: string
          created_at: string
          deleted_at: string | null
          external_id: string
          id: string
          is_answered: boolean | null
          last_generated_at: string | null
          marketplace_id: string | null
          product_id: string
          product_image: string | null
          question_date: string
          source_type: string | null
          status: string | null
          suggested_reply: string | null
          text: string
          updated_at: string
        }
        Insert: {
          author_name: string
          created_at?: string
          deleted_at?: string | null
          external_id: string
          id?: string
          is_answered?: boolean | null
          last_generated_at?: string | null
          marketplace_id?: string | null
          product_id: string
          product_image?: string | null
          question_date: string
          source_type?: string | null
          status?: string | null
          suggested_reply?: string | null
          text: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          created_at?: string
          deleted_at?: string | null
          external_id?: string
          id?: string
          is_answered?: boolean | null
          last_generated_at?: string | null
          marketplace_id?: string | null
          product_id?: string
          product_image?: string | null
          question_date?: string
          source_type?: string | null
          status?: string | null
          suggested_reply?: string | null
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      replies: {
        Row: {
          can_cancel_until: string | null
          content: string
          created_at: string
          deleted_at: string | null
          error_message: string | null
          id: string
          marketplace_id: string
          mode: Database["public"]["Enums"]["reply_mode"]
          published_at: string | null
          question_id: string | null
          retry_count: number | null
          review_id: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["reply_status"] | null
          tone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          can_cancel_until?: string | null
          content: string
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          id?: string
          marketplace_id: string
          mode: Database["public"]["Enums"]["reply_mode"]
          published_at?: string | null
          question_id?: string | null
          retry_count?: number | null
          review_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["reply_status"] | null
          tone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          can_cancel_until?: string | null
          content?: string
          created_at?: string
          deleted_at?: string | null
          error_message?: string | null
          id?: string
          marketplace_id?: string
          mode?: Database["public"]["Enums"]["reply_mode"]
          published_at?: string | null
          question_id?: string | null
          retry_count?: number | null
          review_id?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["reply_status"] | null
          tone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "replies_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          rating: number | null
          tone: string | null
          updated_at: string
          use_count: number | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          rating?: number | null
          tone?: string | null
          updated_at?: string
          use_count?: number | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          rating?: number | null
          tone?: string | null
          updated_at?: string
          use_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reply_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          advantages: string | null
          author_name: string
          created_at: string
          deleted_at: string | null
          disadvantages: string | null
          external_id: string
          id: string
          inserted_at: string | null
          is_answered: boolean | null
          last_generated_at: string | null
          marketplace_id: string
          photos: Json | null
          product_id: string
          product_image: string | null
          rating: number
          raw: Json | null
          review_date: string
          segment: string | null
          source_type: string | null
          status: string | null
          suggested_reply: string | null
          text: string | null
          updated_at: string
        }
        Insert: {
          advantages?: string | null
          author_name: string
          created_at?: string
          deleted_at?: string | null
          disadvantages?: string | null
          external_id: string
          id?: string
          inserted_at?: string | null
          is_answered?: boolean | null
          last_generated_at?: string | null
          marketplace_id: string
          photos?: Json | null
          product_id: string
          product_image?: string | null
          rating: number
          raw?: Json | null
          review_date: string
          segment?: string | null
          source_type?: string | null
          status?: string | null
          suggested_reply?: string | null
          text?: string | null
          updated_at?: string
        }
        Update: {
          advantages?: string | null
          author_name?: string
          created_at?: string
          deleted_at?: string | null
          disadvantages?: string | null
          external_id?: string
          id?: string
          inserted_at?: string | null
          is_answered?: boolean | null
          last_generated_at?: string | null
          marketplace_id?: string
          photos?: Json | null
          product_id?: string
          product_image?: string | null
          rating?: number
          raw?: Json | null
          review_date?: string
          segment?: string | null
          source_type?: string | null
          status?: string | null
          suggested_reply?: string | null
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_calendar: {
        Row: {
          cluster_id: string
          created_at: string
          created_by: string | null
          id: string
          is_booked: boolean
          marketplace_id: string
          notes: string | null
          ship_date: string
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          cluster_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_booked?: boolean
          marketplace_id: string
          notes?: string | null
          ship_date: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          cluster_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_booked?: boolean
          marketplace_id?: string
          notes?: string | null
          ship_date?: string
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_calendar_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_calendar_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_calendar_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_calendar_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "ozon_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_order_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          large_box_quantity: number | null
          marketplace_id: string
          metadata: Json
          offer_id: string
          order_id: string
          product_name: string | null
          quantity: number
          rounding_enabled: boolean
          sku: string | null
          small_box_quantity: number | null
          storage_zone: string | null
          supplier_name: string | null
          total_volume_liters: number | null
          total_weight_kg: number | null
          unit_price: number | null
          unit_volume_liters: number | null
          unit_weight_kg: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          large_box_quantity?: number | null
          marketplace_id: string
          metadata?: Json
          offer_id: string
          order_id: string
          product_name?: string | null
          quantity?: number
          rounding_enabled?: boolean
          sku?: string | null
          small_box_quantity?: number | null
          storage_zone?: string | null
          supplier_name?: string | null
          total_volume_liters?: number | null
          total_weight_kg?: number | null
          unit_price?: number | null
          unit_volume_liters?: number | null
          unit_weight_kg?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          large_box_quantity?: number | null
          marketplace_id?: string
          metadata?: Json
          offer_id?: string
          order_id?: string
          product_name?: string | null
          quantity?: number
          rounding_enabled?: boolean
          sku?: string | null
          small_box_quantity?: number | null
          storage_zone?: string | null
          supplier_name?: string | null
          total_volume_liters?: number | null
          total_weight_kg?: number | null
          unit_price?: number | null
          unit_volume_liters?: number | null
          unit_weight_kg?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_order_items_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "pick_list_view"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "shipment_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shipment_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_orders: {
        Row: {
          cluster_id: string
          comment: string | null
          created_at: string
          created_by: string | null
          export_file_name: string | null
          id: string
          marketplace_id: string
          metadata: Json
          session_id: string
          status: string
          updated_at: string
          version_id: string
        }
        Insert: {
          cluster_id: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          export_file_name?: string | null
          id?: string
          marketplace_id: string
          metadata?: Json
          session_id: string
          status?: string
          updated_at?: string
          version_id: string
        }
        Update: {
          cluster_id?: string
          comment?: string | null
          created_at?: string
          created_by?: string | null
          export_file_name?: string | null
          id?: string
          marketplace_id?: string
          metadata?: Json
          session_id?: string
          status?: string
          updated_at?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_orders_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "allocation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "allocation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_working_date: {
        Row: {
          marketplace_id: string
          updated_at: string
          updated_by: string | null
          working_date: string
        }
        Insert: {
          marketplace_id: string
          updated_at?: string
          updated_by?: string | null
          working_date: string
        }
        Update: {
          marketplace_id?: string
          updated_at?: string
          updated_by?: string | null
          working_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_working_date_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: true
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_working_date_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_costs: {
        Row: {
          category: string | null
          cost_date: string
          descriptive_type: string | null
          id: string
          import_batch_id: string | null
          imported_at: string
          item_flag: string | null
          marketplace_id: string
          offer_id: string
          paid_instances: number | null
          paid_units_count: number | null
          paid_volume_ml: number | null
          product_attribute: string | null
          sku: string | null
          stock_quantity: number | null
          storage_cost_amount: number | null
          total_volume_ml: number | null
          warehouse: string | null
        }
        Insert: {
          category?: string | null
          cost_date: string
          descriptive_type?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          item_flag?: string | null
          marketplace_id: string
          offer_id: string
          paid_instances?: number | null
          paid_units_count?: number | null
          paid_volume_ml?: number | null
          product_attribute?: string | null
          sku?: string | null
          stock_quantity?: number | null
          storage_cost_amount?: number | null
          total_volume_ml?: number | null
          warehouse?: string | null
        }
        Update: {
          category?: string | null
          cost_date?: string
          descriptive_type?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          item_flag?: string | null
          marketplace_id?: string
          offer_id?: string
          paid_instances?: number | null
          paid_units_count?: number | null
          paid_volume_ml?: number | null
          product_attribute?: string | null
          sku?: string | null
          stock_quantity?: number | null
          storage_cost_amount?: number | null
          total_volume_ml?: number | null
          warehouse?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_costs_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "storage_costs_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          delivery_time_days: number | null
          email: string | null
          id: string
          lead_time_days: number | null
          marketplace_id: string
          name: string
          notes: string | null
          payment_delay_days: number | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          delivery_time_days?: number | null
          email?: string | null
          id?: string
          lead_time_days?: number | null
          marketplace_id: string
          name: string
          notes?: string | null
          payment_delay_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          delivery_time_days?: number | null
          email?: string | null
          id?: string
          lead_time_days?: number | null
          marketplace_id?: string
          name?: string
          notes?: string | null
          payment_delay_days?: number | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
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
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          auto_reply_enabled: boolean | null
          created_at: string | null
          id: string
          require_approval_low_rating: boolean | null
          semi_auto_mode: boolean | null
          telegram_chat_id: string | null
          telegram_notifications: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auto_reply_enabled?: boolean | null
          created_at?: string | null
          id?: string
          require_approval_low_rating?: boolean | null
          semi_auto_mode?: boolean | null
          telegram_chat_id?: string | null
          telegram_notifications?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auto_reply_enabled?: boolean | null
          created_at?: string | null
          id?: string
          require_approval_low_rating?: boolean | null
          semi_auto_mode?: boolean | null
          telegram_chat_id?: string | null
          telegram_notifications?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      warehouse_stock_current: {
        Row: {
          created_at: string
          id: string
          import_batch_id: string | null
          marketplace_id: string
          offer_id: string
          stock_date: string
          stock_qty: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_batch_id?: string | null
          marketplace_id: string
          offer_id: string
          stock_date?: string
          stock_qty?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          import_batch_id?: string | null
          marketplace_id?: string
          offer_id?: string
          stock_date?: string
          stock_qty?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_current_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_current_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_current_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pick_list_view: {
        Row: {
          category: string | null
          cluster_id: string | null
          cluster_name: string | null
          cluster_short_name: string | null
          large_box_quantity: number | null
          marketplace_id: string | null
          offer_id: string | null
          order_created_at: string | null
          order_id: string | null
          order_status: string | null
          product_name: string | null
          qty: number | null
          rounding_enabled: boolean | null
          session_id: string | null
          sku: string | null
          small_box_quantity: number | null
          storage_zone: string | null
          supplier_name: string | null
          total_volume_liters: number | null
          total_weight_kg: number | null
          unit_volume_liters: number | null
          unit_weight_kg: number | null
          version_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_orders_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "allocation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_orders_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "allocation_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_current_volume: {
        Row: {
          data_source: string | null
          deviation_percent: number | null
          exceeds_tolerance: boolean | null
          height_cm: number | null
          is_different_from_standard: boolean | null
          length_cm: number | null
          marketplace_id: string | null
          measured_date: string | null
          offer_id: string | null
          sku: string | null
          standard_volume_liters: number | null
          standard_weight_kg: number | null
          tolerance_percent: number | null
          volume_liters: number | null
          weight_kg: number | null
          width_cm: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_volume_history_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge_by_offer: {
        Row: {
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          marketplace_code:
            | Database["public"]["Enums"]["marketplace_type"]
            | null
          marketplace_id: string | null
          marketplace_name: string | null
          offer_id: string | null
          product_id: string | null
          product_name: string | null
          relevance_score: number | null
          source_question_id: string | null
          source_reply_id: string | null
          source_review_id: string | null
          source_type: string | null
          tags: string[] | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_knowledge_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_source_reply_id_fkey"
            columns: ["source_reply_id"]
            isOneToOne: false
            referencedRelation: "replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_knowledge_source_review_id_fkey"
            columns: ["source_review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      product_knowledge_stats_by_offer: {
        Row: {
          auto_reply_entries: number | null
          last_updated: string | null
          manager_entries: number | null
          marketplaces_count: number | null
          offer_id: string | null
          supplier_entries: number | null
          total_knowledge_entries: number | null
        }
        Relationships: []
      }
      product_packaging_info: {
        Row: {
          large_box_quantity: number | null
          marketplace_id: string | null
          offer_id: string | null
          packaging_notes: string | null
          small_box_quantity: number | null
          small_boxes_per_large_box: number | null
        }
        Insert: {
          large_box_quantity?: number | null
          marketplace_id?: string | null
          offer_id?: string | null
          packaging_notes?: string | null
          small_box_quantity?: number | null
          small_boxes_per_large_box?: never
        }
        Update: {
          large_box_quantity?: number | null
          marketplace_id?: string | null
          offer_id?: string | null
          packaging_notes?: string | null
          small_box_quantity?: number | null
          small_boxes_per_large_box?: never
        }
        Relationships: [
          {
            foreignKeyName: "product_business_data_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_costs_aggregated: {
        Row: {
          avg_conversion: number | null
          avg_cpc: number | null
          avg_ctr: number | null
          avg_drr: number | null
          cost_date: string | null
          first_imported_at: string | null
          last_imported_at: string | null
          marketplace_id: string | null
          offer_id: string | null
          promotion_cost: number | null
          sku: string | null
          total_clicks: number | null
          total_orders: number | null
          total_revenue: number | null
          total_views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ozon_performance_daily_marketplace_id_fkey"
            columns: ["marketplace_id"]
            isOneToOne: false
            referencedRelation: "marketplaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      build_pick_list_pivot_sql: {
        Args: { p_marketplace_id: string; p_version_id: string }
        Returns: string
      }
      calculate_boxes_needed: {
        Args: {
          p_marketplace_id: string
          p_offer_id: string
          p_quantity: number
        }
        Returns: {
          large_boxes: number
          loose_units: number
          small_boxes: number
          total_units: number
        }[]
      }
      calculate_review_segment: { Args: { review_id: string }; Returns: string }
      check_fallback_rate_limit: {
        Args: { p_marketplace_id: string; p_rate_limit?: number }
        Returns: boolean
      }
      find_offer_id_by_sku: {
        Args: { p_marketplace_id: string; p_sku: string }
        Returns: string
      }
      generate_pairing_code: { Args: never; Returns: string }
      get_api_credentials: {
        Args: { p_api_type?: string; p_marketplace_id: string }
        Returns: {
          access_token: string
          client_id: string
          client_secret: string
          token_expires_at: string
        }[]
      }
      get_knowledge_for_offer: {
        Args: { p_limit?: number; p_offer_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          marketplace_id: string
          marketplace_name: string
          product_id: string
          relevance_score: number
          source_type: string
          tags: string[]
          title: string
        }[]
      }
      get_knowledge_for_product_with_fallback: {
        Args: { p_limit?: number; p_marketplace_id: string; p_offer_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          is_from_same_marketplace: boolean
          marketplace_id: string
          marketplace_name: string
          product_id: string
          relevance_score: number
          source_type: string
          tags: string[]
          title: string
        }[]
      }
      get_marketplace_sync_mode: {
        Args: { p_marketplace_id: string }
        Returns: string
      }
      get_product_knowledge: {
        Args: { p_limit?: number; p_product_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          relevance_score: number
          source_type: string
          tags: string[]
          title: string
        }[]
      }
      get_sales_analytics: {
        Args: {
          p_end_date: string
          p_marketplace_id: string
          p_start_date: string
        }
        Returns: {
          offer_id: string
          total_promotion_cost: number
          total_quantity: number
          total_sales: number
          total_storage_cost: number
        }[]
      }
      has_api_credentials: {
        Args: { p_api_type?: string; p_marketplace_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lock_and_get_pending_replies: {
        Args: { p_limit?: number; p_marketplace_id: string }
        Returns: {
          content: string
          created_at: string
          id: string
          question_id: string
          review_id: string
        }[]
      }
      log_api_sync_error: {
        Args: {
          p_api_type: string
          p_error_message: string
          p_marketplace_id: string
        }
        Returns: undefined
      }
      log_fallback_action: {
        Args: {
          p_action_type: string
          p_details?: Json
          p_error_message?: string
          p_marketplace_id: string
          p_status: string
          p_user_id: string
        }
        Returns: string
      }
      reset_api_sync_errors: {
        Args: { p_api_type: string; p_marketplace_id: string }
        Returns: undefined
      }
      restore_deleted_record: {
        Args: { p_record_id: string; p_table_name: string }
        Returns: boolean
      }
      search_knowledge_for_offer: {
        Args: { p_limit?: number; p_offer_id: string; p_search_text: string }
        Returns: {
          content: string
          id: string
          marketplace_id: string
          marketplace_name: string
          product_id: string
          rank: number
          relevance_score: number
          source_type: string
          title: string
        }[]
      }
      search_product_knowledge: {
        Args: { p_limit?: number; p_product_id: string; p_search_text: string }
        Returns: {
          content: string
          id: string
          rank: number
          relevance_score: number
          source_type: string
          title: string
        }[]
      }
      trigger_ozon_daily_sync: { Args: never; Returns: undefined }
      trigger_ozon_sync: {
        Args: {
          p_api_key: string
          p_client_id: string
          p_function_name: string
          p_marketplace_id: string
        }
        Returns: undefined
      }
      update_analytics_metrics: { Args: never; Returns: undefined }
      update_api_token: {
        Args: {
          p_access_token: string
          p_api_type: string
          p_expires_in?: number
          p_marketplace_id: string
          p_refresh_token?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "operator" | "analyst"
      consent_status: "pending" | "accepted" | "declined" | "revoked"
      fallback_mode: "disabled" | "browser_extension" | "headful_bot"
      marketplace_type: "wildberries" | "ozon" | "yandex_market"
      reply_mode: "manual" | "semi_auto" | "auto"
      reply_status:
        | "drafted"
        | "scheduled"
        | "published"
        | "failed"
        | "retried"
        | "publishing"
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
      app_role: ["owner", "admin", "operator", "analyst"],
      consent_status: ["pending", "accepted", "declined", "revoked"],
      fallback_mode: ["disabled", "browser_extension", "headful_bot"],
      marketplace_type: ["wildberries", "ozon", "yandex_market"],
      reply_mode: ["manual", "semi_auto", "auto"],
      reply_status: [
        "drafted",
        "scheduled",
        "published",
        "failed",
        "retried",
        "publishing",
      ],
    },
  },
} as const
