// Human-readable labels for seats and system roles in the UI and exports.

import { seatByKey } from './seats'

/** Seat key used when a side thread is merged back to the main feed. */
export const SIDE_THREAD_SEAT_KEY = 'side-thread'

const EXTRA: Record<string, string> = {
  matt: 'You',
  [SIDE_THREAD_SEAT_KEY]: 'Side Thread',
}

export function displayName(seatKey: string): string {
  return EXTRA[seatKey] ?? seatByKey(seatKey)?.name ?? seatKey
}