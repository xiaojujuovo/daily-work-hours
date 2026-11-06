package com.local.workhours.reminders

internal class ShiftClock(val start: Long, val end: Long, breaks: List<Pair<Long, Long>>) {
  private val rests = breaks.sortedBy { it.first }

  fun workingMillis(from: Long, until: Long): Long {
    if (until <= from) return 0
    var covered = from
    var paused = 0L
    for ((start, end) in rests) {
      val left = maxOf(covered, start)
      val right = minOf(until, end)
      if (right > left) {
        paused += right - left
        covered = right
      }
    }
    return until - from - paused
  }

  fun isResting(now: Long) = rests.any { (start, end) -> now >= start && now < end }

  fun clockOutHundredths(now: Long): Int {
    val scheduled = workingMillis(start, minOf(now, end))
    val overtimeBlocks = workingMillis(end, now) / 1_800_000L
    return (scheduled / 36_000L + overtimeBlocks * 50L).toInt().coerceAtMost(2400)
  }
}
