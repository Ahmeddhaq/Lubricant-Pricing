import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../services/supabaseService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError("Supabase is not configured in the frontend build.");
      return undefined;
    }

    let mounted = true;

    const initialize = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;

      if (sessionError) {
        setError(sessionError.message);
      }

      setSession(data.session ?? null);
      setLoading(false);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setError("");
    });

    initialize();

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async ({ email, password }) => {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return data;
  };

  const signUp = async ({ email, password, fullName }) => {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to create account.");
    }

    const createdUser = await response.json();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    return { createdUser, session: data.session };
  };

  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        error,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}