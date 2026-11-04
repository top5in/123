const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withMainApplication } = require('@expo/config-plugins');

const sourceDir = path.join(__dirname, 'task-alarm');
const javaDir = path.join('app', 'src', 'main', 'java', 'space', 'manus', 'monthly', 'planner');
function withTaskAlarm(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const uses = manifest['uses-permission'] || (manifest['uses-permission'] = []);
    for (const name of ['android.permission.SCHEDULE_EXACT_ALARM','android.permission.POST_NOTIFICATIONS','android.permission.FOREGROUND_SERVICE','android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK','android.permission.WAKE_LOCK']) {
      if (!uses.some(p => p.$['android:name'] === name)) uses.push({ $: { 'android:name': name } });
    }
    const app = manifest.application[0];
    app.receiver = app.receiver || [];
    app.service = app.service || [];
    const addComponent = (list, name, attrs) => {
      if (!list.some(x => x.$['android:name'] === name)) list.push({ $: { 'android:name': name, ...attrs } });
    };
    addComponent(app.receiver, 'space.manus.monthly.planner.TaskAlarmReceiver', { 'android:enabled': 'true', 'android:exported': 'false' });
    addComponent(app.receiver, 'space.manus.monthly.planner.AlarmStopReceiver', { 'android:enabled': 'true', 'android:exported': 'false' });
    addComponent(app.service, 'space.manus.monthly.planner.AlarmSoundService', { 'android:enabled': 'true', 'android:exported': 'false', 'android:foregroundServiceType': 'mediaPlayback' });
    return config;
  });
  config = withMainApplication(config, (config) => {
    const app = config.modResults;
    if (app.language === 'java') {
      const src = app.contents;
      if (!src.includes('TaskAlarmPackage')) app.contents = src.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, '$1\n              add(space.manus.monthly.planner.TaskAlarmPackage())');
    } else {
      const src = app.contents;
      if (!src.includes('TaskAlarmPackage')) app.contents = src.replace(/(PackageList\(this\)\.packages\.apply\s*\{)/, '$1\n              add(space.manus.monthly.planner.TaskAlarmPackage())');
    }
    return config;
  });
  config = require('@expo/config-plugins').withDangerousMod(config, ['android', async (config) => {
    const dest = path.join(config.modRequest.platformProjectRoot, javaDir);
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(sourceDir)) fs.copyFileSync(path.join(sourceDir, file), path.join(dest, file));
    return config;
  }]);
  return config;
}
module.exports = withTaskAlarm;
