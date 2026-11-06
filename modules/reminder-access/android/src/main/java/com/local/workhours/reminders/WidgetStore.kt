package com.local.workhours.reminders

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

internal object WidgetStore {
  private const val TABLE = "catalystLocalStorage"
  private const val DATA = "daily-work-hours-v1"
  private fun db(context: Context) = SQLiteDatabase.openDatabase(
    context.getDatabasePath("RKStorage").path, null, SQLiteDatabase.OPEN_READWRITE
  )
  private fun get(db: SQLiteDatabase, key: String): String? =
    db.query(TABLE, arrayOf("value"), "key = ?", arrayOf(key), null, null, null).use {
      if (it.moveToFirst()) it.getString(0) else null
    }
  private fun put(db: SQLiteDatabase, key: String, value: String) {
    val row = ContentValues().apply { put("key", key); put("value", value) }
    check(db.insertWithOnConflict(TABLE, null, row, SQLiteDatabase.CONFLICT_REPLACE) != -1L)
  }
  private fun <T> transaction(context: Context, work: (SQLiteDatabase) -> T): T = db(context).use {
    it.beginTransaction()
    try { work(it).also { _ -> it.setTransactionSuccessful() } } finally { it.endTransaction() }
  }
  fun compareAndSet(context: Context, expected: String?, value: String): Boolean =
    transaction(context) { database ->
      if (get(database, DATA) != expected) false else { put(database, DATA, value); true }
    }
  fun read(context: Context): JSONObject? {
    if (!context.getDatabasePath("RKStorage").exists()) return null
    return db(context).use { get(it, DATA)?.let(::JSONObject) }
  }
  fun today(now: Calendar = Calendar.getInstance()): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now.time)

  fun record(root: JSONObject?, day: String): JSONObject? {
    val records = root?.getJSONArray("records") ?: return null
    for (i in 0 until records.length()) {
      val row = records.getJSONObject(i)
      if (row.getString("date") == day) return row
    }
    return null
  }
  fun contains(days: JSONArray?, day: Int) = days != null && (0 until days.length()).any { days.getInt(it) == day }
  fun cents(value: String, maximum: Int): Int {
    require(value.matches(Regex("\\d+(\\.\\d{1,2})?")))
    return BigDecimal(value).movePointRight(2).intValueExact().also { require(it in 0..maximum) }
  }
  fun displayHours(hundredths: Int) = BigDecimal.valueOf(hundredths.toLong(), 2).stripTrailingZeros().toPlainString()
}

internal data class WidgetConfig(
  val presets: List<Int> = listOf(800, 1000, 1200),
  val start: String = "09:00", val end: String = "18:00",
  val breakStart: String = "12:00", val breakEnd: String = "13:00",
  val intervalMicros: Long = 100_000
) {
  fun shiftClock(settings: JSONObject, day: Calendar): ShiftClock {
    fun at(time: String): Long = (day.clone() as Calendar).apply {
      val minute = minutes(time)
      set(Calendar.HOUR_OF_DAY, minute / 60); set(Calendar.MINUTE, minute % 60)
      set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    val shift = settings.optJSONObject("shift")
    if (shift == null) {
      val rests = if (breakStart.isBlank()) emptyList() else listOf(at(breakStart) to at(breakEnd))
      return ShiftClock(at(start), at(end), rests)
    }
    val breaks = shift.getJSONArray("breaks")
    return ShiftClock(at(shift.getString("start")), at(shift.getString("end")), (0 until breaks.length()).map {
      val rest = breaks.getJSONObject(it)
      at(rest.getString("start")) to at(rest.getString("end"))
    })
  }

  fun json() = JSONObject().apply {
    put("presets", JSONArray(presets.map(WidgetStore::displayHours)))
    put("start", start); put("end", end); put("breakStart", breakStart); put("breakEnd", breakEnd); put("intervalMicros", intervalMicros)
  }.toString()

  companion object {
    private const val KEY = "configuration"
    private fun preferences(context: Context) = context.getSharedPreferences("daily-work-hours-widgets", Context.MODE_PRIVATE)
    fun read(context: Context): WidgetConfig =
      preferences(context).getString(KEY, null)?.let { runCatching { parse(it, migrate = true) }.getOrNull() } ?: WidgetConfig()
    fun save(context: Context, json: String) {
      val previous = read(context)
      val updated = JSONObject(json).apply {
        put("start", previous.start); put("end", previous.end)
        put("breakStart", previous.breakStart); put("breakEnd", previous.breakEnd)
      }
      val config = parse(updated.toString())
      check(preferences(context).edit().putString(KEY, config.json()).commit()) { "小部件设置未保存" }
    }
    private fun parse(json: String, migrate: Boolean = false): WidgetConfig {
      val data = JSONObject(json)
      val presets = data.getJSONArray("presets")
      require(presets.length() == 3) { "请填写三个快记工时" }
      val amounts = (0..2).map { WidgetStore.cents(presets.getString(it), 2400) / 50 * 50 }
      val start = data.getString("start")
      val end = data.getString("end")
      val breakStart = data.getString("breakStart")
      val breakEnd = data.getString("breakEnd")
      require(minutes(start) < minutes(end)) { "下班时间必须晚于上班时间" }
      require((breakStart.isEmpty() && breakEnd.isEmpty()) ||
        (minutes(breakStart) >= minutes(start) && minutes(breakEnd) <= minutes(end) && minutes(breakStart) < minutes(breakEnd))) {
        "休息时段必须完整且在班次内"
      }
      val stored = if (data.has("intervalMicros")) data.getLong("intervalMicros") else data.getLong("interval") * 1000L
      val micros = if (migrate && stored in 100L until 10_000L && stored % 100L == 0L) 10_000L else stored
      require(micros in 10_000L..3_000_000L && micros % 100L == 0L) { "刷新间隔为 0.01–3 秒，最多四位小数" }
      return WidgetConfig(amounts, start, end, breakStart, breakEnd, micros)
    }
    fun minutes(value: String): Int {
      require(value.matches(Regex("([01]\\d|2[0-3]):[0-5]\\d"))) { "请填写 HH:mm 格式的时间" }
      return value.substring(0, 2).toInt() * 60 + value.substring(3).toInt()
    }
  }
}
