import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const profileQuery = (userId: string) =>
  queryOptions({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      return data;
    },
  });

export const rolesQuery = (userId: string) =>
  queryOptions({
    queryKey: ["roles", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("*").eq("user_id", userId);
      return data ?? [];
    },
  });

export const myItemsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["my-items", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

export const itemQuery = (id: string) =>
  queryOptions({
    queryKey: ["item", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

export const wantQuery = (id: string) =>
  queryOptions({
    queryKey: ["want", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("wants").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: reqs } = await supabase
        .from("requests")
        .select("*")
        .eq("want_id", id)
        .order("created_at");
      return { want: data, requests: reqs ?? [] };
    },
    refetchInterval: 6000,
  });

export const activityQuery = (userId: string) =>
  queryOptions({
    queryKey: ["activity", userId],
    queryFn: async () => {
      const [wants, reqs] = await Promise.all([
        supabase
          .from("wants")
          .select("*")
          .eq("borrower_id", userId)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("requests")
          .select("*")
          .or(`borrower_id.eq.${userId},owner_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      return { wants: wants.data ?? [], requests: reqs.data ?? [] };
    },
    refetchInterval: 6000,
  });

export async function fetchRequestBundle(id: string) {
      const { data, error } = await supabase.from("requests").select("*").eq("id", id).single();
      if (error) throw error;
      const [msgs, meet, photos, addr, ratings, reports] = await Promise.all([
        supabase.from("messages").select("*").eq("request_id", id).order("created_at"),
        supabase.from("meeting_prefs").select("*").eq("request_id", id),
        supabase.from("request_photos").select("*").eq("request_id", id),
        supabase.from("party_addresses").select("*").eq("request_id", id),
        supabase.from("ratings").select("*").eq("request_id", id),
        supabase.from("reports").select("*").eq("request_id", id).order("created_at"),
      ]);
      return {
        request: data,
        messages: msgs.data ?? [],
        meeting: meet.data ?? [],
        photos: photos.data ?? [],
        addresses: addr.data ?? [],
        ratings: ratings.data ?? [],
        reports: reports.data ?? [],
      };
}

export type RequestBundle = Awaited<ReturnType<typeof fetchRequestBundle>>;

export const requestQuery = (id: string) =>
  queryOptions({
    queryKey: ["request", id],
    queryFn: () => fetchRequestBundle(id),
    refetchInterval: 5000,
  });

export const blocksQuery = (userId: string) =>
  queryOptions({
    queryKey: ["blocks", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("blocks").select("*").eq("blocker_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

/** In-app notifications. Also creates due reminders and expires unanswered requests whose pickup time passed. */
export const notificationsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      await supabase.rpc("refresh_my_notifications");
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
    // Polling is bounded and pauses while the app is hidden; it refetches on reconnect and when the app is opened again.
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });

export const unreadQuery = (userId: string) =>
  queryOptions({
    queryKey: ["unread", userId],
    queryFn: async () => {
      const { data } = await supabase.rpc("unread_counts");
      return new Map((data ?? []).map((r) => [r.request_id, r.unread]));
    },
    refetchInterval: 15_000,
  });

export const dateChangesQuery = (requestId: string) =>
  queryOptions({
    queryKey: ["date-changes", requestId],
    queryFn: async () => {
      const { data } = await supabase.from("date_changes").select("*").eq("request_id", requestId).order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 8000,
  });

export const impactQuery = () =>
  queryOptions({
    queryKey: ["impact"],
    queryFn: async () => {
      const { data } = await supabase.rpc("community_impact");
      return data?.[0] ?? null;
    },
    staleTime: 60_000,
  });

export function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong. Please try again.";
}
