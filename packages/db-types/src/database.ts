export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agency_clients: {
        Row: {
          allotment: number
          client_id: string
          created_at: string
          id: string
          owner_id: string
          status: string
          updated_at: string
          used: number
        }
        Insert: {
          allotment?: number
          client_id: string
          created_at?: string
          id?: string
          owner_id: string
          status?: string
          updated_at?: string
          used?: number
        }
        Update: {
          allotment?: number
          client_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          status?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "agency_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          audio_seconds: number
          cached_input_tokens: number
          cost_usd: number
          created_at: string
          id: number
          images: number
          input_tokens: number
          job_id: string | null
          model: string
          output_tokens: number
          provider: string
          purpose: string | null
          user_id: string | null
        }
        Insert: {
          audio_seconds?: number
          cached_input_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: never
          images?: number
          input_tokens?: number
          job_id?: string | null
          model: string
          output_tokens?: number
          provider: string
          purpose?: string | null
          user_id?: string | null
        }
        Update: {
          audio_seconds?: number
          cached_input_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: never
          images?: number
          input_tokens?: number
          job_id?: string | null
          model?: string
          output_tokens?: number
          provider?: string
          purpose?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audiobooks: {
        Row: {
          book_id: string
          chapters: Json
          cover_path: string | null
          created_at: string
          error: string | null
          id: string
          series_id: string
          speed: number
          status: string
          total_seconds: number | null
          updated_at: string
          user_id: string
          voice: string
          zip_path: string | null
        }
        Insert: {
          book_id: string
          chapters?: Json
          cover_path?: string | null
          created_at?: string
          error?: string | null
          id?: string
          series_id: string
          speed?: number
          status?: string
          total_seconds?: number | null
          updated_at?: string
          user_id: string
          voice: string
          zip_path?: string | null
        }
        Update: {
          book_id?: string
          chapters?: Json
          cover_path?: string | null
          created_at?: string
          error?: string | null
          id?: string
          series_id?: string
          speed?: number
          status?: string
          total_seconds?: number | null
          updated_at?: string
          user_id?: string
          voice?: string
          zip_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audiobooks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiobooks_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiobooks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          meta: Json
          target: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          target?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bible_versions: {
        Row: {
          book_id: string | null
          chapter_id: string | null
          created_at: string
          data: Json
          diff: Json | null
          id: string
          series_id: string
          source: string
          version: number
        }
        Insert: {
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          data: Json
          diff?: Json | null
          id?: string
          series_id: string
          source?: string
          version: number
        }
        Update: {
          book_id?: string | null
          chapter_id?: string | null
          created_at?: string
          data?: Json
          diff?: Json | null
          id?: string
          series_id?: string
          source?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bible_versions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bible_versions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bible_versions_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          continuity_report: Json | null
          created_at: string
          id: string
          length_preset: string
          metadata: Json | null
          outline: Json | null
          part_number: number
          premise: string
          prompt_version: string | null
          series_id: string
          status: string
          subtitle: string | null
          summary: string | null
          title: string
          updated_at: string
          word_count: number
        }
        Insert: {
          continuity_report?: Json | null
          created_at?: string
          id?: string
          length_preset?: string
          metadata?: Json | null
          outline?: Json | null
          part_number: number
          premise?: string
          prompt_version?: string | null
          series_id: string
          status?: string
          subtitle?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          word_count?: number
        }
        Update: {
          continuity_report?: Json | null
          created_at?: string
          id?: string
          length_preset?: string
          metadata?: Json | null
          outline?: Json | null
          part_number?: number
          premise?: string
          prompt_version?: string | null
          series_id?: string
          status?: string
          subtitle?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "books_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      box_sets: {
        Row: {
          book_ids: string[]
          cover_path: string | null
          created_at: string
          description: string | null
          epub_path: string | null
          error: string | null
          id: string
          series_id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_ids?: string[]
          cover_path?: string | null
          created_at?: string
          description?: string | null
          epub_path?: string | null
          error?: string | null
          id?: string
          series_id: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_ids?: string[]
          cover_path?: string | null
          created_at?: string
          description?: string | null
          epub_path?: string | null
          error?: string | null
          id?: string
          series_id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_sets_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_versions: {
        Row: {
          chapter_id: string
          content: Json
          content_text: string
          created_at: string
          created_by: string | null
          id: string
          source: string
        }
        Insert: {
          chapter_id: string
          content: Json
          content_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string
        }
        Update: {
          chapter_id?: string
          content?: Json
          content_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_versions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          book_id: string
          content: Json | null
          content_text: string
          created_at: string
          id: string
          number: number
          search: unknown
          status: string
          summary: string | null
          title: string
          updated_at: string
          word_count: number
        }
        Insert: {
          book_id: string
          content?: Json | null
          content_text?: string
          created_at?: string
          id?: string
          number: number
          search?: unknown
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          word_count?: number
        }
        Update: {
          book_id?: string
          content?: Json | null
          content_text?: string
          created_at?: string
          id?: string
          number?: number
          search?: unknown
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      covers: {
        Row: {
          art_path: string | null
          book_id: string
          created_at: string
          final_path: string | null
          id: string
          is_active: boolean
          layers: Json | null
          mode: string
          page_count: number | null
          prompt: string | null
          stale: boolean
          type: string
          updated_at: string
        }
        Insert: {
          art_path?: string | null
          book_id: string
          created_at?: string
          final_path?: string | null
          id?: string
          is_active?: boolean
          layers?: Json | null
          mode?: string
          page_count?: number | null
          prompt?: string | null
          stale?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          art_path?: string | null
          book_id?: string
          created_at?: string
          final_path?: string | null
          id?: string
          is_active?: boolean
          layers?: Json | null
          mode?: string
          page_count?: number | null
          prompt?: string | null
          stale?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "covers_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_balances: {
        Row: {
          balance: number
          pool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          pool: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          pool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_costs: {
        Row: {
          action: string
          credits: number
          pool: string
          updated_at: string
        }
        Insert: {
          action: string
          credits: number
          pool?: string
          updated_at?: string
        }
        Update: {
          action?: string
          credits?: number
          pool?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          acting_user_id: string | null
          actor_id: string | null
          amount: number
          created_at: string
          id: number
          job_id: string | null
          pool: string
          reason: string | null
          settled_at: string | null
          status: string
          user_id: string
          user_plan_id: string | null
        }
        Insert: {
          acting_user_id?: string | null
          actor_id?: string | null
          amount: number
          created_at?: string
          id?: never
          job_id?: string | null
          pool: string
          reason?: string | null
          settled_at?: string | null
          status: string
          user_id: string
          user_plan_id?: string | null
        }
        Update: {
          acting_user_id?: string | null
          actor_id?: string | null
          amount?: number
          created_at?: string
          id?: never
          job_id?: string | null
          pool?: string
          reason?: string | null
          settled_at?: string | null
          status?: string
          user_id?: string
          user_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_acting_user_id_fkey"
            columns: ["acting_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_user_plan_id_fkey"
            columns: ["user_plan_id"]
            isOneToOne: false
            referencedRelation: "user_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          book_id: string | null
          created_at: string
          error: string | null
          expires_at: string | null
          files: Json
          formats: string[]
          id: string
          series_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          files?: Json
          formats?: string[]
          id?: string
          series_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          files?: Json
          formats?: string[]
          id?: string
          series_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_assets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          kind: string
          sort_order: number
          storage_path: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          kind: string
          sort_order?: number
          storage_path?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          sort_order?: number
          storage_path?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      images: {
        Row: {
          created_at: string
          height: number | null
          id: string
          path: string
          prompt: string | null
          source: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          path: string
          prompt?: string | null
          source?: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          path?: string
          prompt?: string | null
          source?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          cancel_requested: boolean
          created_at: string
          credits_reserved: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          ledger_id: number | null
          meta: Json
          progress: number
          queued_at: string
          ref_id: string | null
          started_at: string | null
          status: string
          step_label: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          cancel_requested?: boolean
          created_at?: string
          credits_reserved?: number
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          ledger_id?: number | null
          meta?: Json
          progress?: number
          queued_at?: string
          ref_id?: string | null
          started_at?: string | null
          status?: string
          step_label?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          cancel_requested?: boolean
          created_at?: string
          credits_reserved?: number
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          ledger_id?: number | null
          meta?: Json
          progress?: number
          queued_at?: string
          ref_id?: string | null
          started_at?: string | null
          status?: string
          step_label?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pen_names: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pen_names_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          grant_agency_credits: number
          grant_audio_credits: number
          grant_main_credits: number
          is_downsell: boolean
          level: string
          limits: Json
          name: string
          price_usd: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          grant_agency_credits?: number
          grant_audio_credits?: number
          grant_main_credits?: number
          is_downsell?: boolean
          level: string
          limits?: Json
          name: string
          price_usd?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          grant_agency_credits?: number
          grant_audio_credits?: number
          grant_main_credits?: number
          is_downsell?: boolean
          level?: string
          limits?: Json
          name?: string
          price_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credentials_pending: boolean
          email: string
          id: string
          last_active_at: string | null
          name: string
          parent_agency_id: string | null
          reseller_owner_id: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credentials_pending?: boolean
          email: string
          id: string
          last_active_at?: string | null
          name?: string
          parent_agency_id?: string | null
          reseller_owner_id?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credentials_pending?: boolean
          email?: string
          id?: string
          last_active_at?: string | null
          name?: string
          parent_agency_id?: string | null
          reseller_owner_id?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_parent_agency_id_fkey"
            columns: ["parent_agency_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reseller_owner_id_fkey"
            columns: ["reseller_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          platform: string
          product_id: string | null
          raw: Json | null
          status: string
          txn_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          platform: string
          product_id?: string | null
          raw?: Json | null
          status?: string
          txn_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          platform?: string
          product_id?: string | null
          raw?: Json | null
          status?: string
          txn_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_licenses: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          owner_id: string
          status: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          owner_id: string
          status?: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          owner_id?: string
          status?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_licenses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_licenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      series: {
        Row: {
          arc: Json | null
          audience: string
          cover_style: Json | null
          created_at: string
          deleted_at: string | null
          genre: string
          id: string
          idea: string
          is_fiction: boolean
          language: string
          pen_name: string
          planned_books: number
          search: unknown
          settings: Json
          status: string
          template_id: string | null
          title: string
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arc?: Json | null
          audience?: string
          cover_style?: Json | null
          created_at?: string
          deleted_at?: string | null
          genre: string
          id?: string
          idea: string
          is_fiction?: boolean
          language?: string
          pen_name?: string
          planned_books?: number
          search?: unknown
          settings?: Json
          status?: string
          template_id?: string | null
          title: string
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arc?: Json | null
          audience?: string
          cover_style?: Json | null
          created_at?: string
          deleted_at?: string | null
          genre?: string
          id?: string
          idea?: string
          is_fiction?: boolean
          language?: string
          pen_name?: string
          planned_books?: number
          search?: unknown
          settings?: Json
          status?: string
          template_id?: string | null
          title?: string
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      series_bible: {
        Row: {
          created_at: string
          data: Json
          series_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          data?: Json
          series_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          data?: Json
          series_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "series_bible_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: true
            referencedRelation: "series"
            referencedColumns: ["id"]
          },
        ]
      }
      training_lessons: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          is_published: boolean
          module_id: string
          sort_order: number
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          module_id: string
          sort_order?: number
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_published?: boolean
          module_id?: string
          sort_order?: number
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          slug: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          slug: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          slug?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      training_progress: {
        Row: {
          completed_at: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "training_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plans: {
        Row: {
          created_at: string
          credits_granted: Json
          granted_at: string
          granted_by: string | null
          id: string
          plan_code: string
          purchase_id: string | null
          revoked_at: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_granted?: Json
          granted_at?: string
          granted_by?: string | null
          id?: string
          plan_code: string
          purchase_id?: string | null
          revoked_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_granted?: Json
          granted_at?: string
          granted_by?: string | null
          id?: string
          plan_code?: string
          purchase_id?: string | null
          revoked_at?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_plans_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_plans_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "user_plans_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_credits: {
        Args: {
          p_actor: string
          p_amount: number
          p_pool: string
          p_reason: string
          p_user: string
        }
        Returns: number
      }
      commit_credits: { Args: { p_ledger: number }; Returns: string }
      ensure_credit_balance: {
        Args: { p_pool: string; p_user: string }
        Returns: undefined
      }
      grant_plan_credits: { Args: { p_user_plan: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_agency_owner_of: { Args: { p_user: string }; Returns: boolean }
      owns_book: { Args: { p_book: string }; Returns: boolean }
      owns_chapter: { Args: { p_chapter: string }; Returns: boolean }
      owns_series: { Args: { p_series: string }; Returns: boolean }
      refund_credits: {
        Args: { p_ledger: number; p_reason?: string }
        Returns: string
      }
      reserve_credits: {
        Args: {
          p_acting_user?: string
          p_amount: number
          p_job?: string
          p_pool: string
          p_reason?: string
          p_user: string
        }
        Returns: number
      }
      revoke_plan_credits: { Args: { p_user_plan: string }; Returns: Json }
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

