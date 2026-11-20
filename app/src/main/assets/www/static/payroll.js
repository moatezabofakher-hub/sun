/* Employee wage agreements and cash payments in the company ledger. */
const Payroll = (() => {
    'use strict';
    const labels = {terms:'رواتب الموظفين', advance:'سلف الموظفين', salary:'ترحيل الرواتب', bonus:'نظام المكافآت',leaves:'الإجازات'};
    const frequency = {weekly:'أسبوعي', monthly:'شهري', yearly:'سنوي'};
    const categories = {salary:'رواتب وأجور', advance:'سلف الموظفين', bonus:'مكافأة ممنوحة'};
    const actions = {salary:'ترحيل الراتب', advance:'إضافة سلفة', bonus:'منح مكافأة'};
    const icons = {terms:'users', advance:'hand-holding-dollar', salary:'file-invoice-dollar', bonus:'coins',leaves:'calendar-days'};
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
    function settlement(rows, employeeId, currency, start, end, gross, skip, leaveDeduction=0) {
        let opening=0, advances=0;
        for (const row of rows) {
            const p=row.payroll;
            if (!p || row.id===skip || p.employeeId!==employeeId || row.currency!==currency) continue;
            if (p.kind==='salary' && p.end<start) opening+=Number(p.gross)-(Number(p.leaveDeduction)||0)-Number(row.amount);
            if (p.kind==='advance' && row.date<=end) {
                if (row.date<start) opening-=Number(row.amount);
                else advances+=Number(row.amount);
            }
        }
        const round=n=>Math.round(n*1e8)/1e8;
        return {opening:round(opening),advances:round(advances),net:round(opening+gross-advances-leaveDeduction)};
    }
    function allocations(rows) {
        const owners=new Map(), advances=rows.filter(r=>r.payroll?.kind==='advance');
        const salaries=rows.filter(r=>r.payroll?.kind==='salary').sort((a,b)=>a.payroll.end.localeCompare(b.payroll.end));
        // Explicit links take precedence over inference for pre-update salary records.
        for(const salary of salaries) for(const id of salary.payroll.advanceIds || []) owners.set(id,salary.id);
        for(const salary of salaries) {
            if(Array.isArray(salary.payroll.advanceIds))continue;
            for(const a of advances) if(!owners.has(a.id) && a.payroll.employeeId===salary.payroll.employeeId &&
                a.currency===salary.currency && a.date<=salary.payroll.end && (!a.createdAt||!salary.updatedAt||a.createdAt<=salary.updatedAt))
                owners.set(a.id,salary.id);
        }
        return owners;
    }
    function description(row, rows, owners) {
        if(row.payroll?.kind!=='salary')return row.note || 'مصروف نقدي';
        const linked=Array.isArray(row.payroll.advanceReceipts)?row.payroll.advanceReceipts:rows.filter(a=>owners.get(a.id)===row.id);
        const total=linked.reduce((sum,a)=>sum+Number(a.amount),0);
        const details=linked.map(a=>a.date+' · '+Accounting.format(a.amount,a.currency)).join('، ');
        return (row.note||'')+' · السلف المسوّاة '+Accounting.format(total,row.currency)+(details?' ('+details+')':'')+
            (row.payroll.leaveDeduction?' · حسم الإجازات ('+(row.payroll.leaveReceipts||[]).reduce((n,c)=>n+c.days,0)+' يوم) '+Accounting.format(row.payroll.leaveDeduction,row.currency):'')+
            ' · المدفوع عند الترحيل '+Accounting.format(row.amount,row.currency);
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
        const submit=async(fromButton)=>{
            if (saving || !form.reportValidity()) return false;
            saving=true;
            const control=form.querySelector('[type=submit]');control.disabled=true;
            try { return await save(fromButton); }
            catch(e){UI.toast(e.message || 'تعذر حفظ العملية','error');return false;}
            finally{saving=false;control.disabled=false;}
        };
        form.onsubmit=e=>{e.preventDefault();void submit(true);};
        form.oninput=()=>AppNav.markDirty(()=>submit(false));
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
    const dayNumber=value=>Date.parse(String(value)+'T00:00:00Z')/86400000;
    const dayString=n=>iso(new Date(n*86400000));
    function leaveCharges(profile,employeeRows,day,terms,currency,posted) {
        const daily=Number(terms.gross)/Number(terms.days);
        if(posted){
            const receipts=posted.payroll.leaveReceipts||[];
            return {daily,receipts,days:receipts.reduce((n,r)=>n+r.days,0),amount:Number(posted.payroll.leaveDeduction)||0};
        }
        const used=new Map(),receipts=[];
        for(const row of employeeRows){
            for(const receipt of row.payroll?.leaveReceipts||[]){
                if(!used.has(receipt.leaveId))used.set(receipt.leaveId,[]);
                used.get(receipt.leaveId).push([dayNumber(receipt.from),dayNumber(receipt.to)]);
            }
        }
        let days=0,amount=0;
        function add(leave,start,end){
            if(start>end)return;
            const count=end-start+1, next=Accounting.round((days+count)*daily,currency);
            receipts.push({leaveId:leave.id,from:dayString(start),to:dayString(end),days:count,
                reason:leave.reason,amount:Accounting.round(next-amount,currency)});
            days+=count;amount=next;
        }
        for(const leave of profile?.leaves||[]){
            let start=dayNumber(leave.start);
            const end=Math.min(dayNumber(day),start+leave.days-1);
            if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)continue;
            for(const [a,b] of (used.get(leave.id)||[]).sort((x,y)=>x[0]-y[0])){
                if(b<start)continue;
                if(a>end)break;
                if(start<a)add(leave,start,a-1);
                start=Math.max(start,b+1);
            }
            add(leave,start,end);
        }
        return {daily,days,amount,receipts};
    }
    function leavePage(main,employee) {
        const profile=agreements(employee.id), leaves=profile?.leaves||[], payments=payRows(employee.id);
        main.innerHTML=layout(button('طلب إجازة','data-leave-new','calendar-plus')+
            [...leaves].sort((a,b)=>b.start.localeCompare(a.start)).map((leave)=>{
                const claims=payments.flatMap(row=>(row.payroll?.leaveReceipts||[]).filter(c=>c.leaveId===leave.id).map(c=>({row,c})));
                const used=claims.reduce((n,{c})=>n+c.days,0),end=dayString(dayNumber(leave.start)+leave.days-1);
                return '<article class="ta-enh-panel" data-leave-record><b>'+esc(leave.start)+(end!==leave.start?' — '+esc(end):'')+
                    '</b><p>عدد أيام الإجازة · '+esc(leave.days)+'</p><p>البيان · '+esc(leave.reason)+'</p>'+
                    claims.map(({row,c})=>'<p>تم خصم '+esc(c.days)+' يوم من الراتب المرحّل بتاريخ '+esc(row.date)+' · '+esc(Accounting.format(c.amount,row.currency))+'</p>').join('')+
                    (used<leave.days?'<small>بانتظار الحسم · '+esc(leave.days-used)+' يوم</small>':'')+'</article>';
            }).join('')+(!leaves.length?'<p>لا توجد إجازات مسجّلة.</p>':''));
        main.querySelector('[data-leave-new]').onclick=()=>{
            const original=revision(employee.id);
            UI.openModal('<form class="pay-page space-y-3" dir="rtl"><h3>طلب إجازة · '+esc(employee.name)+'</h3>'+
                field('تاريخ بدء الإجازة','<input required type="date" name="start" value="'+today()+'">')+
                field('عدد الأيام المطلوبة','<input required type="number" step="1" min="1" name="days" inputmode="numeric">')+
                field('بيان السبب','<textarea required name="reason" rows="3" maxlength="1000"></textarea>')+saveBar()+'</form>');
            const form=document.querySelector('#modalBox form');
            let busy=false;
            const save=async()=>{
                if(busy||!form.reportValidity())return false;
                if(revision(employee.id)!==original){UI.toast('تغيّر سجل الموظف. افتح طلب الإجازة من جديد','warn');return false;}
                const start=form.elements.start.value,days=form.elements.days.valueAsNumber,reason=form.elements.reason.value.trim();
                const a=dayNumber(start),b=a+days-1;
                if(!Number.isInteger(a)||!Number.isSafeInteger(days)||days<=0||!Number.isFinite(new Date(b*86400000).getTime())||!reason){UI.toast('أدخل تاريخاً وعدد أيام وسبباً صحيحاً','warn');return false;}
                if(leaves.some(l=>{const first=dayNumber(l.start);return first<=b && a<first+l.days;})){UI.toast('بعض هذه الأيام مسجّلة في إجازة أخرى','warn');return false;}
                busy=true;
                try{
                    const entry={id:uid(),start,days,reason};
                    await persist('payrollStaff',{...profile,id:employee.id,name:employee.name,updatedAt:new Date().toISOString(),leaves:[...leaves,entry]});
                    UI.forceCloseModal();leavePage(main,employee);return true;
                }catch(e){UI.toast(e.message||'تعذر حفظ الإجازة','error');return false;}
                finally{busy=false;}
            };
            form.onsubmit=e=>{e.preventDefault();void save();};
            form.oninput=()=>AppNav.markModalDirty(save);
            form.querySelector('[data-cancel]').onclick=()=>UI.forceCloseModal();
        };
    }
    function salarySummary(employee, terms, rows, day) {
        if (!terms?.cycle) return employee.name+' · لم يُحدَّد الراتب';
        const [start,end]=period(terms.cycle,day);
        const posted=rows.find(row=>row.payroll.kind==='salary' && row.payroll.start<=day && row.payroll.end>=day);
        const current=posted?.payroll || terms;
        const currency=posted?.currency || terms.currency;
        const leave=leaveCharges(terms,rows,day,current,currency,posted);
        const balance=settlement(rows,employee.id,currency,posted?.payroll.start || start,posted?.payroll.end || end,current.gross,posted?.id,leave.amount);
        const remaining=Accounting.round(balance.net-(posted?.amount || 0),currency);
        const status=remaining<0?'مدفوع مقدماً':posted?'المتبقي':'صافي المستحق';
        return employee.name+' · '+status+' '+Accounting.format(Math.abs(remaining),currency);
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
            const names=new Map(employees.map(person=>[person.id,person.name]));
            if (section==='salary') {
                const rowsByEmployee=new Map();
                for (const row of State.expenses || []) {
                    if (!row.payroll) continue;
                    const id=row.payroll.employeeId;
                    if (!rowsByEmployee.has(id)) rowsByEmployee.set(id,[]);
                    rowsByEmployee.get(id).push(row);
                }
                const termsByEmployee=new Map(directory().map(person=>[person.id,person]));
                const day=today();
                for (const employee of employees) {
                    names.set(employee.id,salarySummary(employee,termsByEmployee.get(employee.id),rowsByEmployee.get(employee.id)||[],day));
                }
            }
            main.innerHTML=layout('<div class="pay-grid">'+employees.map(s=>button(names.get(s.id),'data-staff="'+esc(s.id)+'"','user')).join('')+'</div>'+
                (!employees.length?'<p>لا يوجد موظفون مسجّلون بعد.</p>':'')+
                (typeof AgentHub==='undefined'&&section!=='leaves'?'<form>'+field('اسم الموظف','<input id="pay-name" required maxlength="100" autocomplete="off">')+'<button type="submit" class="ta-report-deep-action rounded-xl p-3">إضافة موظف</button></form>':''));
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
        if(section==='leaves')return leavePage(main,employee);
        if(section==='terms') return terms(main,employee,profile);
        operations(main,employee,section,params,profile);
    }
    function postingPicker(box, initialCycle, saved) {
        const choices={}, now=new Date();
        let cycle=initialCycle, visibleMonth=new Date(now.getFullYear(),now.getMonth(),1,12);
        if(saved)choices[cycle]={...saved};
        const change=()=>box.dispatchEvent(new Event('input',{bubbles:true}));
        function draw(){
            const cur=choices[cycle]||{}, weekly=cycle==='weekly', yearly=cycle==='yearly';
            const month=yearly?(cur.month||now.getMonth()+1):visibleMonth.getMonth()+1;
            // February 29 can be chosen for an annual recurrence even in an ordinary year.
            const year=yearly?now.getFullYear():visibleMonth.getFullYear();
            const weekOrder=[6,0,1,2,3,4,5];
            const days=weekly?weekOrder:Array.from({length:PayCalendar.limit(year,month)},(_,i)=>i+1);
            const offset=weekly?0:(new Date(year,month-1,1).getDay()+1)%7;
            const dayButtons=days.map(d=>'<button type="button" data-pay-day="'+d+'" aria-pressed="'+(cur.day===d)+'">'+(weekly?PayCalendar.weekdays[d]:d)+'</button>').join('');
            const headers=weekly?'':weekOrder.map(d=>'<small>'+PayCalendar.weekdays[d]+'</small>').join('')+'<span></span>'.repeat(offset);
            const selected=cur.day==null?'غير محدد':weekly?PayCalendar.weekdays[cur.day]:yearly?cur.day+' '+PayCalendar.months[month-1]:cur.day+' من كل شهر';
            box.innerHTML='<fieldset class="pay-schedule"><legend>موعد الترحيل</legend>'+
                (yearly?'<label>الشهر <select aria-label="شهر الترحيل">'+PayCalendar.months.map((m,i)=>'<option value="'+(i+1)+'" '+(i+1===month?'selected':'')+'>'+m+'</option>').join('')+'</select></label>':
                 weekly?'':'<div class="pay-month-navigation"><button type="button" data-step="-1" aria-label="الشهر السابق">‹</button><b>'+PayCalendar.months[month-1]+' '+year+'</b><button type="button" data-step="1" aria-label="الشهر التالي">›</button></div>')+
                '<div class="pay-calendar'+(weekly?' pay-week':'')+'">'+headers+dayButtons+'</div>'+
                (yearly&&month===2&&days.length===28?'<button type="button" data-leap>29 شباط</button>':'')+
                (cycle==='monthly'?'<button type="button" data-last aria-pressed="'+(cur.day===31)+'">آخر يوم من الشهر</button>':'')+
                '<div class="pay-chosen"><span aria-live="polite">'+selected+'</span> <button type="button" data-pay-clear '+(cur.day==null?'hidden':'')+'>إلغاء موعد الترحيل</button></div></fieldset>';
            function choose(day){choices[cycle]={day,...(yearly?{month}:{})};draw();change();}
            box.querySelectorAll('[data-pay-day]').forEach(b=>b.onclick=()=>choose(Number(b.dataset.payDay)));
            box.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{visibleMonth.setMonth(visibleMonth.getMonth()+Number(b.dataset.step));draw();});
            const monthSelect=box.querySelector('select');
            if(monthSelect)monthSelect.onchange=()=>{
                const m=Number(monthSelect.value);choices[cycle]={month:m,day:cur.day==null?undefined:Math.min(cur.day,PayCalendar.limit(2000,m))};draw();change();
            };
            const leap=box.querySelector('[data-leap]');if(leap)leap.onclick=()=>choose(29);
            const last=box.querySelector('[data-last]');if(last)last.onclick=()=>choose(31);
            box.querySelector('[data-pay-clear]').onclick=()=>{delete choices[cycle];draw();change();};
        }
        draw();
        return {cycle(value){cycle=value;draw();},value(){
            const rule=choices[cycle];
            if(!PayCalendar.valid(cycle,rule))return null;
            const same=cycle===initialCycle && saved?.day===rule.day && saved?.month===rule.month;
            return {...rule,from:same&&saved.from?saved.from:today()};
        }};
    }
    function terms(main, employee, old) {
        const cycle=old?.cycle || 'monthly', year=Number(today().slice(0,4)), original=revision(employee.id);
        const currency=old?.currency || CurrencyCatalog.primary();
        main.innerHTML=layout('<form>'+field('الراتب عن الفترة ('+currency+')',moneyInput('pay-gross',old?.gross))+
            field('فترة الاستحقاق','<select id="pay-cycle">'+Object.entries(frequency).map(([k,v])=>'<option value="'+k+'" '+(k===cycle?'selected':'')+'>'+v+'</option>').join('')+'</select>')+
            '<div id="pay-posting-picker"></div>'+field('عدد أيام العمل','<input type="number" id="pay-days" min="1" step="1" max="'+maxDays(cycle,year)+'" required value="'+esc(old?.days??'')+'">')+saveBar()+'</form>');
        const select=main.querySelector('#pay-cycle'), days=main.querySelector('#pay-days');
        const picker=postingPicker(main.querySelector('#pay-posting-picker'),cycle,old?.postingSchedule);
        select.onchange=()=>{days.max=maxDays(select.value,year);picker.cycle(select.value);};
        bindForm(main,async(fromButton)=>{
            if(revision(employee.id)!==original)throw Error('تغيّر سجل الموظف. افتح الصفحة من جديد');
            const raw=Number(main.querySelector('#pay-gross').value);
            const gross=Accounting.round(raw,currency);
            if(!Number.isFinite(raw)||gross<=0||gross>1e15)throw Error('أدخل راتباً موجباً صحيحاً');
            if(!Number.isInteger(days.valueAsNumber)||days.valueAsNumber<1||days.valueAsNumber>maxDays(select.value,year))throw Error('عدد أيام العمل يتجاوز حدود الفترة');
            const saved=await persist('payrollStaff',{...old,id:employee.id,name:employee.name,cycle:select.value,days:days.valueAsNumber,gross,currency,postingSchedule:picker.value(),updatedAt:new Date().toISOString()});
            if(saved&&fromButton&&main.contains(select))cancel();return saved;
        });
    }
    function operations(main, employee, kind, params, profile) {
        const employeeRows=payRows(employee.id), owners=allocations(employeeRows);
        const history=employeeRows.filter(x=>x.payroll.kind===kind).sort((a,b)=>b.date.localeCompare(a.date));
        const old=params.recordId?history.find(x=>x.id===params.recordId):null;
        const list=()=>'<div class="pay-list">'+history.filter(x=>kind!=='advance'||!owners.has(x.id)).map(x=>button(x.date+' · '+Accounting.format(x.amount,x.currency)+' · تعديل','data-edit="'+esc(x.id)+'"')).join('')+'</div>';
        const openEdits=()=>main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>go({...params,recordId:b.dataset.edit}));
        if(kind==='salary'&&!old&&!profile?.cycle){
            main.innerHTML=layout('<p>حدّد الراتب وفترة الاستحقاق أولاً.</p>'+button('تحديد الراتب','data-terms')+list());
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
            const leave=leaveCharges(profile,employeeRows,date.value,terms,currency,old);
            return {start,end,gross,leave,...settlement(State.expenses.filter(a=>a.payroll?.kind!=='advance'||a.date<=date.value),employee.id,currency,start,end,gross,old?.id,leave.amount)};
        };
        const preview=()=>{
            if(kind!=='salary')return;
            const box=main.querySelector('#pay-calculation');
            try{const b=balance();
                const lines=[['راتب الفترة',b.gross],['الرصيد المرحّل',b.opening],['سلف الفترة',b.advances],['الأجر اليومي',b.leave.daily],['حسم الإجازات',b.leave.amount],['صافي المبلغ المستحق',b.net]];
                box.innerHTML='<p dir="ltr">'+b.start+' — '+b.end+'</p><p>عدد أيام الإجازة <b>'+b.leave.days+'</b></p>'+lines.map(([label,n])=>'<p>'+label+' <b>'+esc(Accounting.format(n,currency))+'</b></p>').join('');
                input.value=old?.amount??Math.max(0,b.net);
            }catch(e){box.textContent=e.message;input.value='';}
        };
        date.onchange=preview;preview();openEdits();
        const original=revision(employee.id);
        bindForm(main,async(fromButton)=>{
            if(revision(employee.id)!==original)throw Error('تغيّر سجل الموظف. افتح الصفحة من جديد');
            const raw=Number(input.value), amount=Accounting.round(raw,currency);
            if(!date.value || input.value.trim()===''||!Number.isFinite(raw)||amount<0||amount>1e15||(amount===0&&kind!=='salary'))throw Error('أدخل مبلغاً صحيحاً');
            const payroll={kind,employeeId:employee.id};
            if(kind==='salary'){
                const b=balance();
                const linked=employeeRows.filter(a=>a.payroll?.kind==='advance' && a.currency===currency &&
                    a.date<=date.value && (!owners.has(a.id)||owners.get(a.id)===old?.id));
                const receipts=linked.map(a=>({id:a.id,date:a.date,amount:a.amount,currency:a.currency}));
                Object.assign(payroll,{start:b.start,end:b.end,gross:b.gross,cycle:terms.cycle,days:terms.days,
                    leaveDeduction:b.leave.amount,leaveReceipts:b.leave.receipts,advanceIds:receipts.map(a=>a.id),advanceReceipts:receipts});
            }
            const id=old?.id||(kind==='salary'?'pay_'+employee.id+'_'+payroll.start:'exp_'+uid());
            const row={...old,id,amount,currency,category:categories[kind],date:date.value,note:employee.name,
                createdAt:old ? (old.createdAt || Accounting.expenseDateTime(old)) : new Date().toISOString(),
                exchangeRate:old?.exchangeRate||Number(State.settings.exchangeRate)||1,payroll,updatedAt:new Date().toISOString()};
            const saved=await persist('expenses',row,!old);
            if(saved&&fromButton&&main.contains(date)){if(old)cancel();else render(main,params);}
            return saved;
        });
    }
    function edit(row){go({section:row.payroll.kind,employeeId:row.payroll.employeeId,recordId:row.id});}
    return {render,edit,period,settlement,maxDays,allocations,description,leaveCharges};
})();
