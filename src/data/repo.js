// Data access: local-first, with optional Supabase sync.
//
//  * Every finished session is written to this device first, so nothing is lost
//    when offline, signed out, or when the database migration has not been applied.
//  * When signed in, sessions are also written to Supabase. New columns are
//    additive (see supabase/migrations); if they do not exist yet the insert
//    falls back to the legacy columns so existing deployments keep working.
//  * Sessions created while signed out stay local until the user chooses to add
//    them to their account.

import { supabase } from '../supabaseClient'
import { DEFAULT_KEYBOARD_PROFILE, normalizeProfile } from '../training/keyboard.js'
import { readJSON, writeJSON } from './localStore.js'

const SESSIONS_KEY = 'sessions.v1'
const KEYBOARD_KEY = 'keyboard.v1'
const GOALS_KEY = 'goals.v1'
const MAX_LOCAL = 250

export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// ---- local sessions --------------------------------------------------------

export function readLocalSessions() {
  const list = readJSON(SESSIONS_KEY, [])
  return Array.isArray(list) ? list : []
}

function writeLocalSessions(list) {
  // keep newest; drop oldest already-synced records first if over the cap
  let out = list
  if (out.length > MAX_LOCAL) {
    const sorted = [...out].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const excess = out.length - MAX_LOCAL
    const drop = new Set()
    for (const s of sorted) if (drop.size < excess && s.synced) drop.add(s.id)
    for (const s of sorted) if (drop.size < excess) drop.add(s.id)
    out = out.filter((s) => !drop.has(s.id))
  }
  return writeJSON(SESSIONS_KEY, out)
}

// ---- mapping -----------------------------------------------------------------

const isMissingColumn = (e) => e && (e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(e.message ?? ''))

/** Local record -> database row. */
export function toRow(rec, userId) {
  const t = rec.tracking
  const measured = t?.status === 'measured'
  return {
    user_id: userId,
    client_id: rec.id,
    created_at: rec.created_at,
    // legacy columns (kept for compatibility; integers as before)
    wpm: Math.round(rec.wpm),
    accuracy: Math.round(rec.accuracy ?? 0),
    peeks: t?.peeks ?? 0,
    eye_discipline: measured && t.discipline != null ? Math.round(t.discipline) : null,
    duration_seconds: Math.round(rec.duration_seconds),
    // additive columns
    mode: rec.mode,
    lesson_id: rec.lesson_id ?? null,
    practice_kind: rec.practice_kind ?? null,
    passed: rec.passed ?? null,
    layout: rec.layout ?? null,
    tracking_status: t?.status ?? 'disabled',
    result: {
      wpm: rec.wpm, raw_wpm: rec.raw_wpm, accuracy: rec.accuracy, consistency: rec.consistency,
      key_consistency: rec.key_consistency, keystrokes: rec.keystrokes, backspaces: rec.backspaces,
      corrections: rec.corrections, wpm_history: rec.wpm_history,
    },
    tracking: t ?? null,
    analysis: rec.analysis ?? null,
  }
}

const LEGACY_COLUMNS = ['user_id', 'created_at', 'wpm', 'accuracy', 'peeks', 'eye_discipline', 'duration_seconds']

/** Database row -> record used by the app. Handles legacy rows that predate the migration. */
export function fromRow(row) {
  const r = row.result ?? {}
  const legacyTracked = row.eye_discipline != null && row.tracking == null
  return {
    id: row.client_id ?? `db-${row.id}`,
    dbId: row.id,
    created_at: row.created_at,
    mode: row.mode ?? 'time-60',
    lesson_id: row.lesson_id ?? null,
    practice_kind: row.practice_kind ?? null,
    passed: row.passed ?? null,
    layout: row.layout ?? null,
    wpm: r.wpm ?? row.wpm,
    raw_wpm: r.raw_wpm ?? null,
    accuracy: r.accuracy ?? row.accuracy,
    consistency: r.consistency ?? null,
    keyConsistency: r.key_consistency ?? null,
    key_consistency: r.key_consistency ?? null,
    keystrokes: r.keystrokes ?? null,
    backspaces: r.backspaces ?? null,
    corrections: r.corrections ?? null,
    duration_seconds: row.duration_seconds,
    wpm_history: r.wpm_history ?? null,
    analysis: row.analysis ?? null,
    // Old rows stored eye_discipline defaulting to 100 whenever tracking was absent, so
    // they cannot be trusted as measurements. Only rows with new tracking metadata are.
    tracking: row.tracking ?? (legacyTracked ? { status: 'legacy', legacyDiscipline: row.eye_discipline, peeks: row.peeks } : { status: 'unavailable' }),
    synced: true,
    legacy: row.tracking == null,
  }
}

// ---- save / load ----------------------------------------------------------------

async function currentUser() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser().catch(() => ({ data: null }))
  return data?.user ?? null
}

async function insertRow(rec, userId) {
  const row = toRow(rec, userId)
  let { error } = await supabase.from('sessions').insert(row)
  if (error && isMissingColumn(error)) {
    // Migration not applied yet: legacy columns only. Unmeasured tracking has no honest legacy value.
    const legacy = Object.fromEntries(LEGACY_COLUMNS.map((k) => [k, row[k]]))
    ;({ error } = await supabase.from('sessions').insert(legacy))
  }
  if (error && error.code === '23505') return null // duplicate client_id: already stored
  return error
}

/**
 * Saves a finished session. Always stored locally; synced when signed in.
 * @returns {{ record, cloud: 'saved'|'local-only'|'signed-out'|'error', error?: string }}
 */
export async function saveSession(rec) {
  const user = await currentUser()
  const record = { ...rec, user_id: user?.id ?? null, synced: false }
  const list = readLocalSessions()
  list.push(record)
  writeLocalSessions(list)
  if (!supabase) return { record, cloud: 'local-only' }
  if (!user) return { record, cloud: 'signed-out' }
  const error = await insertRow(record, user.id)
  if (error) return { record, cloud: 'error', error: error.message }
  markSynced([record.id])
  return { record: { ...record, synced: true }, cloud: 'saved' }
}

function markSynced(ids) {
  const set = new Set(ids)
  writeLocalSessions(readLocalSessions().map((s) => (set.has(s.id) ? { ...s, synced: true } : s)))
}

/** Loads cloud + local sessions for the current visitor, oldest first. */
export async function loadSessions() {
  const user = await currentUser()
  const local = readLocalSessions()
  let cloud = []
  let cloudError = null
  if (user) {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1000)
    if (error) cloudError = error.message
    else cloud = (data ?? []).map(fromRow)
  }
  const cloudIds = new Set(cloud.map((s) => s.id))
  // local sessions that belong to this user (or to nobody yet) and are not already in the cloud
  const mine = local.filter((s) => !cloudIds.has(s.id) && (!user || s.user_id === user.id || s.user_id == null))
  const unsynced = user ? local.filter((s) => !cloudIds.has(s.id) && s.user_id == null) : []
  const merged = [...cloud, ...mine].sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { sessions: merged, user, cloudError, pendingLocal: unsynced.length, signedIn: Boolean(user) }
}

/** Upload sessions that were recorded while signed out (explicit user action). */
export async function claimLocalSessions() {
  const user = await currentUser()
  if (!user) return { uploaded: 0, failed: 0 }
  const pending = readLocalSessions().filter((s) => s.user_id == null || (s.user_id === user.id && !s.synced))
  let uploaded = 0
  let failed = 0
  const done = []
  for (const s of pending) {
    const err = await insertRow(s, user.id)
    if (err) failed++
    else {
      uploaded++
      done.push(s.id)
    }
  }
  writeLocalSessions(readLocalSessions().map((s) => (done.includes(s.id) ? { ...s, user_id: user.id, synced: true } : s)))
  return { uploaded, failed }
}

// ---- keyboard profile & goals ---------------------------------------------------

export function readKeyboardProfile() {
  return normalizeProfile(readJSON(KEYBOARD_KEY, DEFAULT_KEYBOARD_PROFILE))
}

export async function saveKeyboardProfile(profile) {
  const p = normalizeProfile(profile)
  writeJSON(KEYBOARD_KEY, p)
  const user = await currentUser()
  if (user) {
    const { error } = await supabase.from('user_profiles').upsert({ user_id: user.id, keyboard: p, updated_at: new Date().toISOString() })
    if (error) return { profile: p, cloud: 'error' }
    return { profile: p, cloud: 'saved' }
  }
  return { profile: p, cloud: user === null && supabase ? 'signed-out' : 'local-only' }
}

/** Pull the cloud keyboard profile if one exists (cloud wins on a new device). */
export async function pullKeyboardProfile() {
  const user = await currentUser()
  if (!user) return null
  const { data, error } = await supabase.from('user_profiles').select('keyboard').eq('user_id', user.id).maybeSingle()
  if (error || !data?.keyboard) return null
  const p = normalizeProfile(data.keyboard)
  writeJSON(KEYBOARD_KEY, p)
  return p
}

export function readGoals() {
  const g = readJSON(GOALS_KEY, [])
  return Array.isArray(g) ? g : []
}

export function saveGoals(goals) {
  return writeJSON(GOALS_KEY, goals)
}

// ---- layout observations (for suggesting the OS layout from real typing) -------

const OBS_KEY = 'layoutObs.v1'

export function readLayoutObservations() {
  return readJSON(OBS_KEY, { pairs: {}, isoSeen: false })
}

export function mergeLayoutObservations(pairs, isoSeen) {
  const cur = readLayoutObservations()
  for (const [k, n] of Object.entries(pairs)) cur.pairs[k] = (cur.pairs[k] ?? 0) + n
  // keep the table bounded
  const entries = Object.entries(cur.pairs)
  if (entries.length > 400) cur.pairs = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, 300))
  cur.isoSeen = cur.isoSeen || isoSeen
  writeJSON(OBS_KEY, cur)
  return cur
}
