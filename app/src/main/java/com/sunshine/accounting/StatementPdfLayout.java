package com.sunshine.accounting;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.Locale;

/** A4 Arabic customer statement, visually aligned with the Windows navy/gold statement.
 *  The report is display-only: every amount is taken from the verified statement payload.
 */
final class StatementPdfLayout {
    private static final int WIDTH=595, HEIGHT=842, M=36, CW=WIDTH-2*M, BOTTOM=HEIGHT-51;
    private static final int NAVY=Color.rgb(3,42,81), BLUE=Color.rgb(5,85,145), GOLD=Color.rgb(239,195,49);
    private static final int INK=Color.rgb(15,39,68), GREEN=Color.rgb(7,112,57), RED=Color.rgb(163,28,49);
    private static final int[] COL={24,68,126,76,74,74,81}; // right to left, total 523
    private StatementPdfLayout(){}

    static byte[] render(JSONObject report) throws IOException {
        JSONArray rows=report.optJSONArray("rows");
        if(rows==null||rows.length()>8000) throw new IOException("Invalid account statement");
        PdfDocument pdf=new PdfDocument();
        try {
            Sheet sheet=new Sheet(pdf); sheet.newPage();
            sheet.header(report);
            JSONObject opening=report.optJSONObject("opening"), ending=report.optJSONObject("ending");
            boolean syp=hasEntries(rows,"SYP") || notZero(balance(opening,"SYP")) || notZero(balance(ending,"SYP"));
            boolean usd=hasEntries(rows,"USD") || notZero(balance(opening,"USD")) || notZero(balance(ending,"USD"));
            if(!syp&&!usd)syp=true;
            if(syp)sheet.currencySection(report, rows,"SYP",opening,ending);
            if(usd)sheet.currencySection(report, rows,"USD",opening,ending);
            sheet.notes(report);
            sheet.finish();
            ByteArrayOutputStream out=new ByteArrayOutputStream(32768);
            pdf.writeTo(out);return out.toByteArray();
        } finally {pdf.close();}
    }

    private static String clean(String v,int max){
        if(v==null)return "";
        v=v.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]"," ").trim();
        return v.length()>max?v.substring(0,max):v;
    }
    private static String balance(JSONObject obj,String currency){return obj==null?"0":clean(obj.optString(currency,"0"),80);}
    private static boolean notZero(String s){try{return new BigDecimal(s.replace(",","")).signum()!=0;}catch(Exception e){return false;}}
    private static boolean hasEntries(JSONArray rows,String currency){
        for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);
            if(row!=null && currency.equals(row.optString("currency")))return true;}
        return false;
    }
    private static String money(String value){
        String raw=clean(value,100).replace(",","");
        try {
            BigDecimal n=new BigDecimal(raw);
            String val=n.stripTrailingZeros().toPlainString();
            boolean neg=val.startsWith("-");String[] p=(neg?val.substring(1):val).split("\\.",2);
            return (neg?"-":"")+p[0].replaceAll("\\B(?=(\\d{3})+(?!\\d))",",")+(p.length==2?"."+p[1]:"");
        } catch(Exception ignored){return clean(value,100);}
    }
    private static String total(JSONArray rows,String currency,String key){
        BigDecimal sum=BigDecimal.ZERO;
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.optJSONObject(i);
            if(row==null || !currency.equals(row.optString("currency")))continue;
            try{sum=sum.add(new BigDecimal(row.optString(key,"0").replace(",","")));}catch(Exception ignored){}
        }
        return money(sum.toPlainString());
    }
    private static String unit(String currency){return "SYP".equals(currency)?"ل.س":"USD";}
    private static String side(String value){try{int n=new BigDecimal(value.replace(",","")).signum();return n<0?" (له)":n>0?" (عليه)":" (مسدد)";}catch(Exception e){return "";}}
    private static Bitmap logo(String data){
        if(data==null||data.length()>2400000||!data.matches("^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$"))return null;
        try{byte[] bytes=Base64.decode(data.substring(data.indexOf(',')+1),Base64.DEFAULT);
            if(bytes.length>1600000)return null;
            BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
            BitmapFactory.decodeByteArray(bytes,0,bytes.length,options);
            if(options.outWidth<=0||options.outWidth>3000||options.outHeight<=0||options.outHeight>3000)return null;
            return BitmapFactory.decodeByteArray(bytes,0,bytes.length);
        }catch(Exception e){return null;}
    }

    private static final class Sheet {
        final PdfDocument pdf;PdfDocument.Page page;Canvas canvas;int pages;float y;
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
        String customer="";
        Sheet(PdfDocument pdf){this.pdf=pdf;}
        void newPage(){
            if(page!=null)closePage();
            page=pdf.startPage(new PdfDocument.PageInfo.Builder(WIDTH,HEIGHT,++pages).create());
            canvas=page.getCanvas();canvas.drawColor(Color.WHITE);y=39;
        }
        void fill(float x,float top,float w,float h,int color,float r){
            paint.setColor(color);paint.setStyle(Paint.Style.FILL);
            canvas.drawRoundRect(new RectF(x,top,x+w,top+h),r,r,paint);
        }
        void line(float x,float top,float xx,float bottom,int color){
            paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(0.7f);paint.setColor(color);
            canvas.drawLine(x,top,xx,bottom,paint);paint.setStyle(Paint.Style.FILL);
        }
        StaticLayout layout(String text,int size,boolean bold,int color,int width,Layout.Alignment align){
            String s=text==null?"":text;
            TextPaint t=new TextPaint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
            t.setColor(color);t.setTextSize(size);t.setTypeface(Typeface.create("sans-serif",bold?Typeface.BOLD:Typeface.NORMAL));
            return StaticLayout.Builder.obtain(s,0,s.length(),t,Math.max(4,width)).setTextDirection(TextDirectionHeuristics.FIRSTSTRONG_RTL)
                .setAlignment(align).setIncludePad(false).setLineSpacing(1.5f,1f).build();
        }
        int text(String s,float x,float top,int width,int size,boolean bold,int color,Layout.Alignment align){
            StaticLayout lay=layout(s,size,bold,color,width,align);
            canvas.save();canvas.translate(x,top);lay.draw(canvas);canvas.restore();return lay.getHeight();
        }
        void ensure(float h){if(y+h>BOTTOM){newPage();if(!customer.isEmpty()){
            fill(M,y,CW,30,NAVY,8);text("كشف حساب العميل: "+customer+" (تابع)",M+9,y+7,CW-18,12,true,Color.WHITE,Layout.Alignment.ALIGN_CENTER);y+=39;}
        }}
        void header(JSONObject r){
            customer=clean(r.optString("accountName","—"),200);
            fill(M,y,CW,104,NAVY,13);
            fill(M,y+98,CW,6,GOLD,1);
            Bitmap bm=logo(r.optString("companyLogo",""));
            if(bm!=null){float bw=bm.getWidth(),bh=bm.getHeight();float f=Math.min(48/bw,48/bh);
                float dw=bw*f,dh=bh*f;canvas.drawBitmap(bm,null,new RectF(M+8+(48-dw)/2,y+12+(48-dh)/2,M+8+(48+dw)/2,y+12+(48+dh)/2),paint);}
            text("المحاسب التقني",M+61,y+14,190,17,true,Color.WHITE,Layout.Alignment.ALIGN_NORMAL);
            text("Tiqany Acc",M+61,y+38,185,14,true,Color.WHITE,Layout.Alignment.ALIGN_NORMAL);
            text("نظام إدارة الحسابات والمبيعات",M+9,y+72,233,9,false,Color.rgb(218,235,255),Layout.Alignment.ALIGN_CENTER);
            line(M+253,y+14,M+253,y+88,Color.rgb(116,161,208));
            String co=clean(r.optString("companyName",""),170);
            text(co.isEmpty()?"اسم الشركة غير محدد":co,M+261,y+8,CW-268,16,true,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            String address=clean(r.optString("companyAddress",""),175);
            String phones=clean(r.optString("companyPhone",""),100);
            String email=clean(r.optString("companyEmail",""),100);
            if(!address.isEmpty())text(address,M+261,y+34,CW-268,9,false,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            if(!phones.isEmpty())text(phones,M+261,y+52,CW-268,10,true,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            if(!email.isEmpty())text(email,M+261,y+72,CW-268,9,false,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            y+=110;
            fill(M+135,y,CW-270,36,BLUE,18);
            text(clean(r.optString("title","كشف حساب عميل"),75),M+148,y+6,CW-296,19,true,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            y+=46;
            fill(M,y,CW,68,Color.rgb(239,247,255),11);
            float middle=M+CW*0.49f;
            line(middle,y+7,middle,y+61,Color.rgb(150,185,220));
            text("اسم العميل: "+customer,M+CW/2+9,y+9,CW/2-19,13,true,INK,Layout.Alignment.ALIGN_NORMAL);
            String accPhone=clean(r.optString("accountPhone",""),80);
            String accAddress=clean(r.optString("accountAddress",""),140);
            if(!accPhone.isEmpty())text("هاتف العميل: "+accPhone,M+CW/2+9,y+31,CW/2-19,9,false,INK,Layout.Alignment.ALIGN_NORMAL);
            if(!accAddress.isEmpty())text(accAddress,M+CW/2+9,y+46,CW/2-19,9,false,INK,Layout.Alignment.ALIGN_NORMAL);
            String from=clean(r.optString("from",""),20),to=clean(r.optString("to",""),20);
            text("الفترة من: "+(from.isEmpty()?"بداية الحساب":from),M+9,y+10,CW/2-20,11,true,INK,Layout.Alignment.ALIGN_NORMAL);
            text("إلى: "+(to.isEmpty()?"تاريخ الكشف":to),M+9,y+38,CW/2-20,11,true,INK,Layout.Alignment.ALIGN_NORMAL);
            y+=79;
        }
        void sectionHeader(String currency){
            ensure(64);
            fill(M,y,CW,27,Color.rgb(210,231,250),7);
            text("حركات الحساب بعملة "+unit(currency),M+8,y+4,CW-16,12,true,NAVY,Layout.Alignment.ALIGN_NORMAL);
            y+=34;
        }
        void opening(String value,String currency){
            ensure(49);fill(M,y,CW,39,Color.rgb(255,243,191),10);
            text("الرصيد المدور (بداية الفترة):",M+175,y+10,CW-185,12,true,INK,Layout.Alignment.ALIGN_NORMAL);
            text(money(value)+" "+unit(currency)+side(value),M+10,y+8,220,13,true,NAVY,Layout.Alignment.ALIGN_CENTER);
            y+=49;
        }
        void tableHeader(){
            ensure(34);float x=WIDTH-M;String[] names={"م","التاريخ","البيان","رقم العملية","مدين (عليه)","دائن (له)","الرصيد"};
            for(int i=0;i<COL.length;i++){
                x-=COL[i];fill(x,y,COL[i],30,i==4?RED:i==5?GREEN:BLUE,0);
                text(names[i],x+2,y+7,COL[i]-4,9,true,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            }
            y+=30;
        }
        void currencySection(JSONObject r,JSONArray all,String c,JSONObject opening,JSONObject ending){
            sectionHeader(c);opening(balance(opening,c),c);tableHeader();
            int number=0;
            for(int i=0;i<all.length();i++){
                JSONObject a=all.optJSONObject(i);if(a==null||!c.equals(a.optString("currency")))continue;
                number++;
                String d=clean(a.optString("detail",""),350),ref=clean(a.optString("reference",""),100),rate=clean(a.optString("rate",""),55);
                if(!rate.isEmpty())d+=(d.isEmpty()?"":"\n")+"سعر الصرف: "+rate;
                String date=clean(a.optString("date",""),35);
                String debit=money(a.optString("debit","0")),credit=money(a.optString("credit","0"));
                String[] cells={String.valueOf(number),date,d,ref,notZero(debit)?debit:"—",notZero(credit)?credit:"—",money(a.optString("balance","0"))};
                int[] sizes={9,9,9,9,9,9,9};
                int rh=31;
                for(int j=0;j<cells.length;j++)rh=Math.max(rh,layout(cells[j],sizes[j],true,INK,COL[j]-8,Layout.Alignment.ALIGN_CENTER).getHeight()+9);
                if(y+rh>BOTTOM){newPage();sectionHeader(c);tableHeader();}
                int color=number%2==0?Color.rgb(248,251,255):Color.rgb(229,242,255);
                if(ref.contains("مردود"))color=Color.rgb(255,239,238);
                if(!notZero(debit)&&notZero(credit))color=Color.rgb(229,251,237);
                float x=WIDTH-M;
                for(int j=0;j<cells.length;j++){
                    x-=COL[j];fill(x,y,COL[j],rh,color,0);
                    if(j==4)fill(x,y,COL[j],rh,Color.rgb(255,241,242),0);
                    if(j==5)fill(x,y,COL[j],rh,Color.rgb(232,251,237),0);
                    text(cells[j],x+4,y+4,COL[j]-8,sizes[j],j!=2,
                         j==4?RED:j==5?GREEN:INK,Layout.Alignment.ALIGN_CENTER);
                    line(x,y,x,y+rh,Color.rgb(183,210,232));
                }
                line(M,y+rh,WIDTH-M,y+rh,Color.rgb(183,210,232));y+=rh;
            }
            if(number==0){ensure(37);fill(M,y,CW,34,Color.rgb(241,248,255),0);
                text("لا توجد حركات ضمن الفترة المحددة",M+8,y+8,CW-16,11,false,INK,Layout.Alignment.ALIGN_CENTER);y+=34;}
            y+=10;ensure(114);
            fill(M,y,CW,55,Color.rgb(246,249,253),11);
            fill(M+3,y+4,(CW-9)/2f,46,Color.rgb(254,229,233),9);
            fill(M+6+(CW-9)/2f,y+4,(CW-9)/2f,46,Color.rgb(225,248,234),9);
            text("إجمالي المدين",M+5,y+9,(CW-13)/2,10,true,RED,Layout.Alignment.ALIGN_CENTER);
            text(total(all,c,"debit")+" "+unit(c),M+5,y+28,(CW-13)/2,12,true,RED,Layout.Alignment.ALIGN_CENTER);
            text("إجمالي الدائن",M+9+(CW-9)/2f,y+9,(CW-13)/2,10,true,GREEN,Layout.Alignment.ALIGN_CENTER);
            text(total(all,c,"credit")+" "+unit(c),M+9+(CW-9)/2f,y+28,(CW-13)/2,12,true,GREEN,Layout.Alignment.ALIGN_CENTER);
            y+=65;
            fill(M,y,CW,42,NAVY,10);
            text("الرصيد النهائي:",M+CW/2,y+9,CW/2-10,15,true,Color.WHITE,Layout.Alignment.ALIGN_NORMAL);
            String value=balance(ending,c);
            text(money(value)+" "+unit(c)+side(value),M+9,y+10,CW/2-15,14,true,Color.WHITE,Layout.Alignment.ALIGN_CENTER);
            y+=56;
        }
        void notes(JSONObject r){
            String stamp=clean(r.optString("createdAtLocal",r.optString("createdAt","")),80);
            String note=clean(r.optString("footerNote",""),400);
            ensure(56);
            line(M,y,WIDTH-M,y,Color.rgb(152,193,225));y+=8;
            text("المحاسب التقني - Tiqany Acc",M+CW/2,y,CW/2,9,true,INK,Layout.Alignment.ALIGN_NORMAL);
            text("طباعة بتاريخ: "+stamp,M,y,CW/2,9,true,INK,Layout.Alignment.ALIGN_NORMAL);y+=16;
            if(!note.isEmpty()){text(note,M,y,CW,9,false,INK,Layout.Alignment.ALIGN_CENTER);y+=18;}
        }
        void closePage(){
            String s="صفحة "+pages;
            text(s,M,HEIGHT-35,CW,9,false,Color.GRAY,Layout.Alignment.ALIGN_CENTER);
            pdf.finishPage(page);page=null;canvas=null;
        }
        void finish(){if(page!=null)closePage();}
    }
}
