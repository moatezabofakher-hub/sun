package com.sunshine.accounting;

import android.content.Context;
import android.content.Intent;
import android.content.ClipData;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** WhatsApp share is always user-confirmed. Normal WhatsApp offers no silent file-send API. */
public final class AgentWhatsAppBackupBridge {
    private static final String PREF = "agent_whatsapp_backup_v1";
    private final MainActivity activity;
    public AgentWhatsAppBackupBridge(MainActivity activity) { this.activity = activity; }
    private SharedPreferences prefs() {return activity.getSharedPreferences(PREF,Context.MODE_PRIVATE);}
    private static boolean valid(String phone) { return phone != null && phone.matches("\\+?[1-9][0-9]{7,14}"); }

    @JavascriptInterface public String getStatus() {
        if (!activity.trustedForBackupSharing()) return "{}";
        JSONObject status=AutoBackupManager.status(activity);
        try {status.put("whatsAppSender",prefs().getString("sender",""));
            status.put("whatsAppRecipient",prefs().getString("recipient",""));
            status.put("whatsAppSendMode","user_confirmed_share");}
        catch(Exception ignored){}
        return status.toString();
    }
    @JavascriptInterface public String saveNumbers(String sender, String recipient) {
        if(!activity.trustedForBackupSharing()) return "المصدر غير موثوق";
        if(!valid(sender)||!valid(recipient)) return "اكتب الرقمين بصيغة دولية صحيحة مع رمز الدولة، مثل +9639...";
        return prefs().edit().putString("sender",sender).putString("recipient",recipient).commit()
            ? "" : "تعذر حفظ الأرقام";
    }
    @JavascriptInterface public void shareLatestBackup() {
        if(!activity.trustedForBackupSharing()) return;
        // Do not involve the network, external apps or UI until we have validated backup data.
        new Thread(()->{
            try {
                AutoBackupManager.awaitPendingSnapshots();
                File source=AutoBackupManager.snapshotFile(activity);
                AtomicFile atomic=new AtomicFile(source);
                byte[] bytes;
                try(InputStream in=atomic.openRead()) {
                    java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream();
                    byte[] chunk=new byte[8192];int len;
                    while((len=in.read(chunk))!=-1){if(buffer.size()+len>25_000_000)
                         throw new IllegalStateException("النسخة أكبر من الحجم المسموح");buffer.write(chunk,0,len);}
                    bytes=buffer.toByteArray();
                }
                JSONObject backup=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
                if(!"AlMohaseb_Field_Agent".equals(backup.optString("app")) ||
                    backup.optJSONObject("data")==null || backup.getJSONObject("data").optJSONObject("agentState")==null)
                    throw new IllegalStateException("النسخة المتوفرة ليست نسخة بيانات المندوب");
                File dir=new File(activity.getCacheDir(),"agent_backup_share");
                if(!dir.exists()&&!dir.mkdirs())throw new IllegalStateException("تعذر إعداد المشاركة");
                // Avoid overwriting an attachment another app is still reading.
                File[] oldFiles=dir.listFiles();
                if(oldFiles!=null)for(File older:oldFiles)if(older.isFile() &&
                        older.lastModified()<System.currentTimeMillis()-86_400_000L)older.delete();
                File file=new File(dir,"Agent_Backup_"+UUID.randomUUID().toString().substring(0,8)+".json");
                try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);out.flush();}
                Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",file);
                String recipient=prefs().getString("recipient","");
                activity.runOnUiThread(()->{
                    Intent share=new Intent(Intent.ACTION_SEND);
                    share.setType("application/json");
                    share.putExtra(Intent.EXTRA_STREAM,uri);
                    if(!recipient.isEmpty()) share.putExtra("jid", recipient.replace("+", "") + "@s.whatsapp.net"); // Best-effort hint; the user must verify the chat.
                    share.putExtra(Intent.EXTRA_TEXT,"نسخة احتياطية من تطبيق المندوب. المستلم المطلوب: "+recipient+". رجاء تأكد من المحادثة قبل الإرسال.");
                    share.setClipData(ClipData.newUri(activity.getContentResolver(),"نسخة المندوب",uri));
                    share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try{ activity.startActivity(Intent.createChooser(share,"اختر واتساب ثم المستلم لإرسال النسخة")); }
                    catch(Exception e){Toast.makeText(activity,"تعذر فتح المشاركة؛ تأكد من تثبيت واتساب",Toast.LENGTH_LONG).show();}
                });
            }catch(Exception e){activity.runOnUiThread(()->Toast.makeText(activity,"تعذر مشاركة النسخة: "+e.getMessage(),Toast.LENGTH_LONG).show());}
        },"agent-backup-whatsapp").start();
    }
}
