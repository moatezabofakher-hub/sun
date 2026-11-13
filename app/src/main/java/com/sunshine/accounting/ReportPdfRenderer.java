package com.sunshine.accounting;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.RectF;
import android.util.Base64;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextDirectionHeuristics;
import android.text.TextPaint;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Offline A4 report output using Android's own PDF engine. Arabic text is shaped
 * with StaticLayout (not ESC/POS text output), and report lines are paginated.
 * Only display data supplied by the validated local accounting UI is accepted.
 */
final class ReportPdfRenderer {
    private static final int W = 595, H = 842, MARGIN = 37;
    private static final int CONTENT_WIDTH = W - MARGIN * 2;
    private static final int FOOTER_Y = H - 40;
    private static final int BOTTOM = FOOTER_Y - 18;

    private ReportPdfRenderer() { }

    static byte[] render(JSONObject input) throws IOException {
        if (input == null) throw new IOException("Invalid report");
        final JSONArray rows = input.optJSONArray("rows");
        if (rows == null || rows.length() > 8000) throw new IOException("Report has too many rows");
        PdfDocument pdf = new PdfDocument();
        try {
            Writer w = new Writer(pdf);
            w.startPage();
            String company = clean(input.optString("companyName"), 200);
            String phone = clean(input.optString("companyPhone"), 100);
            String address = clean(input.optString("companyAddress"), 250);
            String title = clean(input.optString("title", "تقرير"), 220);
            String range = clean(input.optString("range"), 220);
            w.add(company.isEmpty() ? "تقرير محاسبي" : company, 21, true, Color.rgb(15, 70, 82), Layout.Alignment.ALIGN_CENTER, 7);
            if (!phone.isEmpty()) w.add(phone, 11, false, Color.DKGRAY, Layout.Alignment.ALIGN_CENTER, 3);
            if (!address.isEmpty()) w.add(address, 11, false, Color.DKGRAY, Layout.Alignment.ALIGN_CENTER, 3);
            w.rule(Color.rgb(177, 201, 212), 9);
            w.add(title, 18, true, Color.BLACK, Layout.Alignment.ALIGN_CENTER, 5);
            if (!range.isEmpty()) w.add(range, 11, false, Color.DKGRAY, Layout.Alignment.ALIGN_CENTER, 14);
            w.add("تفاصيل التقرير", 12, true, Color.rgb(18, 103, 112), Layout.Alignment.ALIGN_NORMAL, 7);
            for (int i = 0; i < rows.length(); ++i) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                final String name = clean(row.optString("name"), 500);
                final String detail = clean(row.optString("detail"), 500);
                w.addRow(name, detail);
            }
            w.rule(Color.rgb(160, 183, 195), 12);
            JSONObject totals = input.optJSONObject("totals");
            if (totals != null) {
                w.add("الإجمالي بالدولار: " + formatAmount(totals.optDouble("USD", 0), "USD"), 12,
                        true, Color.rgb(13, 92, 84), Layout.Alignment.ALIGN_NORMAL, 6);
                w.add("الإجمالي بالليرة: " + formatAmount(totals.optDouble("SYP", 0), "SYP"), 12,
                        true, Color.rgb(13, 92, 84), Layout.Alignment.ALIGN_NORMAL, 8);
            }
            w.add("عدد البنود: " + rows.length(), 11, false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 8);
            w.add("هذا التقرير مستخرج من السجلات المحاسبية المحفوظة.", 10, false,
                    Color.DKGRAY, Layout.Alignment.ALIGN_CENTER, 6);
            w.finish();
            ByteArrayOutputStream stream = new ByteArrayOutputStream(32 * 1024);
            pdf.writeTo(stream);
            return stream.toByteArray();
        } finally { pdf.close(); }
    }

    /** Export an actual invoice as an Arabic A4 PDF (not a ledger summary).
     *  Each PDF is generated on demand and can be shared from temporary app cache.
     */
    static byte[] renderInvoice(JSONObject input) throws IOException {
        if (input == null) throw new IOException("Missing invoice");
        JSONArray rows = input.optJSONArray("rows");
        if (rows == null || rows.length() > 2500) throw new IOException("Invalid invoice rows");
        String currency = "SYP".equals(input.optString("currency")) ? "SYP" : "USD";
        PdfDocument pdf = new PdfDocument();
        try {
            Writer w = new Writer(pdf);
            w.startPage();
            // Embed an offline data-URL logo if configured. No Internet access is used.
            String logo = input.optString("companyLogo", "");
            if (logo.startsWith("data:image/") && logo.length() < 2_400_000 && logo.contains(",")) {
                try {
                    byte[] decoded = Base64.decode(logo.substring(logo.indexOf(',') + 1), Base64.DEFAULT);
                    if (decoded.length <= 1_600_000) {
                        BitmapFactory.Options bounds = new BitmapFactory.Options();
                        bounds.inJustDecodeBounds = true;
                        BitmapFactory.decodeByteArray(decoded, 0, decoded.length, bounds);
                        if (bounds.outWidth > 0 && bounds.outHeight > 0 &&
                                bounds.outWidth <= 3000 && bounds.outHeight <= 3000) {
                            Bitmap bitmap = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
                            if (bitmap != null) w.addLogo(bitmap);
                        }
                    }
                } catch (Exception ignored) { /* An invalid logo does not prevent invoicing. */ }
            }
            String company = clean(input.optString("companyName"), 200);
            w.add(company.isEmpty() ? "فاتورة" : company, 21, true, Color.rgb(15, 70, 82), Layout.Alignment.ALIGN_CENTER, 6);
            String phone = clean(input.optString("companyPhone"), 100);
            if (!phone.isEmpty()) w.add("هاتف: " + phone, 11, true, Color.DKGRAY, Layout.Alignment.ALIGN_CENTER, 4);
            String address = clean(input.optString("companyAddress"), 200);
            if (!address.isEmpty()) w.add(address, 10, false, Color.DKGRAY, Layout.Alignment.ALIGN_CENTER, 4);
            w.rule(Color.rgb(164, 187, 197), 12);
            w.add(clean(input.optString("title", "فاتورة"), 150), 19, true, Color.BLACK, Layout.Alignment.ALIGN_CENTER, 10);
            w.add("رقم الفاتورة: " + clean(input.optString("number"), 50), 12, true, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 5);
            w.add("التاريخ: " + clean(input.optString("date"), 60), 11, false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 5);
            w.add("الحساب: " + clean(input.optString("accountName", "زبون عام"), 150), 12, true, Color.rgb(22, 62, 74), Layout.Alignment.ALIGN_NORMAL, 4);
            String accPhone = clean(input.optString("accountPhone"), 60);
            if (!accPhone.isEmpty()) w.add("هاتف الزبون: " + accPhone, 10, false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 3);
            String accAddress = clean(input.optString("accountAddress"), 250);
            if (!accAddress.isEmpty()) w.add("عنوان الزبون: " + accAddress, 10, false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 3);
            w.rule(Color.rgb(169, 195, 207), 12);
            int priceDecimals = Math.min(4, Math.max(0, input.optInt("priceDecimals", 2)));
            w.add("الأصناف  |  الوحدة  |  الكمية  |  السعر  |  الإجمالي", 11, true,
                    Color.rgb(15, 91, 99), Layout.Alignment.ALIGN_NORMAL, 8);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                String name = (i+1) + ". " + clean(row.optString("itemName"), 250);
                String detail = clean(row.optString("unitName"), 70) + "  |  " + clean(row.optString("qty"), 32)
                        + " × " + formatPrice(row.optDouble("price"), currency, priceDecimals) + "  |  "
                        + formatAmount(row.optDouble("total"), currency);
                w.addRow(name, detail);
            }
            w.rule(Color.rgb(158, 183, 193), 11);
            w.add("المجموع: " + formatAmount(input.optDouble("subTotal", 0), currency), 12, true,
                    Color.BLACK, Layout.Alignment.ALIGN_NORMAL, 6);
            if (input.optDouble("discountAmount", 0) != 0) w.add("الحسم: " + formatAmount(input.optDouble("discountAmount"), currency), 11,
                    false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 5);
            if (input.optDouble("taxAmount", 0) != 0) w.add("الضريبة أو الإضافات: " + formatAmount(input.optDouble("taxAmount"), currency), 11,
                    false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 5);
            w.add("صافي الفاتورة: " + formatAmount(input.optDouble("netTotal", 0), currency), 14, true,
                    Color.rgb(10, 96, 83), Layout.Alignment.ALIGN_NORMAL, 8);
            w.add("المدفوع: " + formatAmount(input.optDouble("paidAmount", 0), currency), 11, false,
                    Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 4);
            w.add("المتبقي: " + formatAmount(input.optDouble("remainingAmount", 0), currency), 11, true,
                    Color.BLACK, Layout.Alignment.ALIGN_NORMAL, 10);
            JSONObject beforeBalances = input.optJSONObject("previousBalances");
            JSONObject afterBalances = input.optJSONObject("finalBalances");
            if (beforeBalances != null && afterBalances != null) {
                w.rule(Color.rgb(196, 214, 223), 8);
                // Never expose balances from a second currency on this invoice.
                if (!beforeBalances.isNull(currency) && beforeBalances.has(currency)) {
                    w.add("الرصيد قبل الفاتورة (" + currency + "): " + formatAmount(beforeBalances.optDouble(currency), currency), 11,
                            false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 5);
                }
                if (!afterBalances.isNull(currency) && afterBalances.has(currency)) {
                    w.add("الرصيد النهائي (" + currency + "): " + formatAmount(afterBalances.optDouble(currency), currency), 12,
                            true, Color.rgb(15, 70, 82), Layout.Alignment.ALIGN_NORMAL, 7);
                }
            } else if (!input.isNull("previousBalance") && input.has("previousBalance")) {
                w.rule(Color.rgb(196, 214, 223), 8);
                w.add("الرصيد قبل الفاتورة: " + formatAmount(input.optDouble("previousBalance"), currency), 11,
                        false, Color.DKGRAY, Layout.Alignment.ALIGN_NORMAL, 5);
                w.add("الرصيد النهائي: " + formatAmount(input.optDouble("finalBalance"), currency), 12,
                        true, Color.rgb(15, 70, 82), Layout.Alignment.ALIGN_NORMAL, 7);
            }
            String note = clean(input.optString("note"), 500);
            if (!note.isEmpty()) w.add("ملاحظات: " + note, 10, false, Color.GRAY, Layout.Alignment.ALIGN_NORMAL, 8);
            w.add("تم إصدار هذه الفاتورة من التطبيق الرئيسي", 9, false,
                    Color.GRAY, Layout.Alignment.ALIGN_CENTER, 10);
            w.finish();
            ByteArrayOutputStream out = new ByteArrayOutputStream(24 * 1024);
            pdf.writeTo(out);
            return out.toByteArray();
        } finally { pdf.close(); }
    }

    private static String clean(String raw, int limit) {
        if (raw == null) return "";
        String cleaned = raw.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", " ").trim();
        return cleaned.length() > limit ? cleaned.substring(0, limit) : cleaned;
    }

    private static String formatPrice(double n, String currency, int decimals) {
        if (!Double.isFinite(n)) n = 0;
        return String.format(java.util.Locale.US, "%,." + decimals + "f", n)
                + ("SYP".equals(currency) ? " ل.س" : " $");
    }

    private static String formatAmount(double n, String currency) {
        if (!Double.isFinite(n)) n = 0;
        return String.format(java.util.Locale.US, currency.equals("SYP") ? "%,.0f ل.س" : "%,.2f $", n);
    }

    private static final class Writer {
        final PdfDocument pdf;
        int number = 0;
        float y;
        PdfDocument.Page page;
        Canvas canvas;
        Writer(PdfDocument pdf) { this.pdf = pdf; }
        void startPage() {
            if (page != null) closePage();
            page = pdf.startPage(new PdfDocument.PageInfo.Builder(W, H, ++number).create());
            canvas = page.getCanvas();
            canvas.drawColor(Color.WHITE);
            y = 40;
        }
        private TextPaint font(float size, boolean bold, int color) {
            TextPaint p = new TextPaint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
            p.setColor(color);
            p.setTextSize(size);
            p.setTypeface(Typeface.create("sans-serif", bold ? Typeface.BOLD : Typeface.NORMAL));
            return p;
        }
        private StaticLayout layout(String text, int size, boolean bold, int color, Layout.Alignment alignment) {
            String value = text == null ? "" : text;
            TextPaint p = font(size, bold, color);
            return StaticLayout.Builder.obtain(value, 0, value.length(), p, CONTENT_WIDTH)
                    .setTextDirection(TextDirectionHeuristics.RTL)
                    .setAlignment(alignment).setIncludePad(false).setLineSpacing(2f, 1f).build();
        }
        private void draw(StaticLayout layout, float top) {
            canvas.save(); canvas.translate(MARGIN, top); layout.draw(canvas); canvas.restore();
        }
        void add(String text, int size, boolean bold, int color, Layout.Alignment align, float after) {
            StaticLayout item = layout(text, size, bold, color, align);
            if (y + item.getHeight() + after > BOTTOM) startPage();
            draw(item, y);
            y += item.getHeight() + after;
        }
        void addLogo(Bitmap bitmap) {
            if (bitmap == null || bitmap.getWidth() <= 0 || bitmap.getHeight() <= 0) return;
            float width = Math.min(140f, bitmap.getWidth());
            float height = width * bitmap.getHeight() / bitmap.getWidth();
            if (height > 70f) { height = 70f; width = height * bitmap.getWidth() / bitmap.getHeight(); }
            if (y + height + 8 > BOTTOM) startPage();
            canvas.drawBitmap(bitmap, null,
                    new RectF((W - width)/2f, y, (W + width)/2f, y + height),
                    new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG));
            y += height + 8;
        }
        void addRow(String name, String detail) {
            StaticLayout first = layout(name, 12, true, Color.rgb(28, 48, 65), Layout.Alignment.ALIGN_NORMAL);
            StaticLayout second = layout(detail, 11, false, Color.rgb(77, 95, 107), Layout.Alignment.ALIGN_NORMAL);
            float required = first.getHeight() + second.getHeight() + 18;
            if (y + required > BOTTOM) startPage();
            draw(first, y); y += first.getHeight() + 4;
            draw(second, y); y += second.getHeight() + 8;
            Paint rule = new Paint(Paint.ANTI_ALIAS_FLAG);rule.setColor(Color.rgb(233, 239, 243));rule.setStrokeWidth(0.8f);
            canvas.drawLine(MARGIN, y, W - MARGIN, y, rule); y += 6;
        }
        void rule(int color, float after) {
            if (y + after > BOTTOM) startPage();
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);p.setColor(color);p.setStrokeWidth(1.2f);
            canvas.drawLine(MARGIN, y, W - MARGIN, y, p); y += after;
        }
        void closePage() {
            TextPaint text = font(9, false, Color.GRAY);
            StaticLayout foot = StaticLayout.Builder.obtain("صفحة " + number, 0,
                    ("صفحة " + number).length(), text, CONTENT_WIDTH)
                    .setTextDirection(TextDirectionHeuristics.RTL)
                    .setAlignment(Layout.Alignment.ALIGN_CENTER).setIncludePad(false).build();
            draw(foot, FOOTER_Y);
            pdf.finishPage(page);page=null;canvas=null;
        }
        void finish() { if (page != null) closePage(); }
    }
}
