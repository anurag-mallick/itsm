/**
 * useChoices — fetches /api/meta/choices/ once per session and caches in memory.
 * Every dropdown that shows statuses, priorities, types, roles, etc. uses this
 * instead of hardcoded arrays.
 */
import { useState, useEffect } from 'react'
import client from '../api/client'

export interface Choice { value: string; label: string }

export interface AllChoices {
  ticket: {
    statuses:   Choice[]
    priorities: Choice[]
    sources:    Choice[]
  }
  asset: {
    statuses: Choice[]
    types:    Choice[]
  }
  software: {
    license_types: Choice[]
  }
  change: {
    statuses:   Choice[]
    types:      Choice[]
    priorities: Choice[]
  }
  sprint: {
    statuses: Choice[]
  }
  role: {
    names: Choice[]
  }
}

// Module-level cache — survives re-renders, cleared on page reload
let _cache: AllChoices | null = null
let _pending: Promise<AllChoices> | null = null

async function fetchChoices(): Promise<AllChoices> {
  if (_cache) return _cache
  if (_pending) return _pending
  _pending = client.get<AllChoices>('/meta/choices/')
    .then(({ data }) => { _cache = data; _pending = null; return data })
    .catch(err => { _pending = null; throw err })
  return _pending
}

export function useChoices() {
  const [choices, setChoices] = useState<AllChoices | null>(_cache)
  const [loading, setLoading] = useState(!_cache)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (_cache) { setChoices(_cache); setLoading(false); return }
    setLoading(true)
    fetchChoices()
      .then(data => { setChoices(data); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  return { choices, loading, error }
}

/** Convenience: preload choices before first render */
export function preloadChoices() {
  fetchChoices().catch(() => {/* silently ignore — will retry on next useChoices() call */})
}
