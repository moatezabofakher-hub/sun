const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const m=path.join(__dirname,'../app/src/main/assets/www/static');
const a=path.join(__dirname,'../field_agent/src/main/assets/www/static');
for(const [label,root,file] of [['الرئيسي',m,'tiqany-ux-3588.js'],['الموظف',a,'agent-ux-3588.js']]){
 const code=fs.readFileSync(path.join(root,file),'utf8'); const css=fs.readFileSync(path.join(root,'tiqany-ux-3588.css'),'utf8');
 test(label+' no regular-screen close button is injected',()=>{assert.doesNotMatch(code,/function (addPageExit|pageX)\(/);assert.match(code,/function removeLegacyPageExit/);assert.match(css,/\.ta-page-exit-line\{display:none!important\}/);});
 test(label+' popup close X remains in upper-right',()=>{assert.match(css,/\.ta-ux-popup-frame>\.ta-close3d\{position:absolute!important;top:6px!important;right:7px!important;left:auto!important/);assert.match(code,/(box|card)\.prepend\(existing\)/);});
}
