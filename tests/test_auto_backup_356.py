from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
main=(root/'app/src/main/java/com/sunshine/accounting/MainActivity.java').read_text()
manager=(root/'app/src/main/java/com/sunshine/accounting/AutoBackupManager.java').read_text()
worker=(root/'app/src/main/java/com/sunshine/accounting/BackupWorker.java').read_text()
html=(root/'app/src/main/assets/www/index.html').read_text()
manifest=(root/'app/src/main/AndroidManifest.xml').read_text()
assert 'versionCode 15' in (root/'app/build.gradle').read_text()
assert 'AlRaedAccountingERP_v2' in html
assert 'applicationId \'com.sunshine.technicalaccountant\'' in (root/'app/build.gradle').read_text()
assert 'window.AndroidAutoBackup.stageSnapshot' in html
assert 'tx.oncomplete = () => {' in html and 'BackupController.stageLatest()' in html
assert 'stageSnapshot(String json)' in main
assert 'new AtomicFile(snapshotFile(app))' in manager
assert 'awaitPendingSnapshots()' in worker
assert 'PeriodicWorkRequest.Builder(BackupWorker.class' in manager
assert 'public static boolean validHours(int hours) { return hours == 6 || hours == 12 || hours == 24; }' in manager
assert 'cancelUniqueWork(' in manager
assert 'ExistingPeriodicWorkPolicy.UPDATE' in manager
assert 'Intent.ACTION_OPEN_DOCUMENT_TREE' in main
assert 'takePersistableUriPermission' in main
assert 'DocumentFile.fromTreeUri' in worker
assert 'Identity.getAuthorizationClient(ctx).authorize(request)' in worker
assert 'AuthorizationRequest.builder()' in main
assert 'https://www.googleapis.com/auth/drive.file' in main and 'https://www.googleapis.com/auth/drive.file' in worker
assert 'driveConnected' in manager and 'driveEnabled' in manager
assert 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart' in worker
assert 'AlMohaseb_AlTaqni_Backups' in worker
assert 'getLastSignedInAccount' not in main
assert 'android:allowBackup="false"' in manifest
assert all(re.search(fr'value="{n}"', html) for n in ('6','12','24'))
assert 'BackupController.card(\'local\'' in html and 'BackupController.card(\'drive\'' in html
assert 'BackupController.runNow' in html
print('PASS auto backup WorkManager, SAF persisted permissions, Drive OAuth, intervals and data safety')
