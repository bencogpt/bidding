import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { auth } from '../lib/firebase';
import type { Role } from '@obms/shared';

interface AuthState {
  user: User | null;
  role: Role | null;
  supplierId: string | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onIdTokenChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const token = await u.getIdTokenResult();
        setRole((token.claims.role as Role) ?? null);
        setSupplierId((token.claims.supplierId as string) ?? null);
      } else {
        setRole(null);
        setSupplierId(null);
      }
      setLoading(false);
    });
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <Ctx.Provider value={{ user, role, supplierId, loading, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}
