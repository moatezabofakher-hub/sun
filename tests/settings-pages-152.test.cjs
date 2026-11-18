'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test');
const root=path.resolve(__dirname,'..');
const manager=path.join(root,'app/src/main/assets/www/static/ta-settings-pages-152.js');
const agent=path.join(root,'field_agent/src/main/assets/www/static/ta-agent-settings-pages-152.js');
const agentHtml=path.join(root,'field_agent/src/main/assets/www/index.html');
test('v152 standalone manager settings page JavaScript parses safely',()=>{
 const s=fs.readFileSync(manager,'utf8');
 new vm.Script(s,{filename:manager});
 assert.match(s,/function discard\(\)/);
 assert.match(s,/draft\.cancel\(key\)/);
 assert.match(s,/draft\.discardSilently/);
 assert.match(s,/confirmExit/);
 assert.match(s,/if\(!hasChanges\(\)\)/);
});
test('v152 Back and dock navigation require Save, Continue Editing or Discard',()=>{
 const s=fs.readFileSync(manager,'utf8');
 for(const mark of ['UI.showUnsavedDialog','AppNav.handleBackButton=function','AppNav.navigate=function','draft.save(key)','modal','data'])assert.ok(s.includes(mark),mark);
 assert.ok(s.includes('isActive()'),'saved guard should not silently close after failed save');
});
test('Employee settings use standalone views and protect unsaved POS and print width',()=>{
 const s=fs.readFileSync(agent,'utf8'),html=fs.readFileSync(agentHtml,'utf8');
 new vm.Script(s,{filename:agent});
 for(const mark of ['taAgentSettingsDecision','AgentSettingsPages152','Agent.goBack=function','Agent.navigate=function','Agent.savePosSettings()','Agent.updatePrinterWidth(width)','هل تريد حفظ التغييرات قبل الخروج؟','data-answer="discard"'])assert.ok(s.includes(mark),mark);
 assert.match(html,/ta-agent-settings-pages-152\.js/);
 assert.match(html,/ta-agent-settings-pages-152\.css/);
 assert.doesNotMatch(s,/State\.shareholderMovements\s*=/);
 assert.doesNotMatch(s,/State\.capitalMovements\s*=/);
});

test('Employee new invoices default percentage adjustments to currency amounts and label effective pricing',()=>{
 const pathAgent=path.join(root,'field_agent/src/main/assets/www/static/agent-invoice-parity.js');
 const source=fs.readFileSync(pathAgent,'utf8');
 assert.match(source,/taxType:'amount'/);
 assert.match(source,/taxType:m\.taxType\|\|'amount'/);
 assert.match(source,/effectivePricingLabel/);
 assert.match(source,/Agent\.changeRowUnit|A\.changeRowUnit/);
});
