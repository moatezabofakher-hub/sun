/* Employee wage agreements and cash payments in the company ledger. */
const Payroll = (() => {
    'use strict';
    const labels = {terms:'رواتب الموظفين', advance:'سلف الموظفين', salary:'ترحيل الرواتب', bonus:'نظام المكافآت'};
    const frequency = {weekly:'أسبوعي', monthly:'شهري', yearly:'سنوي'};
    const categories = {salary:'رواتب وأجور', advance:'سلف الموظفين', bonus:'مكافأة ممنوحة'};
    const actions = {salary:'ترحيل الراتب', advance:'إضافة سلفة', bonus:'منح مكافأة'};
    const icons = {terms:'id-card', advance:'hand-holding-usd', salary:'money-check', bonus:'gift'};
    const esc = value => AppEscape.text(String(value ?? ''));
    const iso = date => date.toISOString().slice(0,10);
    const today = () => { const d=new Date(); return iso(new Date(d.getTime()-d.getTimezoneOffset()*60000)); };
    const maxDays = (cycle,year) => cycle==='weekly'?7:cycle==='monthly'?30:(new Date(Date.UTC(year,1,29)).getUTCDate()===29?366:365);
    function period(cycle, day) {
        if (!Object.hasOwn(frequency,cycle) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error('اختر تاريخاً صحيحاً');
        const date=new Date(day+'T00:00:00Z');
        if (!Number.isFinite(date.getTime()) || iso(date)!==day) throw Error('اختر تاريخاً صحيحاً');
        const year=date.getUTCFullYear(), month=date.getUTCMonth();
        if (cycle==='yearly') return [year+'-01-01',year+'-12-31'];
        if (cycle==='monthly') return [iso(new Date(Date.UTC(year,month,1))),iso(new Date(Date.UTC(year,month+1,0)))];
        date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+1)%7);
        const start=iso(date);
        date.setUTCDate(date.getUTCDate()+6);
        return [start,iso(date)];
    }
    function settlement(rows, employeeId, currency, start, end, gross, skip) {
        let opening=0, advances=0;
        for (const row of rows) {
            const p=row.payroll;
            if (!p || row.id===skip || p.employeeId!==employeeId || row.currency!==currency) continue;
            if (p.kind==='salary' && p.end<start) opening+=Number(p.gross)-Number(row.amount);
            if (p.kind==='advance' && row.date<=end) {
                if (row.date<start) opening-=Number(row.amount);
                else advances+=Number(row.amount);
            }
        }
        const round=n=>Math.round(n*1e8)/1e8;
        return {opening:round(opening),advances:round(advances),net:round(opening+gross-advances)};
    }
    const directory=()=>State.payrollStaff || [];
    const agreements=id=>directory().find(s=>s.id===id);
    const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    function staff() {
        const merged=new Map(directory().map(x=>[x.id,{id:x.id,name:x.name}]));
        for (const row of State.expenses || []) {
            if(row.payroll && !merged.has(row.payroll.employeeId)) merged.set(row.payroll.employeeId,{id:row.payroll.employeeId,name:row.note});
        }
        for (const a of State.fieldSync?.agents || []) {
            if (!a.archived || merged.has(a.id)) merged.set(a.id,{id:a.id,name:a.name});
        }
        return [...merged.values()].sort((a,b)=>a.name.localeCompare(b.name,'ar'));
    }
    const go=params=>AppNav.navigate('payroll',params);
    const field=(label,html)=>'<label class="pay-field">'+esc(label)+html+'</label>';
    const moneyInput=(id,value='')=>'<input data-money id="'+id+'" type="text" inputmode="decimal" dir="ltr" required value="'+esc(value)+'">';
    const button=(title,attrs='',icon='')=>'<button type="button" class="ta-report-deep-action rounded-xl p-3 font-bold" '+attrs+'>'+(icon?'<i aria-hidden="true" class="fas fa-'+icon+' ml-2"></i>':'')+esc(title)+'</button>';
    const saveBar=()=>'<div class="pay-actions"><button class="rounded-xl bg-emerald-700 text-white p-3 font-bold" type="submit">حفظ</button>'+button('إلغاء','data-cancel')+'</div>';
    const layout=body=>'<section class="pay-page space-y-3" dir="rtl">'+body+'</section>';
    const payRows=id=>(State.expenses||[]).filter(x=>x.payroll?.employeeId===id);
    const revision=id=>JSON.stringify([agreements(id),payRows(id),staff().find(x=>x.id===id)]);
    function cancel() {AppNav.clearDirty();AppNav.handleBackButton();}
    function bindForm(main, save) {
        const form=main.querySelector('form');
        let saving=false;
        const submit=async()=>{
            if (saving || !form.reportValidity()) return false;
            saving=true;
            const control=form.querySelector('[type=submit]');control.disabled=true;
            try { return await save(); }
            catch(e){UI.toast(e.message || 'تعذر حفظ العملية','error');return false;}
            finally{saving=false;control.disabled=false;}
        };
        form.onsubmit=e=>{e.preventDefault();void submit();};
        form.oninput=()=>AppNav.markDirty(submit);
        main.querySelector('[data-cancel]').onclick=cancel;
    }
    async function persist(key, record, freshOperation=false) {
        if (freshOperation && !LicenseManager.canPerformOperation()) return false;
        const before=State[key]||[], previousCount=State.license.opsUsedCount;
        const updated=[...before.filter(x=>x.id!==record.id),record];
        State[key]=updated;
        try {
            if (freshOperation) await LicenseManager.recordNewOperation();
            else await StorageEngine.saveState();
        } catch(e) {
            if(State[key]===updated) State[key]=before;
            if(freshOperation) State.license.opsUsedCount=previousCount;
            throw e;
        }
        AppNav.clearDirty();
        UI.toast('تم الحفظ','success');
        return true;
    }
    function render(main, params={}) {
        const {section,employeeId}=params;
        if (!Object.hasOwn(labels,section)) {
            UI.setHeader('أجور الموظفين','');
            main.innerHTML=layout('<div class="pay-grid">'+Object.keys(labels).map(k=>button(labels[k],'data-section="'+k+'"',icons[k])).join('')+'</div>');
            main.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>go({section:b.dataset.section}));
            return;
        }
        const employees=staff();
        const employee=employees.find(s=>s.id===employeeId);
        UI.setHeader(labels[section],esc(employee?.name||'اختر الموظف'));
        if (!employee) {
            main.innerHTML=layout('<div class="pay-grid">'+employees.map(s=>button(s.name,'data-staff="'+esc(s.id)+'"','user')).join('')+'</div>'+
                (!employees.length?'<p>لا يوجد موظفون مسجّلون بعد.</p>':'')+
                (typeof AgentHub==='undefined'?'<form>'+field('اسم الموظف','<input id="pay-name" required maxlength="100" autocomplete="off">')+'<button type="submit" class="ta-report-deep-action rounded-xl p-3">إضافة موظف</button></form>':''));
            main.querySelectorAll('[data-staff]').forEach(b=>b.onclick=()=>go({section,employeeId:b.dataset.staff}));
            const form=main.querySelector('form');
            if(form) form.onsubmit=async e=>{
                e.preventDefault();const name=form.querySelector('input').value.trim();
                if(!name || staff().some(x=>x.name===name)) return UI.toast('أدخل اسماً جديداً للموظف','warn');
                form.querySelector('button').disabled=true;
                try{await persist('payrollStaff',{id:'local_'+uid(),name});render(main,params);}
                catch{form.querySelector('button').disabled=false;UI.toast('تعذر حفظ الموظف','error');}
            };
            return;
        }
        const profile=agreements(employeeId);
        if(section==='terms') return terms(main,employee,profile);
        operations(main,employee,section,params,profile);
    }
    function terms(main, employee, old) {
        const cycle=old?.cycle || 'monthly', year=Number(today().slice(0,4)), original=revision(employee.id);
        const currency=old?.currency || CurrencyCatalog.primary();
        main.innerHTML=layout('<form>'+field('الراتب عن الفترة ('+currency+')',moneyInput('pay-gross',old?.gross))+
            field('مدة الدفع','<select id="pay-cycle">'+Object.entries(frequency).map(([k,v])=>'<option value="'+k+'" '+(k===cycle?'selected':'')+'>'+v+'</option>').join('')+'</select>')+
            field('عدد أيام العمل','<input type="number" id="pay-days" min="1" step="1" max="'+maxDays(cycle,year)+'" required value="'+esc(old?.days??'')+'">')+saveBar()+'</form>');
        const select=main.querySelector('#pay-cycle'), days=main.querySelector('#pay-days');
        select.onchange=()=>days.max=maxDays(select.value,year);
        bindForm(main,async()=>{
            if(revision(employee.id)!==original)throw Error('تغيّر سجل الموظف. افتح الصفحة من جديد');
            const raw=Number(main.querySelector('#pay-gross').value);
            const gross=Accounting.round(raw,currency);
            if(!Number.isFinite(raw)||gross<=0||gross>1e15)throw Error('أدخل راتباً موجباً صحيحاً');
            if(!Number.isInteger(days.valueAsNumber)||days.valueAsNumber<1||days.valueAsNumber>maxDays(select.value,year))throw Error('عدد أيام العمل يتجاوز حدود الفترة');
            const saved=await persist('payrollStaff',{id:employee.id,name:employee.name,cycle:select.value,days:days.valueAsNumber,gross,currency});
            if(saved)cancel();return saved;
        });
    }
    function operations(main, employee, kind, params, profile) {
        const history=payRows(employee.id).filter(x=>x.payroll.kind===kind).sort((a,b)=>b.date.localeCompare(a.date));
        const old=params.recordId?history.find(x=>x.id===params.recordId):null;
        const list=()=>'<div class="pay-list">'+history.map(x=>button(x.date+' · '+Accounting.format(x.amount,x.currency)+' · تعديل','data-edit="'+esc(x.id)+'"')).join('')+'</div>';
        const openEdits=()=>main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>go({...params,recordId:b.dataset.edit}));
        if(kind==='salary'&&!old&&!profile?.cycle){
            main.innerHTML=layout('<p>حدّد الراتب ومدة الدفع أولاً.</p>'+button('تحديد الراتب','data-terms')+list());
            main.querySelector('[data-terms]').onclick=()=>go({section:'terms',employeeId:employee.id});openEdits();return;
        }
        const currency=old?.currency||profile?.currency||CurrencyCatalog.primary();
        const startDate=old?.date||today(), terms=old?.payroll||profile;
        main.innerHTML=layout('<form><h3>'+esc(actions[kind])+'</h3>'+field(kind==='salary'?'تاريخ الدفع ضمن فترة الراتب':'تاريخ العملية',
            '<input type="date" id="pay-date" required value="'+esc(startDate)+'">')+
            '<div id="pay-calculation" aria-live="polite"></div>'+field((kind==='salary'?'المبلغ المدفوع':kind==='advance'?'قيمة السلفة':'قيمة المكافأة')+' ('+currency+')',moneyInput('pay-amount',old?.amount))+saveBar()+'</form>'+list());
        const date=main.querySelector('#pay-date'), input=main.querySelector('#pay-amount');
        if(old&&kind==='salary'){date.min=old.payroll.start;date.max=old.payroll.end;}
        const balance=()=>{
            const [start,end]=period(terms.cycle,date.value);
            const existing=history.find(r=>r.payroll.start<=end&&r.payroll.end>=start&&r.id!==old?.id);
            if(existing)throw Error('رُحّل راتب هذه الفترة سابقاً. اختر الدفعة من السجل لتعديلها');
            const gross=terms.gross;
            return {start,end,gross,...settlement(State.expenses,employee.id,currency,start,end,gross,old?.id)};
        };
        const preview=()=>{
            if(kind!=='salary')return;
            const box=main.querySelector('#pay-calculation');
            try{const b=balance();
                const lines=[['راتب الفترة',b.gross],['الرصيد المرحّل',b.opening],['سلف الفترة',b.advances],['صافي المبلغ المستحق',b.net]];
                box.innerHTML='<p dir="ltr">'+b.start+' — '+b.end+'</p>'+lines.map(([label,n])=>'<p>'+label+' <b>'+esc(Accounting.format(n,currency))+'</b></p>').join('');
                input.value=old?.amount??Math.max(0,b.net);
            }catch(e){box.textContent=e.message;input.value='';}
        };
        date.onchange=preview;preview();openEdits();
        const original=revision(employee.id);
        bindForm(main,async()=>{
            if(revision(employee.id)!==original)throw Error('تغيّر سجل الموظف. افتح الصفحة من جديد');
            const raw=Number(input.value), amount=Accounting.round(raw,currency);
            if(!date.value || input.value.trim()===''||!Number.isFinite(raw)||amount<0||amount>1e15||(amount===0&&kind!=='salary'))throw Error('أدخل مبلغاً صحيحاً');
            const payroll={kind,employeeId:employee.id};
            if(kind==='salary'){const b=balance();Object.assign(payroll,{start:b.start,end:b.end,gross:b.gross,cycle:terms.cycle,days:terms.days});}
            const id=old?.id||(kind==='salary'?'pay_'+employee.id+'_'+payroll.start:'exp_'+uid());
            const row={...old,id,amount,currency,category:categories[kind],date:date.value,note:employee.name,
                exchangeRate:old?.exchangeRate||Number(State.settings.exchangeRate)||1,payroll,updatedAt:new Date().toISOString()};
            const saved=await persist('expenses',row,!old);
            if(saved){if(old)cancel();else render(main,params);}
            return saved;
        });
    }
    function edit(row){go({section:row.payroll.kind,employeeId:row.payroll.employeeId,recordId:row.id});}
    return {render,edit,period,settlement,maxDays};
})();
