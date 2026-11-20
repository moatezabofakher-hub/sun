/* Group the integer part for display. Existing accounting handlers read the ungrouped value. */
(() => {
    'use strict';
    const native=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    const prepared=new WeakSet();
    const ids=/amount|paid|price|cost|^acc(?:limit|open)|^unit(?:sale|center|consumer)_|^(?:expense|employeeFx|modal|taShare|ta147|agentFx147)Rate|^(?:taFx|agentFx)(?:Buy|Sell|Rate|Spent|Received|Syp)|^ta(?:147(?:Buy|Sell)|150General)_|^agentQuickFxInput$|^invoice(?:Tax|Discount)$/i;
    const digits=s=>String(s).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
    const raw=s=>digits(s).replace(/[,٬]/g,'').replace(/٫/g,'.');
    const group=s=>raw(s).replace(/^(-?)(\d+)(?=\.|$)/,(_,sign,n)=>sign+n.replace(/\B(?=(\d{3})+(?!\d))/g,','));
    function monetary(el){
        if (!(el instanceof HTMLInputElement) || !['text','number','tel'].includes(el.type)) return false;
        if (el.hasAttribute('data-money')||el.hasAttribute('data-count')||el.hasAttribute('data-allocation')||el.hasAttribute('data-cost-id')) return true;
        const handler=[el.getAttribute('oninput'),el.getAttribute('onchange')].join(' ');
        return ids.test(el.id)||/(?:updatePrice|(?:discount|tax)Value|draft\.(?:amount|exchangeRate)|['"](?:price|costPrice|salePrice|discount|purchaseAddAmount)['"])/i.test(handler);
    }
    function prepare(el){
        if(prepared.has(el)||!monetary(el))return;
        prepared.add(el);
        const numeric=el.type==='number';
        const value=native.get.call(el);
        el.type='text';el.inputMode='decimal';el.dir='ltr';
        function validate(v){
            if(!numeric)return;
            let message='';
            if(v!=='' && (!Number.isFinite(Number(v)) || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v)))message='أدخل رقماً صحيحاً';
            else if(v!=='' && ((el.min!==''&&Number(v)<Number(el.min))||(el.max!==''&&Number(v)>Number(el.max))))message='القيمة خارج المجال المسموح';
            el.setCustomValidity(message);
        }
        function write(v){const s=group(v??'');native.set.call(el,s);validate(raw(s));}
        Object.defineProperty(el,'value',{configurable:true,get(){return raw(native.get.call(el));},set:write});
        if(numeric)Object.defineProperty(el,'valueAsNumber',{configurable:true,get(){return this.value.trim()===''?NaN:Number(this.value);},set(v){write(Number.isNaN(v)?'':v);}});
        write(value);
        el.addEventListener('beforeinput',e=>{
            const pos=el.selectionStart,back=e.inputType==='deleteContentBackward';
            if(pos!==el.selectionEnd||(!back&&e.inputType!=='deleteContentForward'))return;
            const text=native.get.call(el);
            if(text[back?pos-1:pos]===',')el.setSelectionRange(back?pos-2:pos,back?pos:pos+2);
        });
        el.addEventListener('input',()=>{
            const before=native.get.call(el),pos=el.selectionStart,count=raw(before.slice(0,pos)).length;
            const after=group(before);
            if(after!==before){
                native.set.call(el,after);
                let caret=0, seen=0;
                while(caret<after.length&&seen<count){if(after[caret]!==',')seen++;caret++;}
                el.setSelectionRange(caret,caret);
            }
            validate(el.value);
        },true);
    }
    const selector='input[type=number],input[inputmode=decimal],input[data-money],input[type=text],input:not([type])';
    function scan(root){if(root.nodeType!==1)return;if(root.matches(selector))prepare(root);root.querySelectorAll(selector).forEach(prepare);}
    scan(document.documentElement);
    new MutationObserver(records=>{for(const r of records)r.addedNodes.forEach(scan);}).observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('focusin',e=>prepare(e.target),true);
})();
