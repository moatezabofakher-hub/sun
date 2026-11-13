/* Receipt renderer is derived from the primary application's thermal canvas template.
 * Company details are supplied only by authenticated manager sync catalogs.
 * No agent-side modifications to the manager's branding or saved operations.
 */
(function(){
'use strict';
const A=Agent;
const AgentInvoicePrint={
  agent:A,
  get settings(){return {
    companyName:A.state.companyName||'',companyPhone:A.state.companyPhone||'',
    companyAddress:A.state.companyAddress||'',companyLogo:A.state.companyLogo||'',
    footerNote:A.state.footerNote||'ثقتكم تهمنا',
    printFontScale:Number(A.state.printFontScale)||0.75,
    printerWidth:A.state.printerWidth===58?58:80,
    itemQuantityDecimals:Number.isInteger(Number(A.state.itemQuantityDecimals))?Math.min(4,Math.max(0,Number(A.state.itemQuantityDecimals))):2
  };},
  formatItemQuantity(v){const n=Number(v)||0;return n.toLocaleString('en-US',{maximumFractionDigits:this.settings.itemQuantityDecimals});},
  formatPriceNumber(v){const n=Number(v)||0;return n.toLocaleString('en-US',{maximumFractionDigits:this.settings.itemQuantityDecimals});},
  formatNumberOnly(v,c){const n=Number(v)||0;return (c==='USD'?Math.round((n+Number.EPSILON)*100)/100:Math.round(n)).toLocaleString('en-US',{minimumFractionDigits:c==='USD'?2:0,maximumFractionDigits:c==='USD'?2:0});},
  formatMoney(v,c){return this.formatNumberOnly(v,c)+(c==='USD'?' $':' ل.س');},
  formatPartyBalance(v,c){if(!Number.isFinite(v))return 'راجع كشف الحساب';return this.formatMoney(Math.abs(v),c)+(v>0?' عليه':v<0?' له':' مسدد');},
  formatReceiptDate(value){
    try{const d=new Date(value);if(isNaN(d.getTime()))return String(value||'').replace('T',' ');
      const p=n=>String(n).padStart(2,'0'),h=d.getHours(),hour=(h%12)||12;
      return `${p(d.getDate())}-${p(d.getMonth()+1)}-${d.getFullYear()} - ${p(hour)}:${p(d.getMinutes())} ${h>=12?'PM':'AM'}`;
    }catch(e){return String(value||'').replace('T',' ');}
  },
            async renderInvoiceToCanvas(inv, widthDots) {
                if (document.fonts && document.fonts.ready) {
                    await document.fonts.ready;
                }
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const is58 = widthDots <= 384;
                const scale = Number(this.settings.printFontScale) || 0.75;
                const pad = is58 ? 8 : 14;

                const fCompany = Math.round((is58 ? 26 : 36) * scale);
                const fPhone = Math.round((is58 ? 19 : 25) * scale);
                const fInvTitle = Math.round((is58 ? 28 : 40) * scale);
                const fMeta = Math.round((is58 ? 18 : 25) * scale);
                const fTableHead = Math.round((is58 ? 16 : 22) * scale);
                const fItem = Math.round((is58 ? 16 : 22) * scale);
                const fSum = Math.round((is58 ? 20 : 28) * scale);
                const fNet = Math.round((is58 ? 23 : 33) * scale);
                const fBalPrev = Math.round((is58 ? 18 : 24) * scale);
                const fBalFinal = Math.round((is58 ? 20 : 28) * scale);
                const fFooter = Math.round((is58 ? 18 : 25) * scale);
                const fSep = Math.round((is58 ? 16 : 22) * scale);

                const acc = this.agent.state.accounts.find(a => a.id === inv.accountId);
                // Exact invoice chronology is not available from a snapshot, so never invent
                // historical balances for invoices already accepted by the manager.
                let prevVal = NaN, finalVal = NaN;
                const balance = acc && this.agent.balanceFor ? this.agent.balanceFor(acc.id) : null;
                const accepted = new Set(this.agent.state.snapshotIds || []);
                const recent = (this.agent.state.ops||[]).filter(o=>o.accountId===inv.accountId && !accepted.has(o.id));
                const isLast = recent.length && recent[recent.length-1].id===inv.id;
                if(balance?.available && isLast && !accepted.has(inv.id)) {
                    finalVal = inv.currency==='SYP'?balance.syp:balance.usd;
                    const outstanding = Number(inv.netTotal||0)-Number(inv.paidAmount||0);
                    prevVal = finalVal - (inv.type==='sale_return'?-outstanding:outstanding);
                }
                const prevBalText = this.formatPartyBalance(prevVal, inv.currency);
                const finalBalText = this.formatPartyBalance(finalVal, inv.currency);

                const wrapTextLines = (text, fontStr, maxWidth) => {
                    ctx.font = fontStr;
                    const words = String(text || '').split(' ');
                    const lines = [];
                    let currentLine = words[0] || '';
                    for (let i = 1; i < words.length; i++) {
                        const testLine = currentLine + ' ' + words[i];
                        if (ctx.measureText(testLine).width <= maxWidth) {
                            currentLine = testLine;
                        } else {
                            lines.push(currentLine);
                            currentLine = words[i];
                        }
                    }
                    if (currentLine) lines.push(currentLine);
                    return lines;
                };

                let logoImg = null;
                if (this.settings.companyLogo) {
                    logoImg = await new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => resolve(null);
                        img.src = this.settings.companyLogo;
                    });
                }

                const estimatedHeight = Math.round((1700 + (inv.rows.length * 170)) * scale);
                canvas.width = widthDots;
                canvas.height = estimatedHeight;

                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#000000';
                ctx.textBaseline = 'top';
                ctx.direction = 'rtl';

                let y = 16;

                const drawDoubleSep = () => {
                    ctx.font = `bold ${fSep}px monospace`;
                    ctx.textAlign = 'center';
                    ctx.fillText(is58 ? '========================' : '==============================', widthDots / 2, y);
                    y += fSep + 10;
                };

                // 1. Optional Uploaded Logo + Company Name & Phone
                if (logoImg) {
                    const maxLogoW = Math.round(widthDots * 0.42);
                    const maxLogoH = Math.round((is58 ? 110 : 150) * scale);
                    const ratio = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height, 1);
                    const drawW = Math.round(logoImg.width * ratio);
                    const drawH = Math.round(logoImg.height * ratio);
                    ctx.drawImage(logoImg, Math.round((widthDots - drawW) / 2), y, drawW, drawH);
                    y += drawH + 10;
                }

                ctx.font = `900 ${fCompany}px Cairo, sans-serif`;
                ctx.textAlign = 'center';
                const compLines = wrapTextLines(this.settings.companyName || 'مؤسسة الرائد التجارية', `900 ${fCompany}px Cairo, sans-serif`, widthDots - pad * 2);
                for (const line of compLines) {
                    ctx.fillText(line, widthDots / 2, y);
                    y += fCompany + 8;
                }

                if (this.settings.companyPhone) {
                    ctx.font = `bold ${fPhone}px Cairo, sans-serif`;
                    ctx.fillText(this.settings.companyPhone, widthDots / 2, y);
                    y += fPhone + 8;
                }
                if (this.settings.companyAddress) {
                    ctx.font = `bold ${Math.round(fPhone * 0.9)}px Cairo, sans-serif`;
                    ctx.fillText(this.settings.companyAddress, widthDots / 2, y);
                    y += fPhone + 6;
                }

                drawDoubleSep();

                // 2. Invoice Title ("فاتورة مبيعات")
                ctx.font = `900 ${fInvTitle}px Cairo, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(`فاتورة ${(inv.type==='sale_return'?'مردود مبيعات':'مبيعات')}`, widthDots / 2, y);
                y += fInvTitle + 14;

                // 3. Metadata Rows (Right label, Center value)
                const drawMetaRow = (labelAr, valText) => {
                    ctx.font = `900 ${fMeta}px Cairo, sans-serif`;
                    ctx.textAlign = 'right';
                    ctx.fillText(labelAr, widthDots - pad, y);
                    ctx.font = `bold ${fMeta}px Cairo, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.fillText(valText, widthDots * 0.44, y);
                    y += fMeta + 12;
                };

                drawMetaRow('رقم الفاتورة', `فاتورة-${inv.number}`);
                drawMetaRow('التاريخ', this.formatReceiptDate(inv.date));
                drawMetaRow('الحساب', acc ? acc.name : 'زبون عام');

                y += 4;
                drawDoubleSep();

                // 4. 5-Column Table Header (# | اسم المادة | الوحدة | الكمية | الإفرادي | الاجمالي)
                const xIdx = widthDots - pad;
                const xName = widthDots - pad - (is58 ? 24 : 34);
                const xUnit = Math.round(widthDots * 0.50);
                const xQty = Math.round(widthDots * 0.37);
                const xPrice = Math.round(widthDots * 0.23);
                const xTotal = pad;
                const maxNameWidth = xName - (widthDots * 0.56);

                ctx.font = `900 ${fTableHead}px Cairo, sans-serif`;
                ctx.textAlign = 'right';
                ctx.fillText('#', xIdx, y);
                ctx.fillText('اسم المادة', xName, y);
                ctx.textAlign = 'center';
                ctx.fillText('الوحدة', xUnit, y);
                ctx.fillText('الكمية', xQty, y);
                ctx.fillText('الإفرادي', xPrice, y);
                ctx.textAlign = 'left';
                ctx.fillText('الاجمالي', xTotal, y);
                y += fTableHead + 6;

                // Dashed Sub-header Underlines
                ctx.font = `bold ${Math.round(fTableHead * 0.85)}px monospace`;
                ctx.textAlign = 'right';
                ctx.fillText('--', xIdx, y);
                ctx.fillText('---------', xName, y);
                ctx.textAlign = 'center';
                ctx.fillText('----', xUnit, y);
                ctx.fillText('--', xQty, y);
                ctx.fillText('----', xPrice, y);
                ctx.textAlign = 'left';
                ctx.fillText('----', xTotal, y);
                y += fTableHead + 6;

                // 5. Table Rows
                for (let i = 0; i < inv.rows.length; i++) {
                    const r = inv.rows[i];
                    const nameLines = wrapTextLines(r.itemName, `bold ${fItem}px Cairo, sans-serif`, maxNameWidth);

                    ctx.font = `bold ${fItem}px Cairo, sans-serif`;
                    ctx.textAlign = 'right';
                    ctx.fillText(String(i + 1), xIdx, y);
                    ctx.fillText(nameLines[0] || '', xName, y);

                    ctx.textAlign = 'center';
                    ctx.fillText(String(r.unitName || ''), xUnit, y);
                    ctx.fillText(this.formatItemQuantity(r.qty), xQty, y);
                    ctx.fillText(this.formatPriceNumber(r.price), xPrice, y);

                    ctx.font = `900 ${fItem}px Cairo, sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.fillText(this.formatNumberOnly(r.total, inv.currency), xTotal, y);

                    y += fItem + 8;

                    for (let nl = 1; nl < nameLines.length; nl++) {
                        ctx.font = `bold ${fItem}px Cairo, sans-serif`;
                        ctx.textAlign = 'right';
                        ctx.fillText(nameLines[nl], xName, y);
                        y += fItem + 6;
                    }
                    // Dotted separator after each product except last; preserves index numbers.
                    if (i < inv.rows.length - 1) {
                        const lineY = y + 2;
                        ctx.beginPath();
                        ctx.setLineDash([4, 6]);
                        ctx.strokeStyle = '#555555';
                        ctx.lineWidth = 1;
                        ctx.moveTo(pad, lineY);
                        ctx.lineTo(widthDots - pad, lineY);
                        ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.strokeStyle = '#000000';
                        y += 13;
                    }
                }
                ctx.font = `bold ${fMeta}px Cairo, sans-serif`;
                ctx.textAlign = 'right';
                ctx.fillText(`عدد الأصناف: ${inv.rows.length}`, widthDots - pad, y);
                y += fMeta + 12;
                drawDoubleSep();

                // 6. Totals Section
                const drawTotalRow = (labelAr, valStr, fontPx, isBoldLabel = false) => {
                    ctx.font = `${isBoldLabel ? '900' : 'bold'} ${fontPx}px Cairo, sans-serif`;
                    ctx.textAlign = 'right';
                    ctx.fillText(labelAr, widthDots - pad, y);
                    ctx.font = `900 ${fontPx}px Cairo, sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.fillText(valStr, pad, y);
                    y += fontPx + 12;
                };

                drawTotalRow('المجموع', this.formatMoney(inv.subTotal, inv.currency), fSum, false);
                if (Number(inv.discountAmount) > 0) {
                    drawTotalRow('الحسم', `- ${this.formatMoney(inv.discountAmount, inv.currency)}`, fSum, false);
                }
                if (Number(inv.taxAmount) > 0) {
                    drawTotalRow('الضريبة', `+ ${this.formatMoney(inv.taxAmount, inv.currency)}`, fSum, false);
                }
                drawTotalRow('المدفوع', this.formatMoney(inv.paidAmount, inv.currency), fSum, false);

                // Side Dashes Divider
                ctx.font = `bold ${fSep}px monospace`;
                ctx.textAlign = 'right';
                ctx.fillText('-----------', widthDots - pad, y);
                ctx.textAlign = 'left';
                ctx.fillText('-----------', pad, y);
                y += fSep + 10;

                drawTotalRow('إجمالي الفاتورة', this.formatMoney(inv.netTotal, inv.currency), fNet, true);
                drawTotalRow('المبلغ الباقي', this.formatMoney(inv.remainingAmount, inv.currency), fNet, true);

                y += 4;
                drawTotalRow('رصيد قبل الفاتورة', prevBalText, fBalPrev, false);
                drawTotalRow('الرصيد النهائي', finalBalText, fBalFinal, true);

                y += 6;
                drawDoubleSep();

                // 7. Footer Note
                const footerLines = wrapTextLines(this.settings.footerNote || 'ثقتكم تهمنا', `bold ${fFooter}px Cairo, sans-serif`, widthDots - pad * 2);
                ctx.font = `bold ${fFooter}px Cairo, sans-serif`;
                ctx.textAlign = 'center';
                for (const fl of footerLines) {
                    ctx.fillText(fl, widthDots / 2, y);
                    y += fFooter + 8;
                }
                y += 36;

                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = widthDots;
                finalCanvas.height = y;
                const fCtx = finalCanvas.getContext('2d');
                fCtx.fillStyle = '#FFFFFF';
                fCtx.fillRect(0, 0, widthDots, y);
                fCtx.drawImage(canvas, 0, 0);
                return finalCanvas;
            },
  canvasToEscPosRaster(canvas){
    const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height;
    const pixels=ctx.getImageData(0,0,width,height).data;
    const wBytes=Math.ceil(width/8), result=[27,64];
    // Chunk the raster to avoid printer firmware rejecting tall images (>255 rows).
    for(let baseY=0;baseY<height;baseY+=220){
      const h=Math.min(220,height-baseY);
      result.push(29,118,48,0,wBytes&255,(wBytes>>8)&255,h&255,(h>>8)&255);
      for(let y=baseY;y<baseY+h;y++)for(let xb=0;xb<wBytes;xb++){
        let bits=0;
        for(let bit=0;bit<8;bit++){
          const x=xb*8+bit;if(x>=width)continue;
          const i=(y*width+x)*4;
          const luminance=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
          if(luminance<160)bits|=128>>bit;
        }
        result.push(bits);
      }
    }
    result.push(27,100,4,29,86,66,0);
    return new Uint8Array(result);
  },
  async print(id){
    const op=A.state.ops.find(o=>o.id===id);if(!op)return;
    if(!window.AndroidPrinter?.printBase64)throw Error('طباعة بلوتوث تتطلب تطبيق أندرويد');
    const calcNet=op.netTotal??op.rows.reduce((sum,r)=>sum+Number(r.total||0),0);
    const paid=Number(op.paidAmount||0);
    const inv={...op,id:op.id,number:op.localNumber||op.id,
      netTotal:Number(calcNet),paidAmount:paid,remainingAmount:Number(calcNet)-paid,
      subTotal:Number(op.subTotal??op.rows.reduce((sum,r)=>sum+Number(r.total||0),0)),
      discountAmount:Number(op.discountAmount||0),taxAmount:Number(op.taxAmount||0)};
    const width=this.settings.printerWidth===58?384:576;
    const canvas=await this.renderInvoiceToCanvas(inv,width);
    const bytes=this.canvasToEscPosRaster(canvas);
    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    window.AndroidPrinter.printBase64(btoa(binary));
  }
};
const original=A.printOp.bind(A);
A.printOp=async function(id){
 const op=this.state.ops.find(o=>o.id===id);if(!op)return;
 if(!['sale','sale_return'].includes(op.kind))return original(id);
 try{await AgentInvoicePrint.print(id);this.toast('أُرسلت فاتورة المندوب للطابعة بتنسيق الإدارة الرئيسي.');}
 catch(e){this.toast('تعذر طباعة فاتورة المندوب: '+e.message);}
};
})();
