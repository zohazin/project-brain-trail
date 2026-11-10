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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          label: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          label?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          label?: string
        }
        Relationships: []
      }
      chat_reads: {
        Row: {
          last_read_at: string
          request_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          request_id: string
          user_id?: string
        }
        Update: {
          last_read_at?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reads_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      date_changes: {
        Row: {
          created_at: string
          decided_at: string | null
          expires_at: string | null
          id: string
          new_pickup_at: string
          new_quantity: number | null
          new_return_at: string | null
          new_total: number | null
          note: string | null
          old_pickup_at: string | null
          old_quantity: number | null
          old_return_at: string | null
          old_total: number | null
          proposed_by: string
          request_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          new_pickup_at: string
          new_quantity?: number | null
          new_return_at?: string | null
          new_total?: number | null
          note?: string | null
          old_pickup_at?: string | null
          old_quantity?: number | null
          old_return_at?: string | null
          old_total?: number | null
          proposed_by: string
          request_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          expires_at?: string | null
          id?: string
          new_pickup_at?: string
          new_quantity?: number | null
          new_return_at?: string | null
          new_total?: number | null
          note?: string | null
          old_pickup_at?: string | null
          old_quantity?: number | null
          old_return_at?: string | null
          old_total?: number | null
          proposed_by?: string
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "date_changes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          accessories: string
          ai_keywords: string[]
          ai_summary: string | null
          allow_outside: boolean
          area_name: string
          avail_days: number[]
          avail_end: string
          avail_start: string
          category: string
          city: string
          condition: string
          created_at: string
          description: string
          id: string
          is_demo: boolean
          kind: string
          lat: number
          lng: number
          max_distance_km: number
          measured: boolean
          min_amount: number | null
          name: string
          owner_id: string
          photo_path: string | null
          photo_paths: string[]
          price_per: number
          price_period: string
          price_rs: number
          quantity: number
          specs: string
          status: string
          step_amount: number | null
          summary_stale: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          accessories?: string
          ai_keywords?: string[]
          ai_summary?: string | null
          allow_outside?: boolean
          area_name?: string
          avail_days?: number[]
          avail_end?: string
          avail_start?: string
          category?: string
          city?: string
          condition?: string
          created_at?: string
          description?: string
          id?: string
          is_demo?: boolean
          kind?: string
          lat: number
          lng: number
          max_distance_km?: number
          measured?: boolean
          min_amount?: number | null
          name: string
          owner_id: string
          photo_path?: string | null
          photo_paths?: string[]
          price_per?: number
          price_period?: string
          price_rs?: number
          quantity?: number
          specs?: string
          status?: string
          step_amount?: number | null
          summary_stale?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          accessories?: string
          ai_keywords?: string[]
          ai_summary?: string | null
          allow_outside?: boolean
          area_name?: string
          avail_days?: number[]
          avail_end?: string
          avail_start?: string
          category?: string
          city?: string
          condition?: string
          created_at?: string
          description?: string
          id?: string
          is_demo?: boolean
          kind?: string
          lat?: number
          lng?: number
          max_distance_km?: number
          measured?: boolean
          min_amount?: number | null
          name?: string
          owner_id?: string
          photo_path?: string | null
          photo_paths?: string[]
          price_per?: number
          price_period?: string
          price_rs?: number
          quantity?: number
          specs?: string
          status?: string
          step_amount?: number | null
          summary_stale?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      meeting_prefs: {
        Row: {
          free_from: string
          free_to: string
          place: string
          request_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          free_from: string
          free_to: string
          place?: string
          request_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          free_from?: string
          free_to?: string
          place?: string
          request_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_prefs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          request_id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          id?: string
          request_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          request_id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          read_at: string | null
          request_id: string | null
          title: string
          user_id: string
          want_id: string | null
        }
        Insert: {
          body?: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          read_at?: string | null
          request_id?: string | null
          title: string
          user_id: string
          want_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          read_at?: string | null
          request_id?: string | null
          title?: string
          user_id?: string
          want_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_want_id_fkey"
            columns: ["want_id"]
            isOneToOne: false
            referencedRelation: "wants"
            referencedColumns: ["id"]
          },
        ]
      }
      party_addresses: {
        Row: {
          address: string
          home_pickup: boolean
          request_id: string
          shared: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string
          home_pickup?: boolean
          request_id: string
          shared?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          address?: string
          home_pickup?: boolean
          request_id?: string
          shared?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_addresses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area_name: string | null
          avatar_path: string | null
          city: string
          created_at: string
          display_name: string
          id: string
          identity_status: string
          is_demo: boolean
          lat: number | null
          lng: number | null
          onboarded: boolean
          restricted: boolean
          test_cnic: string | null
          travel_km: number
          updated_at: string
        }
        Insert: {
          area_name?: string | null
          avatar_path?: string | null
          city?: string
          created_at?: string
          display_name?: string
          id: string
          identity_status?: string
          is_demo?: boolean
          lat?: number | null
          lng?: number | null
          onboarded?: boolean
          restricted?: boolean
          test_cnic?: string | null
          travel_km?: number
          updated_at?: string
        }
        Update: {
          area_name?: string | null
          avatar_path?: string | null
          city?: string
          created_at?: string
          display_name?: string
          id?: string
          identity_status?: string
          is_demo?: boolean
          lat?: number | null
          lng?: number | null
          onboarded?: boolean
          restricted?: boolean
          test_cnic?: string | null
          travel_km?: number
          updated_at?: string
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          item_stars: number | null
          person_stars: number
          ratee_id: string
          rater_id: string
          request_id: string
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          item_stars?: number | null
          person_stars: number
          ratee_id: string
          rater_id: string
          request_id: string
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          item_stars?: number | null
          person_stars?: number
          ratee_id?: string
          rater_id?: string
          request_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          against_id: string
          appeal: string | null
          appeal_at: string | null
          appeal_by: string | null
          appeal_decided_at: string | null
          appeal_decision: string | null
          area: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_action: string | null
          description: string
          id: string
          kind: string
          photo_path: string | null
          reply: string | null
          reply_at: string | null
          reporter_id: string
          request_id: string
          status: string
        }
        Insert: {
          against_id: string
          appeal?: string | null
          appeal_at?: string | null
          appeal_by?: string | null
          appeal_decided_at?: string | null
          appeal_decision?: string | null
          area?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_action?: string | null
          description: string
          id?: string
          kind: string
          photo_path?: string | null
          reply?: string | null
          reply_at?: string | null
          reporter_id: string
          request_id: string
          status?: string
        }
        Update: {
          against_id?: string
          appeal?: string | null
          appeal_at?: string | null
          appeal_by?: string | null
          appeal_decided_at?: string | null
          appeal_decision?: string | null
          area?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_action?: string | null
          description?: string
          id?: string
          kind?: string
          photo_path?: string | null
          reply?: string | null
          reply_at?: string | null
          reporter_id?: string
          request_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_addresses: {
        Row: {
          address: string
          home_pickup: boolean
          owner_id: string
          request_id: string
          shared: boolean
          updated_at: string
        }
        Insert: {
          address?: string
          home_pickup?: boolean
          owner_id?: string
          request_id: string
          shared?: boolean
          updated_at?: string
        }
        Update: {
          address?: string
          home_pickup?: boolean
          owner_id?: string
          request_id?: string
          shared?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_addresses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_photos: {
        Row: {
          choice: string
          photo_path: string | null
          request_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          choice: string
          photo_path?: string | null
          request_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          choice?: string
          photo_path?: string | null
          request_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_photos_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          agreed: Json | null
          borrower_id: string
          borrower_name: string | null
          borrower_picked_qty: number
          borrower_returned_qty: number
          cancel_reason: string | null
          cancelled_by: string | null
          condition_photos: Json
          created_at: string
          decided_at: string | null
          exception_status: string | null
          handover_log: Json
          id: string
          is_exception: boolean
          item_id: string
          item_name: string
          item_photo: string | null
          kind: string
          note: string | null
          owner_id: string
          owner_name: string
          payment_confirmed_by: string | null
          payment_reported_by: string | null
          payment_status: string
          picked_up_qty: number
          pickup_at: string
          quantity: number
          return_at: string | null
          returned_qty: number
          status: string
          terms_version: number
          total_rs: number
          unit: string
          updated_at: string
          want_id: string
        }
        Insert: {
          agreed?: Json | null
          borrower_id: string
          borrower_name?: string | null
          borrower_picked_qty?: number
          borrower_returned_qty?: number
          cancel_reason?: string | null
          cancelled_by?: string | null
          condition_photos?: Json
          created_at?: string
          decided_at?: string | null
          exception_status?: string | null
          handover_log?: Json
          id?: string
          is_exception?: boolean
          item_id: string
          item_name: string
          item_photo?: string | null
          kind: string
          note?: string | null
          owner_id: string
          owner_name?: string
          payment_confirmed_by?: string | null
          payment_reported_by?: string | null
          payment_status?: string
          picked_up_qty?: number
          pickup_at: string
          quantity: number
          return_at?: string | null
          returned_qty?: number
          status?: string
          terms_version?: number
          total_rs?: number
          unit?: string
          updated_at?: string
          want_id: string
        }
        Update: {
          agreed?: Json | null
          borrower_id?: string
          borrower_name?: string | null
          borrower_picked_qty?: number
          borrower_returned_qty?: number
          cancel_reason?: string | null
          cancelled_by?: string | null
          condition_photos?: Json
          created_at?: string
          decided_at?: string | null
          exception_status?: string | null
          handover_log?: Json
          id?: string
          is_exception?: boolean
          item_id?: string
          item_name?: string
          item_photo?: string | null
          kind?: string
          note?: string | null
          owner_id?: string
          owner_name?: string
          payment_confirmed_by?: string | null
          payment_reported_by?: string | null
          payment_status?: string
          picked_up_qty?: number
          pickup_at?: string
          quantity?: number
          return_at?: string | null
          returned_qty?: number
          status?: string
          terms_version?: number
          total_rs?: number
          unit?: string
          updated_at?: string
          want_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_want_id_fkey"
            columns: ["want_id"]
            isOneToOne: false
            referencedRelation: "wants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          area: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          area?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          area?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wants: {
        Row: {
          ai_keywords: string[]
          ai_summary: string | null
          area_name: string | null
          borrower_id: string
          budget_rs: number | null
          conversation: Json
          created_at: string
          details: string | null
          id: string
          item_name: string | null
          kind: string
          lat: number | null
          lng: number | null
          next_question: string | null
          original_text: string
          pending_plan: Json | null
          photo_path: string | null
          pickup_at: string | null
          purpose: string | null
          quantity: number | null
          requirements: string[]
          return_at: string | null
          search_km: number
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          ai_keywords?: string[]
          ai_summary?: string | null
          area_name?: string | null
          borrower_id?: string
          budget_rs?: number | null
          conversation?: Json
          created_at?: string
          details?: string | null
          id?: string
          item_name?: string | null
          kind?: string
          lat?: number | null
          lng?: number | null
          next_question?: string | null
          original_text?: string
          pending_plan?: Json | null
          photo_path?: string | null
          pickup_at?: string | null
          purpose?: string | null
          quantity?: number | null
          requirements?: string[]
          return_at?: string | null
          search_km?: number
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          ai_keywords?: string[]
          ai_summary?: string | null
          area_name?: string | null
          borrower_id?: string
          budget_rs?: number | null
          conversation?: Json
          created_at?: string
          details?: string | null
          id?: string
          item_name?: string | null
          kind?: string
          lat?: number | null
          lng?: number | null
          next_question?: string | null
          original_text?: string
          pending_plan?: Json | null
          photo_path?: string | null
          pickup_at?: string | null
          purpose?: string | null
          quantity?: number | null
          requirements?: string[]
          return_at?: string | null
          search_km?: number
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_condition_photo: {
        Args: { _path: string; _req: string; _stage: string }
        Returns: undefined
      }
      agreed_with_quote: {
        Args: {
          _a: Json
          _from: string
          _kind: string
          _qty: number
          _to: string
          _total: number
          _unit: string
        }
        Returns: Json
      }
      answer_date_change: {
        Args: { _accept: boolean; _id: string }
        Returns: string
      }
      answer_exception: {
        Args: { _allow: boolean; _req: string }
        Returns: string
      }
      appeal_report: {
        Args: { _appeal: string; _id: string }
        Returns: undefined
      }
      block_from_request: { Args: { _req: string }; Returns: undefined }
      booking_change_check: {
        Args: {
          _pickup: string
          _qty: number
          _return: string
          r: Database["public"]["Tables"]["requests"]["Row"]
        }
        Returns: string
      }
      can_admin_area: {
        Args: { _area: string; _reporter: string }
        Returns: boolean
      }
      cancel_booking: {
        Args: { _reason: string; _req: string }
        Returns: string
      }
      cancel_request: { Args: { _req: string }; Returns: undefined }
      change_want_quantity: {
        Args: { _qty: number; _want: string }
        Returns: Json
      }
      charge_days: { Args: { _from: string; _to: string }; Returns: number }
      chat_open: { Args: { _req: string }; Returns: boolean }
      community_impact: {
        Args: never
        Returns: {
          borrowers: number
          completed: number
          items_returned: number
          lenders: number
          reusable_collected: number
          supplies_shared: number
        }[]
      }
      confirm_handover: {
        Args: {
          _close_pickup: boolean
          _picked: number
          _req: string
          _returned: number
        }
        Returns: undefined
      }
      create_report: {
        Args: {
          _description: string
          _kind: string
          _photo: string
          _req: string
        }
        Returns: string
      }
      date_change_check: {
        Args: {
          _pickup: string
          _return: string
          r: Database["public"]["Tables"]["requests"]["Row"]
        }
        Returns: string
      }
      decide_appeal: {
        Args: { _decision: string; _id: string; _lift: boolean }
        Returns: undefined
      }
      decide_report: {
        Args: { _action: string; _decision: string; _id: string }
        Returns: undefined
      }
      fmt_time: { Args: { t: string }; Returns: string }
      fmt_ts: { Args: { t: string }; Returns: string }
      has_area_role: {
        Args: {
          _area: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked: { Args: { _a: string; _b: string }; Returns: boolean }
      is_demo_user: { Args: { _u: string }; Returns: boolean }
      is_party: { Args: { _req: string }; Returns: boolean }
      item_free_qty: {
        Args: { _exclude?: string; _from: string; _item: string; _to: string }
        Returns: number
      }
      item_ratings: {
        Args: { _ids: string[] }
        Returns: {
          avg_rating: number
          item_id: string
          rating_count: number
        }[]
      }
      item_time_check: {
        Args: {
          _from: string
          _item: Database["public"]["Tables"]["items"]["Row"]
          _to: string
        }
        Returns: string
      }
      km_between: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      listing_detail: {
        Args: { _from?: string; _item: string; _to?: string }
        Returns: {
          accessories: string
          allow_outside: boolean
          area_name: string
          avail_days: number[]
          avail_end: string
          avail_start: string
          avg_rating: number
          category: string
          condition: string
          description: string
          distance_km: number
          free_qty: number
          item_id: string
          item_name: string
          kind: string
          listed_qty: number
          measured: boolean
          min_amount: number
          owner_limit_km: number
          photo_paths: string[]
          price_per: number
          price_period: string
          price_rs: number
          rating_count: number
          specs: string
          step_amount: number
          time_note: string
          unit: string
        }[]
      }
      mark_chat_read: { Args: { _req: string }; Returns: undefined }
      mark_notifications_read: { Args: { _ids: string[] }; Returns: undefined }
      match_items: {
        Args: { _km: number; _want: string }
        Returns: {
          accessories: string
          ai_summary: string
          allow_outside: boolean
          area_name: string
          avg_rating: number
          condition: string
          description: string
          distance_km: number
          free_qty: number
          item_id: string
          item_name: string
          kind: string
          min_amount: number
          needs_summary: boolean
          owner_limit_km: number
          photo_path: string
          price_per: number
          price_period: string
          price_rs: number
          rating_count: number
          specs: string
          step_amount: number
          text_score: number
          time_note: string
          unit: string
        }[]
      }
      nearby_items: {
        Args: { _from?: string; _km: number; _to?: string }
        Returns: {
          area_name: string
          avg_rating: number
          category: string
          distance_km: number
          free_qty: number
          item_id: string
          item_name: string
          kind: string
          listed_qty: number
          photo_path: string
          price_per: number
          price_period: string
          price_rs: number
          rating_count: number
          time_note: string
          unit: string
        }[]
      }
      notify: {
        Args: {
          _body: string
          _bump?: boolean
          _key: string
          _kind: string
          _req: string
          _title: string
          _user: string
          _want: string
        }
        Returns: undefined
      }
      num_txt: { Args: { n: number }; Returns: string }
      party_names: {
        Args: { _ids: string[] }
        Returns: {
          first_name: string
          id: string
        }[]
      }
      price_for: {
        Args: {
          _from: string
          _kind: string
          _per: number
          _period: string
          _price: number
          _qty: number
          _to: string
        }
        Returns: number
      }
      process_due_events: { Args: never; Returns: number }
      propose_booking_change: {
        Args: {
          _note: string
          _pickup: string
          _qty: number
          _req: string
          _return: string
        }
        Returns: string
      }
      propose_date_change: {
        Args: { _note: string; _pickup: string; _req: string; _return: string }
        Returns: string
      }
      quote_item: {
        Args: { _from: string; _item: string; _qty: number; _to: string }
        Returns: Json
      }
      quote_json: {
        Args: {
          _from: string
          _kind: string
          _per: number
          _period: string
          _price: number
          _qty: number
          _to: string
          _unit: string
        }
        Returns: Json
      }
      rate_exchange: {
        Args: {
          _comment: string
          _item_stars: number
          _person_stars: number
          _req: string
        }
        Returns: undefined
      }
      record_handover: {
        Args: { _picked: number; _req: string; _returned: number }
        Returns: undefined
      }
      refresh_my_notifications: { Args: never; Returns: undefined }
      reply_report: {
        Args: { _id: string; _reply: string }
        Returns: undefined
      }
      report_handover: {
        Args: { _picked: number; _req: string; _returned: number }
        Returns: undefined
      }
      report_payment: { Args: { _req: string }; Returns: undefined }
      respond_request: {
        Args: { _accept: boolean; _req: string; _version?: number }
        Returns: string
      }
      send_reminder: { Args: { _req: string }; Returns: undefined }
      send_requests: { Args: { _allocs: Json; _want: string }; Returns: number }
      start_review: { Args: { _id: string }; Returns: undefined }
      unread_counts: {
        Args: never
        Returns: {
          request_id: string
          unread: number
        }[]
      }
      withdraw_date_change: { Args: { _id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "area_admin"
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
      app_role: ["area_admin"],
    },
  },
} as const
