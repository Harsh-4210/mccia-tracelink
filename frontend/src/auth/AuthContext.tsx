import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  reauthenticateWithPopup,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth } from "../firebase";

type User = {
  uid: string;
  user_id: string;
  email: string | null;
  displayName: string | null;
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
  deleteUserAccount: (password?: string) => Promise<void>;
  isGoogleUser: boolean;
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
  deleteUserAccount: async () => {},
  isGoogleUser: false,
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
          user_id: data.user_id || fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName || data.full_name,
        });
      } else {
        // Backend sync failed but Firebase auth succeeded - set basic user
        setUser({
          uid: fbUser.uid,
          user_id: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
        });
      }
    } catch {
      // Network error — still let user in with basic info
      setUser({
        uid: fbUser.uid,
        user_id: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
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

  const logoutUser = async () => {
    await signOut(auth);
    setToken(null);
    setUser(null);
  };

  const isGoogleUser = !!(firebaseUser?.providerData?.[0]?.providerId === "google.com");

  const deleteUserAccount = async (password?: string) => {
    if (!firebaseUser) return;
    try {
      // Re-authenticate based on provider
      if (isGoogleUser) {
        // Google users: re-auth via popup (no password needed)
        await reauthenticateWithPopup(firebaseUser, googleProvider);
      } else if (password && firebaseUser.email) {
        // Email/password users: re-auth with credential
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await reauthenticateWithCredential(firebaseUser, credential);
      }
      // Delete from local backend first
      const tkn = await firebaseUser.getIdToken();
      await fetch("/api/v1/auth/me", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tkn}` }
      });
      // Delete from Firebase
      await deleteUser(firebaseUser);
      setToken(null);
      setUser(null);
    } catch (err: any) {
      console.error("Failed to delete account:", err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        isAuthenticated: !!user,
        isGoogleUser,
        login,
        loginWithGoogle,
        register,
        logout: logoutUser,
        deleteUserAccount,
        loading,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}
