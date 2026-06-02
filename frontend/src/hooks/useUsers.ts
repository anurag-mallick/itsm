/**
 * useUsers — fetches all users from /api/users/.
 * Used by any assignee / reporter dropdown across the app.
 */
import { useState, useEffect } from 'react'
import client from '../api/client'

export interface UserOption {
  id: string
  email: string
  full_name: string
  role_name: string | null
  role_display: string | null
  is_active: boolean
}

interface PaginatedUsers { count: number; results: UserOption[] }

/** Fetch ALL pages up to 200 users */
async function fetchAllUsers(): Promise<UserOption[]> {
  const { data } = await client.get<PaginatedUsers>('/users/', {
    params: { page_size: 200, ordering: 'first_name' }
  })
  return Array.isArray(data) ? data : (data.results ?? [])
}

let _userCache: UserOption[] | null = null
let _userPending: Promise<UserOption[]> | null = null

function getUsers(): Promise<UserOption[]> {
  if (_userCache) return Promise.resolve(_userCache)
  if (_userPending) return _userPending
  _userPending = fetchAllUsers()
    .then(users => { _userCache = users; _userPending = null; return users })
    .catch(err => { _userPending = null; throw err })
  return _userPending
}

export function invalidateUserCache() { _userCache = null }

export function useUsers(opts?: { agentsOnly?: boolean; activeOnly?: boolean }) {
  const [users, setUsers] = useState<UserOption[]>(_userCache ?? [])
  const [loading, setLoading] = useState(!_userCache)

  useEffect(() => {
    if (_userCache) { applyFilters(_userCache); setLoading(false); return }
    setLoading(true)
    getUsers()
      .then(all => { applyFilters(all); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])  // eslint-disable-line

  function applyFilters(all: UserOption[]) {
    let filtered = all
    if (opts?.activeOnly !== false) filtered = filtered.filter(u => u.is_active)
    if (opts?.agentsOnly) {
      filtered = filtered.filter(u =>
        ['it_agent', 'it_manager', 'super_admin'].includes(u.role_name ?? '')
      )
    }
    setUsers(filtered)
  }

  return { users, loading }
}
