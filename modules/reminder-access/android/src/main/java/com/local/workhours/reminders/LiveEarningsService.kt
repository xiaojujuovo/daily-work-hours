package com.local.workhours.reminders

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import org.json.JSONObject
import java.util.Calendar
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit

class LiveEarningsService : Service() {
  companion object {
    private const val CHANNEL = "daily-work-hours-live-earnings"
    private const val STOP = "daily-work-hours.widget.STOP"
    private const val ID = 8147
    @Volatile private var active: LiveEarningsService? = null
    val running: Boolean get() = active != null
    fun refreshNow() { active?.requestRefresh() }
  }
  private val worker = ScheduledThreadPoolExecutor(1) { task -> Thread(task, "DailyWorkHoursLiveWidget") }.apply {
    removeOnCancelPolicy = true
    setExecuteExistingDelayedTasksAfterShutdownPolicy(false)
  }
  private val power by lazy { getSystemService(PowerManager::class.java) }
  private var pending: ScheduledFuture<*>? = null
  private var data: JSONObject? = null
  private var config = WidgetConfig()
  private var shift: ShiftClock? = null
  private var ids = intArrayOf()
  private var combinedIds = intArrayOf()
  private var nextRead = 0L
  private var lastShown: Earnings? = null
  private var day: String? = null
  private var sampleStart = 0L
  private var submitted = 0
  private var submittedPerSecond: Int? = null
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (active === this@LiveEarningsService) requestRefresh()
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null
  override fun onCreate() {
    super.onCreate()
    val events = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_USER_PRESENT)
    }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, events, Context.RECEIVER_NOT_EXPORTED)
    else registerReceiver(screenReceiver, events)
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP) {
      stopSelf()
      return START_NOT_STICKY
    }
    try {
      startForeground(ID, notification())
      active = this
      requestRefresh()
    } catch (_: RuntimeException) {
      stopSelf()
    }
    return START_NOT_STICKY
  }
  private fun requestRefresh() {
    runCatching {
      worker.execute {
        nextRead = 0
        lastShown = null
        sampleStart = 0
        submitted = 0
        submittedPerSecond = null
        pending?.cancel(false)
        pending = null
        if (power.isInteractive) tick.run()
      }
    }
  }
  private val tick = object : Runnable {
    override fun run() {
      try {
        // No scheduled polling while the display is off; screen events restart the loop.
        if (!power.isInteractive) return
        val tickStart = System.nanoTime()
        val uptime = SystemClock.uptimeMillis()
        val now = Calendar.getInstance()
        val today = WidgetStore.today(now)
        if (day != null && day != today) { stopSelf(); return }
        if (uptime >= nextRead) {
          data = WidgetStore.read(applicationContext)
          config = WidgetConfig.read(applicationContext)
          shift = data?.getJSONObject("settings")?.let { config.shiftClock(it, now) }
          ids = HomeWidgets.earnedIds(applicationContext)
          combinedIds = HomeWidgets.combinedIds(applicationContext)
          nextRead = uptime + 5000
        }
        if (ids.isEmpty() && combinedIds.isEmpty()) { stopSelf(); return }
        if (sampleStart == 0L) sampleStart = tickStart
        val sampled = tickStart - sampleStart
        if (sampled >= 1_000_000_000L) {
          submittedPerSecond = (submitted * 1_000_000_000L / sampled).toInt()
          submitted = 0
          sampleStart = tickStart
        }
        val computed = Earnings.calculate(data, config, now, shift)
        val rate = submittedPerSecond
        val earnings = if (rate != null && computed.canRun && computed.stage.isBlank())
          computed.copy(detail = "${computed.detail} · 提交 $rate 次/秒") else computed
        if (!power.isInteractive) return
        if (earnings != lastShown) {
          HomeWidgets.showEarned(applicationContext, ids, earnings, false, lastShown)
          HomeWidgets.showEarned(applicationContext, combinedIds, earnings, false, lastShown, combined = true)
          submitted++
          lastShown = earnings
        }
        if (!earnings.canRun) { stopSelf(); return }
        day = today
        val idle = shift?.let { now.timeInMillis < it.start || it.isResting(now.timeInMillis) } == true
        val intervalMicros = if (idle) maxOf(config.intervalMicros, 1_000_000L) else config.intervalMicros
        val intervalNanos = TimeUnit.MICROSECONDS.toNanos(intervalMicros)
        val spent = (System.nanoTime() - tickStart).coerceAtLeast(0)
        // Keep at most one timer pending, skipping elapsed slots instead of replaying them.
        pending = worker.schedule(this, intervalNanos - spent % intervalNanos, TimeUnit.NANOSECONDS)
      } catch (_: Exception) { stopSelf() }
    }
  }
  private fun notification(): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "桌面实时收入", NotificationManager.IMPORTANCE_LOW)
    )
    val stop = PendingIntent.getService(this, 1, Intent(this, LiveEarningsService::class.java).setAction(STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("每日工时 · 实时收入")
      .setContentText("亮屏刷新，息屏自动暂停。").setOngoing(true).setShowWhen(false)
      .addAction(Notification.Action.Builder(null, "停止", stop).build()).build()
  }
  override fun onDestroy() {
    if (active === this) {
      active = null
      val context = applicationContext
      HomeWidgets.executor.execute {
        runCatching { HomeWidgets.refreshEarned(context) }
      }
    }
    worker.shutdownNow()
    unregisterReceiver(screenReceiver)
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
}
