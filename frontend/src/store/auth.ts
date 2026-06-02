import { create } from 'zustand'

export interface AuthUser {
  id: string
  email: string
  full_name: string
  role_name: string | null
  role_display: string | null
  account_type: string
}

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  login: (user: AuthUser, access: string, refresh: string) => void
  logout: () => void
  setUser: (user: AuthUser) => void
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  login(user, access, refresh) {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    set({ user, isAuthenticated: true })
  },

  logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false })
  },

  setUser(user) {
    set({ user })
  },
}))
