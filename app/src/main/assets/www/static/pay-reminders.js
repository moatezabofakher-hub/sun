const PayReminders = (() => {
    let installed=false, lastSnapshot='', generation=0, timer=0, retryNative=false;
    const center=()=>typeof StockNotifications!=='undefined'?StockNotifications:ManagerNotifications;
    const current=()=>ProfileManager.activeId;
    function recordDue(now=new Date()) {
        if (!ProfileManager.registry || now.getHours()<9) return false;
        const list=center().ensure().entries, at=now.toISOString(), key=PayCalendar.dayKey(now);
        const known=new Set(list.map(e=>e.id));
        const added=[];
        for(const r of PayCalendar.rules(State,current())){
            if(!PayCalendar.due(r,now))continue;
            const id=PayCalendar.id(r,key);
            if(known.has(id))continue;
            known.add(id);
            const entry={id,type:'payroll',target:'payroll',targetId:r.id,at,read:false,
                title:'تذكير بترحيل الأجر',detail:'حان موعد ترحيل أجر '+r.name+' · '+key};
            list.unshift(entry);added.push(entry);
        }
        if(added.length)center().updateBadge();
        return added;
    }
    function open(id) {
        const parts=id.split(':');
        if(parts.length!==4)return;
        if(parts[1]!==encodeURIComponent(current()))return UI.toast('افتح حساب الشركة المرتبط بهذا التذكير','info');
        const employee=State.payrollStaff?.find(s=>encodeURIComponent(s.id)===parts[2]);
        if(!employee)return UI.toast('لم يعد إعداد الراتب متاحاً','info');
        AppNav.navigate('payroll',{section:'salary',employeeId:employee.id});
    }
    // Read committed records. Inactive company schedules stay available after a profile switch.
    const inactive=new Map();
    async function refresh(){
        const revision=++generation,registry=ProfileManager.registry;
        if(!registry||!StorageEngine.db)return;
        const profile=current(), root=window.AndroidAlerts?.setPayrollSchedules?window.AndroidAlerts:window.WindowsDesktop;
        if(!root?.setPayrollSchedules)return;
        const active=PayCalendar.rules(State,profile),live=new Set(registry.profiles.map(p=>p.id));
        inactive.set(profile,active);
        for(const id of inactive.keys())if(!live.has(id))inactive.delete(id);
        const lists=await Promise.all(registry.profiles.map(async p=>{
            if(inactive.has(p.id))return inactive.get(p.id);
            const record=await ProfileManager.getRecord('profile:'+p.id);
            const rows=PayCalendar.rules(record?.data,p.id);
            if(revision===generation)inactive.set(p.id,rows);
            return rows;
        }));
        if(revision!==generation || profile!==current())return;
        const text=JSON.stringify(lists.flat());
        if(text!==lastSnapshot||retryNative){
            try{await root.setPayrollSchedules(text);if(revision===generation){lastSnapshot=text;retryNative=false;}}
            catch{retryNative=true;}
        }
    }
    function afterCommit(){clearTimeout(timer);timer=setTimeout(()=>refresh().catch(()=>{retryNative=true;}),80);}
    function check(){
        if(!ProfileManager.registry)return;
        const added=recordDue(new Date());
        if(added?.length){
            const ledger=center().ensure();
            StorageEngine.saveState().catch(()=>{
                ledger.entries=ledger.entries.filter(entry=>!added.includes(entry));
                center().updateBadge();
            });
        }
        afterCommit();
    }
    function start(){
        if(!installed){
            installed=true;
            document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
            window.addEventListener('focus',check);
            setInterval(check,60000);
        }
        check();
    }
    return {recordDue,open,afterCommit,start};
})();
