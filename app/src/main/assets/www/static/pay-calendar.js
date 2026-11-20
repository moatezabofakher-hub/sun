/* Gregorian recurring wage dates in the device's local calendar. */
const PayCalendar = (() => {
    const weekdays = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const months = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
    const dayKey = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
    const limit = (y,m) => new Date(y,m,0,12).getDate();
    function valid(cycle,rule) {
        if(!rule || !Number.isInteger(rule.day))return false;
        if(cycle==='weekly')return rule.day>=0 && rule.day<=6;
        if(cycle==='monthly')return rule.day>=1 && rule.day<=31;
        return cycle==='yearly' && Number.isInteger(rule.month) && rule.month>=1 && rule.month<=12 &&
            rule.day>=1 && rule.day<=limit(2000,rule.month);
    }
    function due(rule,date) {
        if(!valid(rule.cycle,rule))return false;
        const key=dayKey(date);
        if(key<rule.from || (rule.paid||[]).some(([a,b])=>a<=key && key<=b))return false;
        if(rule.cycle==='weekly')return date.getDay()===rule.day;
        const month=date.getMonth()+1;
        return (rule.cycle==='monthly'||month===rule.month) && date.getDate()===Math.min(rule.day,limit(date.getFullYear(),month));
    }
    const id=(rule,key)=>'paydue:'+encodeURIComponent(rule.profile)+':'+encodeURIComponent(rule.id)+':'+key;
    function rules(data,profile) {
        const staff=(data?.payrollStaff||[]).filter(s=>valid(s.cycle,s.postingSchedule));
        if(!staff.length)return [];
        const paid=new Map();
        for(const row of data?.expenses||[]){
            const p=row.payroll;
            if(p?.kind!=='salary')continue;
            if(!paid.has(p.employeeId))paid.set(p.employeeId,[]);
            paid.get(p.employeeId).push([p.start,p.end]);
        }
        return staff.map(s=>({
            id:s.id,profile,name:s.name,company:data.settings?.companyName||'',cycle:s.cycle,
            day:s.postingSchedule.day,month:s.postingSchedule.month||0,from:s.postingSchedule.from,
            paid:paid.get(s.id)||[]
        }));
    }
    return {weekdays,months,dayKey,limit,valid,due,id,rules};
})();
if(typeof module!=='undefined' && module.exports)module.exports=PayCalendar;
