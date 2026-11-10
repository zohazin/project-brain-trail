import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!data.user) {
      // Offline (or the check couldn't reach the server): keep the person signed in on this device
      // instead of sending them to the sign-up page. The server still checks every request.
      const offline = (typeof navigator !== "undefined" && !navigator.onLine) || error?.name === "AuthRetryableFetchError";
      if (offline) {
        const { data: s } = await supabase.auth.getSession();
        const u = s.session?.user;
        if (u) return { userId: u.id, email: u.email ?? "" };
      }
      throw redirect({ to: "/auth" });
    }
    return { userId: data.user.id, email: data.user.email ?? "" };
  },
  component: () => <Outlet />,
});
