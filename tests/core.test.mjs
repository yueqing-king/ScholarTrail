import test from 'node:test';
import assert from 'node:assert/strict';
import { blankDB, createProject, changeProject, recordClick, editRecord, paperData, findMatch, matchScore, zoteroPaper, safeURL } from '../extension/lib/core.js';
const paper = { title: 'The social credit system and digital governance', authors: 'R Creemers, S Smith', year: '2024', primary_url: 'https://example.org/paper/1', external_ids: ['scholar:cid:paper1'] };
test('AC01 create, rename, switch, archive and restore projects', () => {
  const db = blankDB(), a = createProject(db,'Social Credit'), b = createProject(db,'AI');
  changeProject(db,'switch',a.id); assert.equal(db.active_project_id,a.id);
  changeProject(db,'rename',a.id,'Governance'); assert.equal(a.name,'Governance');
  changeProject(db,'archive',a.id); assert.equal(db.active_project_id,b.id);
  assert.throws(() => changeProject(db,'switch',a.id));
  changeProject(db,'restore',a.id); assert.equal(a.archived_at,null);
});
test('AC02/03 explicit click stores query, timestamps, metadata, and project', () => {
  const db = blankDB(), a = createProject(db,'Research'); assert.equal(db.papers.length,0);
  const r = recordClick(db,paper,a.id,{search_query:'digital governance',source_url:'https://scholar.google.com/scholar?q=digital'});
  assert.equal(db.encounters.length,1); assert.equal(db.encounters[0].search_query,'digital governance');
  assert.equal(db.encounters[0].project_id,a.id); assert.equal(r.record.first_clicked_at,r.record.last_clicked_at); assert.equal(r.record.not_relevant,false);
});
test('AC04 re-encounter uses identity, merges aliases, and keeps first clicked', () => {
  const db=blankDB(),a=createProject(db,'A'),first=recordClick(db,paper,a.id),time=first.record.first_clicked_at;
  const second=recordClick(db,{...paper,external_ids:['scholar:cid:paper1','scholar:cluster:123']},a.id);
  assert.equal(first.paper.id,second.paper.id);assert.equal(db.papers.length,1);assert.equal(db.encounters.length,2);assert.equal(second.record.first_clicked_at,time);assert.equal(second.paper.external_ids.length,2);
});
test('AC06 note add, edit, delete are independent of Zotero', () => {
  const db=blankDB(),a=createProject(db,'A'),{paper:p}=recordClick(db,paper,a.id);
  editRecord(db,a.id,p.id,{note:'Useful'});assert.equal(db.project_papers[0].note,'Useful');
  editRecord(db,a.id,p.id,{note:'Changed'});assert.equal(db.project_papers[0].note,'Changed');
  editRecord(db,a.id,p.id,{note:''});assert.equal(db.project_papers[0].note,'');
});
test('AC07–10 exclusion + undo preserve notes/history and isolate projects', () => {
  const db=blankDB(),a=createProject(db,'A'),b=createProject(db,'B');
  const {paper:p,record:r}=recordClick(db,paper,a.id);recordClick(db,paper,b.id);
  editRecord(db,a.id,p.id,{note:'Keep this thought',not_relevant:true});
  assert.equal(db.project_papers.find(x=>x.project_id===b.id).not_relevant,false);
  assert.equal(db.project_papers.find(x=>x.project_id===b.id).note,'');
  const encounters=JSON.stringify(db.encounters),first=r.first_clicked_at;
  editRecord(db,a.id,p.id,{not_relevant:false});assert.equal(r.note,'Keep this thought');assert.equal(r.first_clicked_at,first);assert.equal(JSON.stringify(db.encounters),encounters);assert.equal(r.not_relevant_at,null);
});
test('deleting a project does not delete a shared paper or another project note', () => {
  const db=blankDB(),a=createProject(db,'A'),b=createProject(db,'B'),{paper:p}=recordClick(db,paper,a.id);recordClick(db,paper,b.id);editRecord(db,b.id,p.id,{note:'B note'});
  changeProject(db,'delete',a.id);assert.equal(db.papers.length,1);assert.equal(db.encounters.length,1);assert.equal(db.project_papers[0].note,'B note');
  changeProject(db,'delete',b.id);assert.equal(db.papers.length,0);assert.equal(db.active_project_id,null);
});
test('identity: conflicting DOI cannot inherit a decision even with the same Scholar ID', () => {
  const a=paperData({...paper,doi:'10.1000/one'}),b=paperData({...paper,doi:'10.1000/two'});assert.equal(matchScore(a,b),0);assert.equal(findMatch([a],b),null);
});
test('identity: title alone / shared URL / different year or author are not enough', () => {
  const p=paperData({...paper,external_ids:[]});
  for(const overrides of [{authors:''},{year:''},{year:'2023'},{authors:'A Creemers'}]) assert.equal(matchScore(p,paperData({...paper,external_ids:[],...overrides})),0);
});
test('identity: DOI wins over title variations; ambiguous weak matches return nothing', () => {
  const a=paperData({...paper,doi:'https://doi.org/10.1000/ABC'}),b=paperData({...paper,title:'A completely different title',doi:'10.1000/abc'});assert.equal(matchScore(a,b),100);
  const p=paperData(paper);assert.equal(findMatch([{...p,id:'1'},{...p,id:'2'}],p),null);
});
test('Zotero: recognize full first names against Scholar initials, ignore attachments', () => {
  const z=zoteroPaper({key:'ABCD2345',data:{itemType:'journalArticle',title:paper.title,date:'2024-01-01',creators:[{creatorType:'author',firstName:'Rogier',lastName:'Creemers'}]}});
  assert.equal(matchScore(paperData(paper),z),70);assert.equal(z.key,'ABCD2345');assert.equal(zoteroPaper({data:{itemType:'attachment',title:paper.title}}),null);
});
test('input safety and invalid/archived writes', () => {
  assert.equal(safeURL('javascript:alert(1)'),'');assert.equal(safeURL('file:///etc/passwd'),'');
  const db=blankDB(),a=createProject(db,'A');assert.throws(()=>createProject(db,'a'));assert.throws(()=>editRecord(db,a.id,'none',{note:'x'}));
  changeProject(db,'archive',a.id);assert.throws(()=>recordClick(db,paper,a.id));assert.throws(()=>paperData({title:''}));
});
