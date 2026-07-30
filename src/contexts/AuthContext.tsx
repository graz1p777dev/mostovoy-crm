'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Employee } from '@/types'

interface ImpersonationInfo {
  id: string
  name: string
  role: string
}

interface AuthContextType {
  user: Employee | null
  realUser: Employee | null
  impersonating: ImpersonationInfo | null
  loading: boolean
  signOut: () => Promise<void>
  updateUser: (patch: Partial<Employee>) => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  realUser: null,
  impersonating: null,
  loading: false,
  signOut: async () => {},
  updateUser: () => {},
})

interface AuthProviderProps {
  children: ReactNode
  initialEmployee: Employee | null
  initialRealUser: Employee | null
  initialImpersonation: ImpersonationInfo | null
}

export function AuthProvider({
  children,
  initialEmployee,
  initialRealUser,
  initialImpersonation,
}: AuthProviderProps) {
  // Начальное состояние приходит с сервера — никаких клиентских запросов при инициализации.
  // onAuthStateChange используется ТОЛЬКО для отслеживания SIGNED_OUT (logout).
  const [user, setUser]         = useState<Employee | null>(initialEmployee)
  const [realUser, setRealUser] = useState<Employee | null>(initialRealUser)
  const [impersonating, setImp] = useState<ImpersonationInfo | null>(initialImpersonation)
  const supabase = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setRealUser(null)
        setImp(null)
      }
    })
    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setRealUser(null)
    setImp(null)
  }

  const updateUser = (patch: Partial<Employee>) => {
    setUser(prev => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <AuthContext.Provider value={{ user, realUser, impersonating, loading: false, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
