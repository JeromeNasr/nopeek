// Per-deployment options, read at build time from VITE_* environment variables
// (set them in your host's project settings; see docs/DEPLOY.md).
import { isCloudConfigured } from '../supabaseClient'

/** Only absolute https links are accepted, so a typo can't produce a broken or unsafe link. */
function httpsUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export const SITE = {
  /** Accounts and cloud sync exist only when Supabase credentials were provided at build time. */
  accounts: isCloudConfigured,
  /** Optional form where testers can send feedback (e.g. a Google Form or Tally link). */
  feedbackUrl: httpsUrl(import.meta.env.VITE_FEEDBACK_URL),
  /** Optional link to the source code (TouchType is GPL-3.0; publishing it means offering the source). */
  sourceUrl: httpsUrl(import.meta.env.VITE_SOURCE_URL),
}
