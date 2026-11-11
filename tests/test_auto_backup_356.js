'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'); const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../app/src/main/assets/www/index.html','utf8');
function between(start,end) {let a=html.indexOf(start), b=html.indexOf(end,a+start.length);assert(a>=0&&b>a); return html.slice(a,b)}
let status={supported:true,localEnabled:false,localHours:24,localFolderConfigured:false,driveEnabled:false,driveHours:24,driveConnected:false};
let saved=[], staged=[], runs=[], warnings=[];
const native={
 getStatus:()=>JSON.stringify(status),
 configure:(kind,enabled,hours)=>{
   if (![6,12,24].includes(hours)) return 'Invalid interval';
   if(enabled && kind==='local' && !status.localFolderConfigured) return 'Choose folder';
   if(enabled && kind==='drive' && !status.driveConnected) return 'Connect Drive';
   status[kind+'Enabled']=enabled; status[kind+'Hours']=hours;
   saved.push({kind,enabled,hours}); return '';
 },
 stageSnapshot:s=>staged.push(JSON.parse(s)),
 runNow:k=>runs.push(k),
 connectDrive:()=>{status.driveConnected=true},
 chooseLocalFolder:()=>{status.localFolderConfigured=true}
};
const ctx={window:{AndroidAutoBackup:native},State:{settings:{language:'ar'},categories:[],items:[],accounts:[],invoices:[],vouchers:[]},
  AppNav:{current:()=>({screen:'other'}),renderCurrent:()=>{}},
  UI:{toast:s=>warnings.push(s)}, I18n:{apply:()=>{}},document:{getElementById:()=>null},Date,JSON,Number,console};
vm.runInNewContext(between('const BackupController =','window.__nativeBackupStatus ='),ctx);
const backup=vm.runInNewContext('BackupController',ctx);
backup.setEnabled('local',true);
assert.equal(status.localEnabled,false,'do not enable without a destination');
backup.chooseLocalFolder();backup.setHours('local',6);backup.setEnabled('local',true);
assert.equal(status.localEnabled,true); assert.equal(status.localHours,6);
backup.setEnabled('drive',true);assert.equal(status.driveEnabled,false,'do not enable without OAuth');
backup.connectDrive();backup.setHours('drive',12);backup.setEnabled('drive',true);
assert.equal(status.driveEnabled,true);assert.equal(status.driveHours,12);
backup.runNow('local');assert.equal(runs[0],'local');assert.equal(staged.length,1);
assert.equal(staged[0].data.items.length,0);assert.ok(staged[0].exportedAt);
assert.match(backup.card('local','local','fa-folder',backup.status(),'desc'),/value="24"/);
assert.match(backup.card('drive','drive','fa-cloud',backup.status(),'desc'),/Google Drive/);
backup.setEnabled('drive',false);assert.equal(status.driveEnabled,false);
assert.equal(saved.length,5);
console.log('PASS separate 6/12/24 schedules, prerequisites, snapshot payload, manual backup and disabling');
