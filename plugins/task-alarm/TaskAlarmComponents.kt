package space.manus.monthly.planner

import android.app.*
import android.content.*
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

class TaskAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val service = Intent(context, AlarmSoundService::class.java).putExtra("id", intent.getStringExtra("id")).putExtra("title", intent.getStringExtra("title"))
    try {
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(service) else context.startService(service)
    } catch (_: Exception) { /* Android may restrict background starts; do not claim delivery. */ }
  }
}

class AlarmStopReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    context.stopService(Intent(context, AlarmSoundService::class.java))
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(7201)
  }
}

class AlarmSoundService : Service() {
  private var player: MediaPlayer? = null
  private var wakeLock: PowerManager.WakeLock? = null
  override fun onCreate() {
    super.onCreate()
    val pm = getSystemService(POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:TaskAlarm").apply { setReferenceCounted(false); acquire(10 * 60 * 1000L) }
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra("title")?.take(180)?.ifBlank { "Напоминание" } ?: "Напоминание"
    val id = intent?.getStringExtra("id") ?: ""
    val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Активный будильник", NotificationManager.IMPORTANCE_HIGH).apply { setSound(null, null); enableVibration(true) })
    val stop = PendingIntent.getBroadcast(this, 7202, Intent(this, AlarmStopReceiver::class.java).setAction("$packageName.STOP_TASK_ALARM"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("Время дела")
      .setContentText(title).setOngoing(true).setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX).setOnlyAlertOnce(true)
      .addAction(android.R.drawable.ic_media_pause, "Стоп", stop).build()
    startForeground(7201, notification)
    try {
      if (player == null) {
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = MediaPlayer().apply {
          setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
          setDataSource(this@AlarmSoundService, uri)
          isLooping = true
          prepare()
          start()
        }
      }
    } catch (_: Exception) { stopSelf() }
    return START_NOT_STICKY
  }
  override fun onDestroy() {
    try { player?.stop() } catch (_: Exception) {}
    try { player?.release() } catch (_: Exception) {}
    player = null
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
    wakeLock = null
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
  companion object { private const val CHANNEL = "task-alarm-active" }
}
