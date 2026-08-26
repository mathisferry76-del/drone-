"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase";

interface AuthState {
  loading: boolean;
  session: Session | null;
}

/** Tracks the current Supabase auth session client-side, live-updated on
 * sign-in/sign-out. Returns `{ loading: false, session: null }` immediately
 * if Supabase isn't configured on this deployment. */
export function useSupabaseUser(): AuthState {
  const [state, setState] = useState<AuthState>({ loading: true, session: null });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setState({ loading: false, session: null });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setState({ loading: false, session: data.session });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, session });
    });

    return () => listener.subscription.unsubscribe();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return state;
}
