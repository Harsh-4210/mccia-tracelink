import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../firebase";

type User = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
};

type AuthContextType = {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  firebaseUser: null,
  token: null,
  isAuthenticated: false,
  login: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync backend user record whenever Firebase auth state changes
  const syncBackendUser = useCallback(async (fbUser: FirebaseUser) => {
    const idToken = await fbUser.getIdToken();
    setToken(idToken);

    // Register/sync user with our backend (creates user record if first login)
    try {
      const res = await fetch("/api/v1/auth/firebase-sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || data.full_name,
          role: data.role || "operator",
        });
      } else {
        // Backend sync failed but Firebase auth succeeded - set basic user
        setUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          role: "operator",
        });
      }
    } catch {
      // Network error — still let user in with basic info
      setUser({
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        role: "operator",
      });
    }
  }, []);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        await syncBackendUser(fbUser);
      } else {
        setFirebaseUser(null);
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [syncBackendUser]);

  // Refresh token every 50 minutes (Firebase tokens expire in 60 min)
  useEffect(() => {
    if (!firebaseUser) return;
    const interval = setInterval(async () => {
      const newToken = await firebaseUser.getIdToken(true);
      setToken(newToken);
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [firebaseUser]);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const register = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setToken(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        isAuthenticated: !!user,
        login,
        loginWithGoogle,
        register,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
