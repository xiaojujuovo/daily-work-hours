package com.local.workhours.reminders

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.Gravity
import android.widget.RemoteViews
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

internal object HomeWidgets {
  const val QUICK = "daily-work-hours.widget.QUICK"
  const val CLOCK_OUT = "daily-work-hours.widget.CLOCK_OUT"
  const val LIVE = "daily-work-hours.widget.LIVE"
  private val presetIds = intArrayOf(R.id.preset_0, R.id.preset_1, R.id.preset_2)
  val executor = Executors.newSingleThreadExecutor()
  private fun manager(context: Context) = AppWidgetManager.getInstance(context)
  fun earnedIds(context: Context) = manager(context).getAppWidgetIds(ComponentName(context, EarnedWidget::class.java))
  fun combinedIds(context: Context) = manager(context).getAppWidgetIds(ComponentName(context, CombinedHoursWidget::class.java))
  fun stopIfNoEarningsWidgets(context: Context) {
    if (earnedIds(context).isEmpty() && combinedIds(context).isEmpty())
      context.stopService(Intent(context, LiveEarningsService::class.java))
  }
  private fun action(context: Context, action: String, slot: Int = -1, widgetId: Int = 0) = PendingIntent.getActivity(
    context, widgetId * 4 + slot + 1,
    Intent(context, WidgetActionActivity::class.java).setAction(action).putExtra("slot", slot).putExtra("widgetId", widgetId)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_MULTIPLE_TASK),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )
  fun showQuick(context: Context, ids: IntArray) {
    if (ids.isEmpty()) return
    val config = WidgetConfig.read(context)
    val status = quickStatus(context)
    for (widgetId in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_quick_hours)
      bindQuick(context, views, config, status, widgetId)
      manager(context).updateAppWidget(widgetId, views)
    }
  }
  private fun quickStatus(context: Context): String {
    val record = runCatching { WidgetStore.record(WidgetStore.read(context), WidgetStore.today()) }.getOrNull()
    return if (record == null) "今天未记" else "✓ 已记 ${displayTotal(record)}h"
  }
  private fun bindQuick(context: Context, views: RemoteViews, config: WidgetConfig, status: String, widgetId: Int) {
    views.setTextViewText(R.id.quick_status, status)
    views.setOnClickPendingIntent(R.id.clock_out, action(context, CLOCK_OUT, widgetId = widgetId))
    presetIds.forEachIndexed { index, id ->
      val amount = WidgetStore.displayHours(config.presets[index])
      views.setTextViewText(id, "$amount h")
      views.setContentDescription(id, "记录今天 $amount 小时")
      views.setOnClickPendingIntent(id, action(context, QUICK, index, widgetId))
    }
  }
  fun displayTotal(record: JSONObject) = WidgetStore.displayHours(kotlin.math.round(record.getDouble("total") * 100).toInt())
  private fun hasRoom(context: Context, id: Int): Boolean =
    manager(context).getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 78) >= 72
  fun showEarned(context: Context, ids: IntArray, earned: Earnings, full: Boolean, previous: Earnings? = null, combined: Boolean = false) {
    if (ids.isEmpty()) return
    val layout = if (combined) R.layout.widget_combined_hours else R.layout.widget_earned
    fun changes(): RemoteViews = RemoteViews(context.packageName, layout).apply {
      if (previous?.value != earned.value || full) setTextViewText(R.id.earned_value, earned.value)
      if (previous?.stage != earned.stage || previous?.canRun != earned.canRun || full)
        setTextViewText(R.id.earned_status, earned.stage.ifBlank { if (earned.canRun && LiveEarningsService.running) "● 实时" else "待开启" })
      if (previous?.detail != earned.detail || full) setTextViewText(R.id.earned_detail, earned.detail)
      if (previous == null || previous.progress != earned.progress || full) {
        setViewVisibility(R.id.earned_progress, if (earned.progress == null) View.GONE else View.VISIBLE)
        if (earned.progress != null) setProgressBar(R.id.earned_progress, 100, earned.progress, false)
      }
    }
    if (full) {
      val config = if (combined) WidgetConfig.read(context) else null
      val status = if (combined) quickStatus(context) else ""
      for (id in ids) {
        val views = changes()
        views.setViewVisibility(R.id.earned_footer, if (combined || hasRoom(context, id)) View.VISIBLE else View.GONE)
        views.setOnClickPendingIntent(R.id.earned_panel, action(context, LIVE))
        if (config != null) bindQuick(context, views, config, status, id)
        manager(context).updateAppWidget(id, views)
      }
    } else manager(context).partiallyUpdateAppWidget(ids, changes())
  }
  fun snapshot(context: Context): Earnings =
    runCatching { Earnings.calculate(WidgetStore.read(context), WidgetConfig.read(context)) }
      .getOrElse { Earnings("今日已赚", "暂不可用") }
  fun refresh(context: Context) {
    val manager = manager(context)
    showQuick(context, manager.getAppWidgetIds(ComponentName(context, QuickHoursWidget::class.java)))
    refreshEarned(context)
    LiveEarningsService.refreshNow()
  }
  fun refreshEarned(context: Context, earnings: Earnings = snapshot(context)) {
    showEarned(context, earnedIds(context), earnings, true)
    showEarned(context, combinedIds(context), earnings, true, combined = true)
  }
}

class QuickHoursWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val pending = goAsync()
    HomeWidgets.executor.execute {
      try { HomeWidgets.showQuick(context, ids) } finally { pending.finish() }
    }
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) =
    onUpdate(context, manager, intArrayOf(id))
}
class EarnedWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val pending = goAsync()
    HomeWidgets.executor.execute {
      try { HomeWidgets.showEarned(context, ids, HomeWidgets.snapshot(context), true) }
      finally { pending.finish() }
    }
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) =
    onUpdate(context, manager, intArrayOf(id))
  override fun onDisabled(context: Context) = HomeWidgets.stopIfNoEarningsWidgets(context)
}

class CombinedHoursWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val pending = goAsync()
    HomeWidgets.executor.execute {
      try { HomeWidgets.showEarned(context, ids, HomeWidgets.snapshot(context), true, combined = true) }
      finally { pending.finish() }
    }
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) =
    onUpdate(context, manager, intArrayOf(id))
  override fun onDisabled(context: Context) = HomeWidgets.stopIfNoEarningsWidgets(context)
}

class WidgetActionActivity : Activity() {
  companion object {
    private val requests = mutableMapOf<String, WidgetActionActivity>()
    private var lastToast: Toast? = null

    fun complete(request: String, message: String): Boolean {
      val activity = requests.remove(request) ?: return false
      if (activity.isFinishing || activity.isDestroyed) return false
      activity.showEntryMessage(message)
      return true
    }
  }

  private var requestId: String? = null

  @Suppress("DEPRECATION")
  private fun showEntryMessage(message: String) {
    val pad = (16 * resources.displayMetrics.density).toInt()
    val body = TextView(applicationContext).apply {
      text = message
      setTextColor(0xFFF2FFF6.toInt())
      textSize = 15f
      setPadding(pad, pad / 2, pad, pad / 2)
      background = GradientDrawable().apply {
        setColor(0xFF183E31.toInt())
        cornerRadius = pad.toFloat()
      }
    }
    lastToast?.cancel()
    lastToast = Toast(applicationContext).apply {
      view = body
      duration = Toast.LENGTH_SHORT
      setGravity(Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL, 0, pad * 5)
      show()
    }
    window.decorView.postDelayed({ finish() }, 250)
  }

  private fun done(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    finish()
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.setBackgroundDrawableResource(android.R.color.transparent)
    window.setDimAmount(0f)
    val tappedAt = Calendar.getInstance()
    val widgetId = intent.getIntExtra("widgetId", 0)
    when (intent.action) {
      HomeWidgets.QUICK -> {
        val slot = intent.getIntExtra("slot", -1)
        val total = WidgetConfig.read(this).presets.getOrNull(slot)
        if (total == null) finish() else requestEntry(tappedAt, total, "$widgetId-preset-$slot")
      }
      HomeWidgets.CLOCK_OUT -> requestEntry(tappedAt, null, "$widgetId-clock-out")
      HomeWidgets.LIVE -> liveDialog()
      else -> finish()
    }
  }
  private fun requestEntry(tappedAt: Calendar, preset: Int?, button: String) {
    HomeWidgets.executor.execute {
      val result = runCatching {
        preset ?: run {
          val settings = WidgetStore.read(this)?.getJSONObject("settings") ?: JSONObject()
          val shift = WidgetConfig.read(this).shiftClock(settings, tappedAt)
          check(tappedAt.timeInMillis >= shift.start) { "还未到上班时间" }
          shift.clockOutHundredths(tappedAt.timeInMillis)
        }
      }
      runOnUiThread {
        if (isFinishing || isDestroyed) return@runOnUiThread
        val total = result.getOrElse { done(it.message ?: "无法准备今日工时"); return@runOnUiThread }
        val request = UUID.randomUUID().toString()
        requestId = request
        requests[request] = this
        val task = Intent(this, WidgetEntryService::class.java)
          .putExtra("request", request)
          .putExtra("button", button)
          .putExtra("date", WidgetStore.today(tappedAt))
          .putExtra("total", WidgetStore.displayHours(total))
          .putExtra("tappedAt", tappedAt.timeInMillis.toDouble())
        runCatching { startService(task) }.onFailure { done("无法处理今日工时") }
        window.decorView.postDelayed({
          if (requests.remove(request) != null && !isFinishing) done("处理超时，请重试")
        }, 15_000L)
      }
    }
  }

  override fun onDestroy() {
    requestId?.let { requests.remove(it) }
    super.onDestroy()
  }
  private fun liveDialog() {
    val active = LiveEarningsService.running
    val snapshot = HomeWidgets.snapshot(this)
    HomeWidgets.refreshEarned(this, snapshot)
    if (!active && !snapshot.canRun) {
      done(snapshot.reason ?: "当前没有需要实时累计的工时")
      return
    }
    AlertDialog.Builder(this).setTitle("今日已赚")
      .setMessage(if (active) "实时金额正在刷新。" else "按班次和基础时薪估算，开启后会显示运行通知。")
      .setPositiveButton(if (active) "停止实时刷新" else "开启实时刷新") { _, _ ->
        val service = Intent(this, LiveEarningsService::class.java)
        runCatching {
          if (active) stopService(service)
          else if (Build.VERSION.SDK_INT >= 26) startForegroundService(service) else startService(service)
        }.onFailure { Toast.makeText(this, "无法开启实时刷新", Toast.LENGTH_SHORT).show() }
        finish()
      }.setNegativeButton("取消") { _, _ -> finish() }.setOnCancelListener { finish() }.show()
  }
}

internal data class Earnings(val title: String, val value: String, val canRun: Boolean = false, val reason: String? = null,
  val stage: String = "", val progress: Int? = null, val detail: String = "") {
  companion object {
    private fun formatted(value: Double) = String.format(Locale.US, "¥%.5f", value)
    fun calculate(data: JSONObject?, config: WidgetConfig, now: Calendar = Calendar.getInstance(), cachedShift: ShiftClock? = null): Earnings {
      val settings = data?.getJSONObject("settings") ?: return Earnings("今日已赚", "待设置", reason = "请先在 App 中保存工时规则或小部件设置", stage = "未配置")
      val day = WidgetStore.today(now)
      val record = WidgetStore.record(data, day)
      val rate = if (record != null) record.getDouble("hourlyRate") else settings.getDouble("hourlyRate")
      if (rate <= 0.0) return Earnings("今日已赚", "未设时薪", reason = "请在 App 设置基础时薪；已有记录需更新其时薪", stage = "未配置", detail = "在 App 中填写基础时薪")
      if (record != null) {
        val hours = record.getJSONArray("hours")
        val sum = listOf(1.0, 1.5, 2.0, 3.0).mapIndexed { index, multiplier -> hours.getDouble(index) * multiplier }.sum()
        return Earnings("今日已赚", formatted(sum * rate), stage = "✓ 已记录", detail = "按已记 ${HomeWidgets.displayTotal(record)} 小时计算")
      }
      val weekday = now.get(Calendar.DAY_OF_WEEK) - 1
      val workday = WidgetStore.contains(settings.getJSONArray("workdays"), weekday)
      val shift = cachedShift ?: config.shiftClock(settings, now)
      val instant = now.timeInMillis
      val scheduled = shift.workingMillis(shift.start, minOf(instant, shift.end))
      val afterHours = shift.workingMillis(shift.end, instant) / 3_600_000.0
      val planned = shift.workingMillis(shift.start, shift.end).coerceAtLeast(1)
      val progress = (scheduled * 100L / planned).toInt().coerceIn(0, 100)
      val multiplier = if (!workday || WidgetStore.contains(settings.optJSONArray("doubleWorkdays"), weekday)) 2.0 else 1.5
      val stage = when {
        instant < shift.start -> "未上班"
        shift.isResting(instant) -> "休息中"
        instant >= shift.end -> "加班 ${multiplier}倍"
        else -> ""
      }
      val hours = scheduled / 3_600_000.0
      val normal = if (workday) minOf(hours, settings.getDouble("threshold")) else 0.0
      return Earnings("今日已赚", formatted((normal + (hours - normal + afterHours) * multiplier) * rate), true,
        stage = stage, progress = progress, detail = "班次估算  ·  $progress%")
    }
  }
}
