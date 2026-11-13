'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync('app/src/main/assets/www/index.html','utf8');
const src=html.slice(html.indexOf('        const AppNav = {'),html.indexOf('        // Native Android printer bridge events:'));
assert(src.startsWith('        const AppNav = {'));
const field=fs.readFileSync('app/src/main/assets/www/static/field-main.js','utf8');
assert(field.includes("if(count && typeof AppNav!=='undefined') AppNav.refreshAfterSync?.();"),'LAN must refresh the visible screen');
assert(field.includes("this.staged=null;UI.forceCloseModal();UI.toast('تم استلام وترحيل"),'file approval remains');
assert(field.includes("if(typeof AppNav!=='undefined')AppNav.refreshAfterSync?.();"),'file sync must refresh');
const notify=fs.readFileSync('app/src/main/assets/www/static/manager-notifications.js','utf8');
assert(notify.includes("if(created.length && AppNav.current().screen==='notifications')AppNav.refreshAfterSync?.();"));
assert(html.includes('#screenSubtitle, .ta-dashboard .ta-section-head p, .ta-dashboard .ta-card-description {display:none!important;}'));
assert(html.includes('ta-exit-stay')&&html.includes('ta-exit-leave'));
assert(html.includes('onclick="UI.closeExitDialog()"')&&html.includes('onclick="UI.confirmExitAction()"'));
const timer=[];let renders=0;const calls=[];
let isModalHidden=true;let editingFocused=false;
const filterBefore={id:'invoiceSearchInput',value:'جلي',tagName:'INPUT',hasAttribute:()=>true};
const filterAfter={id:'invoiceSearchInput',value:'',tagName:'INPUT',dispatchEvent:(e)=>calls.push(['filter',e.type,filterAfter.value])};
const main={scrollTop:120,contains:(el)=>el===filterBefore,querySelectorAll:()=>[filterBefore]};
const modal={classList:{contains:(cls)=>cls==='hidden'&&isModalHidden}};
const dialog={classList:{contains:(cls)=>cls==='hidden'}};
const nodes={mainContent:main,modalContainer:modal,dialogContainer:dialog,invoiceSearchInput:filterBefore};
const doc={getElementById:(id)=>nodes[id]||null,get activeElement(){return editingFocused?filterBefore:null;},scrollingElement:{scrollTop:300}};
const ctx={console,window:{scrollY:300,scrollTo:(x,y)=>calls.push(['scroll',x,y])},document:doc,
  setTimeout:(fn,ms)=>{timer.push(fn);return timer.length;},requestAnimationFrame:(fn)=>fn(),
  Event:class{constructor(type){this.type=type;}},
  Views:{render:(screen,params)=>{assert.equal(screen,'invoices_list');assert.equal(params.dateMode,'month');renders++;nodes.invoiceSearchInput=filterAfter;}},
  ManagerNotifications:{updateBadge:()=>calls.push(['badge'])},UI:{toast:()=>{}}};
vm.createContext(ctx);vm.runInContext(src+';globalThis.appNav=AppNav;',ctx);
const nav=ctx.appNav;
nav.stack=[{screen:'invoices_list',params:{dateMode:'month',type:'sale'}}];
nav.refreshAfterSync();nav.refreshAfterSync();assert.equal(timer.length,1,'coalesce consecutive sync packets');
timer.shift()();assert.equal(renders,1);assert.equal(nav.pendingSyncRefresh,false);
assert.equal(filterAfter.value,'جلي');assert(calls.some(x=>x[0]==='filter'&&x[2]==='جلي'));
assert(calls.some(x=>x[0]==='scroll'&&x[2]===300));
// Do not replace an open operation or a modal even if a packet arrives.
nav.stack=[{screen:'invoice_form',params:{type:'sale'}}];nav.refreshAfterSync();timer.shift()();assert.equal(renders,1);
nav.stack=[{screen:'invoices_list',params:{dateMode:'month'}}];isModalHidden=false;timer.shift()();assert.equal(renders,1);
isModalHidden=true;editingFocused=true;timer.shift()();assert.equal(renders,1);
editingFocused=false;timer.shift()();assert.equal(renders,2,'refresh once it is safe');
assert.equal(nav.pendingSyncRefresh,false);
console.log('PASS 3.5.48 live sync refresh coalescing, preserved route/search/scroll, protected editing, compact exit dialog');
