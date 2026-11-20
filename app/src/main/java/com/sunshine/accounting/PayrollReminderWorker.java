package com.sunshine.accounting;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

public final class PayrollReminderWorker extends Worker {
    private static final String FILE="payroll_reminders", CHANNEL="payroll_dates";
    public PayrollReminderWorker(@NonNull Context c,@NonNull WorkerParameters p){super(c,p);}
    static synchronized void update(Context c,String json) throws org.json.JSONException {
        JSONArray rules=new JSONArray(json);
        SharedPreferences pref=c.getSharedPreferences(FILE,Context.MODE_PRIVATE);
        WorkManager manager=WorkManager.getInstance(c);
        pref.edit().putString("rules",json).apply();
        if(rules.length()==0){
            manager.cancelUniqueWork(FILE);manager.cancelUniqueWork(FILE+"_check");return;
        }
        manager.enqueueUniquePeriodicWork(FILE,ExistingPeriodicWorkPolicy.KEEP,
                new PeriodicWorkRequest.Builder(PayrollReminderWorker.class,1,TimeUnit.HOURS).build());
        checkNow(c);
    }
    static void checkNow(Context c){
        WorkManager.getInstance(c).enqueueUniqueWork(FILE+"_check",ExistingWorkPolicy.REPLACE,
                new OneTimeWorkRequest.Builder(PayrollReminderWorker.class).build());
    }
    static boolean due(JSONObject r,LocalDate date){
        String key=date.toString();
        if(key.compareTo(r.optString("from"))<0)return false;
        JSONArray paid=r.optJSONArray("paid");
        for(int i=0;paid!=null && i<paid.length();i++){
            JSONArray range=paid.optJSONArray(i);
            if(range!=null && range.optString(0).compareTo(key)<=0 && key.compareTo(range.optString(1))<=0)return false;
        }
        int day=r.optInt("day",-1);
        switch(r.optString("cycle")){
            case "weekly": return date.getDayOfWeek().getValue()%7==day;
            case "yearly": if(date.getMonthValue()!=r.optInt("month"))return false;break;
            case "monthly": break;
            default:return false;
        }
        return day>=1 && day<=31 && date.getDayOfMonth()==Math.min(day,date.lengthOfMonth());
    }
    @NonNull @Override public Result doWork(){
        synchronized(PayrollReminderWorker.class){
            Context c=getApplicationContext();
            if(LocalTime.now().getHour()<9)return Result.success();
            if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return Result.success();
            NotificationManager manager=c.getSystemService(NotificationManager.class);
            if(manager==null||!manager.areNotificationsEnabled())return Result.success();
            LocalDate date=LocalDate.now();String key=date.toString();
            SharedPreferences pref=c.getSharedPreferences(FILE,Context.MODE_PRIVATE);
            Set<String> seen=new HashSet<>(key.equals(pref.getString("date",""))?pref.getStringSet("sent",new HashSet<>()):new HashSet<>());
            try{
                JSONArray rules=new JSONArray(pref.getString("rules","[]"));
                manager.createNotificationChannel(new NotificationChannel(CHANNEL,"مواعيد ترحيل الأجور",NotificationManager.IMPORTANCE_DEFAULT));
                for(int i=0;i<rules.length();i++){
                    JSONObject r=rules.getJSONObject(i);if(!due(r,date))continue;
                    String id="paydue:"+android.net.Uri.encode(r.getString("profile"))+":"+android.net.Uri.encode(r.getString("id"))+":"+key;
                    if(!seen.add(id))continue;
                    Intent intent=new Intent(c,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        .setData(new android.net.Uri.Builder().scheme("tiqany").authority("payroll").appendPath(id).build()).putExtra("ledger_alert_id",id);
                    PendingIntent tap=PendingIntent.getActivity(c,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                    String detail="حان موعد ترحيل أجر "+r.optString("name")+" · "+r.optString("company");
                    Notification n=new Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_stat_tiqany)
                            .setContentTitle("تذكير بترحيل الأجر").setContentText(detail).setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).build();
                    manager.notify(id,1,n);
                }
                pref.edit().putString("date",key).putStringSet("sent",seen).commit();
                return Result.success();
            }catch(org.json.JSONException error){return Result.failure();}
        }
    }
}
