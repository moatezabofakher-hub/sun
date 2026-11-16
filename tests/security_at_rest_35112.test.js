"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const variants=["app","field_agent"];
for(const variant of variants){
  const dir=path.join(root,variant,'src/main/java/com/sunshine/accounting');
  const read=name=>fs.readFileSync(path.join(dir,name),'utf8');
  test(`${variant}: private checkpoint is sealed with hardware-backed-capable Android Keystore and opened in memory for portable backup`,()=>{
    const vault=read('DeviceVault.java'),mgr=read('AutoBackupManager.java'),worker=read('BackupWorker.java');
    assert.match(vault,/AndroidKeyStore/);assert.match(vault,/AES\/GCM\/NoPadding/);
    assert.match(vault,/setRandomizedEncryptionRequired\(true\)/);
    assert.match(vault,/updateAAD\(/);
    assert.match(mgr,/DeviceVault\.seal\(app, "accounting-snapshot", bytes\)/);
    assert.match(worker,/DeviceVault\.open\(context, "accounting-snapshot", bytes\)/);
    assert.match(worker,/writeLocal\(context, preferences, bytes, name\)/);
  });
  test(`${variant}: WebView debugging only enabled in explicit Android debug builds`,()=>{
    const source=read('MainActivity.java');
    assert.match(source,/WebView\.setWebContentsDebuggingEnabled\(/);
    assert.match(source,/ApplicationInfo\.FLAG_DEBUGGABLE/);
    const manifest=fs.readFileSync(path.join(root,variant,'src/main/AndroidManifest.xml'),'utf8');
    assert.match(manifest,/android:allowBackup="false"/);
    assert.match(manifest,/android:usesCleartextTraffic="false"/);
  });
}

test('phone-to-Windows paired key is encrypted at rest without rotating the legacy key',()=>{
 const source=fs.readFileSync(path.join(root,'app/src/main/java/com/sunshine/accounting/MainPhonePeerSync.java'),'utf8');
 assert.match(source,/DeviceVault\.protectSecret\(activity, "peer-link", key\)/);
 assert.match(source,/DeviceVault\.revealSecret\(activity, "peer-link", stored\)/);
 assert.match(source,/String protectedKey = DeviceVault\.protectSecret\(activity, "peer-link", stored\)/);
 assert.doesNotMatch(source,/putString\("key",key\)/);
});
