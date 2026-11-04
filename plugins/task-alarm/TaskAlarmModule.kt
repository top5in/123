package space.manus.monthly.planner

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = TaskAlarmModule.NAME)
class TaskAlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = NAME
  @ReactMethod fun canScheduleExactAlarms(promise: Promise) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    promise.resolve(Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms())
  }
  @ReactMethod fun requestExactAlarmPermission(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= 31) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) { promise.reject("PERMISSION_SETTINGS", e) }
  }
  @ReactMethod fun schedule(id: String, title: String, timestamp: Double, promise: Promise) {
    try {
      val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
        promise.reject("EXACT_ALARM_NOT_ALLOWED", "Exact alarm access is not granted; no alarm was scheduled.")
        return
      }
      val intent = Intent(context, TaskAlarmReceiver::class.java).putExtra("id", id).putExtra("title", title)
      val pi = android.app.PendingIntent.getBroadcast(context, id.hashCode(), intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE)
      val info = AlarmManager.AlarmClockInfo(timestamp.toLong(), pi)
      manager.setAlarmClock(info, pi)
      promise.resolve(id)
    } catch (e: Exception) { promise.reject("SCHEDULE_FAILED", e) }
  }
  @ReactMethod fun cancel(id: String, promise: Promise) {
    try {
      val intent = Intent(context, TaskAlarmReceiver::class.java)
      val pi = android.app.PendingIntent.getBroadcast(context, id.hashCode(), intent, android.app.PendingIntent.FLAG_NO_CREATE or android.app.PendingIntent.FLAG_IMMUTABLE)
      if (pi != null) { (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pi); pi.cancel() }
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("CANCEL_FAILED", e) }
  }
  companion object { const val NAME = "TaskAlarm" }
}

class TaskAlarmPackage : com.facebook.react.ReactPackage {
  override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(TaskAlarmModule(ctx))
  override fun createViewManagers(ctx: ReactApplicationContext): List<com.facebook.react.uimanager.ViewManager<*, *>> = emptyList()
}
