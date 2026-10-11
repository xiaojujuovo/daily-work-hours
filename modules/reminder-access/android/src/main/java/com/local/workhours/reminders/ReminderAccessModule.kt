package com.local.workhours.reminders

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReminderAccessModule : Module() {
  private fun context(): Context = requireNotNull(appContext.reactContext)
  override fun definition() = ModuleDefinition {
    Name("WorkHoursReminderAccess")
    AsyncFunction("getStatus") {
      val context = context()
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      mapOf(
        "sdkVersion" to Build.VERSION.SDK_INT,
        "exactAlarmAllowed" to (Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()),
        "batteryUnrestricted" to power.isIgnoringBatteryOptimizations(context.packageName)
      )
    }
    AsyncFunction("openExactAlarmSettings") {
      val context = context()
      val action = if (Build.VERSION.SDK_INT >= 31) Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM else Settings.ACTION_APPLICATION_DETAILS_SETTINGS
      val intent = Intent(action, Uri.parse("package:${context.packageName}"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
    AsyncFunction("openNotificationSettings") {
      val context = context()
      val intent = if (Build.VERSION.SDK_INT >= 26) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
