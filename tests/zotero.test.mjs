import test from 'node:test';import assert from 'node:assert/strict';
import { ZoteroClient } from '../extension/lib/zotero.js';
const settings={user_id:'123',api_key:'testkeytestkeytestkey'};
const item=(i=1)=>({key:`ABCD${i}`,version:9,data:{itemType:'journalArticle',title:`A sufficiently long title ${i}`,date:'2024',creators:[{creatorType:'author',name:'J Smith'}]}});
const response=(data,headers={},status=200)=>new Response(status===304?null:JSON.stringify(data),{status,headers});
test('Zotero pagination reads beyond 100 and supplies credentials in headers only',async()=>{
  let calls=0;const client=new ZoteroClient(settings,async(url,options)=>{assert.ok(!url.includes(settings.api_key));assert.equal(options.headers['Zotero-API-Key'],settings.api_key);calls++;return response(calls===1?Array.from({length:100},(_,i)=>item(i)):[item(100)],{'Total-Results':'101','Last-Modified-Version':'9'});});
  const result=await client.library();assert.equal(result.items.length,101);assert.equal(calls,2);assert.equal(result.version,'9');
});
test('304 preserves known references and clears previous error',async()=>{
  const cache={items:[item()],version:'9',web_links_version:1,error:'offline',user_id:'123'};
  const c=new ZoteroClient(settings,async(u,o)=>{assert.equal(o.headers['If-Modified-Since-Version'],'9');return response(null,{},304);},cache);
  const r=await c.library();assert.equal(r.items.length,1);assert.equal(r.error,'');assert.ok(r.checked_at);
});
test('partial refresh or changing pagination versions never produces a replacement cache',async()=>{
  let calls=0;const c=new ZoteroClient(settings,async()=>response(Array.from({length:100},(_,i)=>item(i)),{'Last-Modified-Version':String(++calls),'Total-Results':'200'}));await assert.rejects(c.library(),/发生了变化/);
});
test('failed API and per-item writes do not report saved',async()=>{
  const denied=new ZoteroClient(settings,async()=>response({}, {},403));await assert.rejects(denied.library(),/拒绝访问/);
  let calls=0;const c=new ZoteroClient(settings,async()=>response(++calls===1?{}:{successful:{},failed:{0:{code:403,message:'No write permission'}}}));await assert.rejects(c.add({title:'Test',authors:'J Smith'},'ABCD2345'),/写入权限/);
});
test('429 and Backoff stop subsequent requests',async()=>{
  let calls=0;const c=new ZoteroClient(settings,async()=>{calls++;return response({}, {'Retry-After':'60'},429);});await assert.rejects(c.library(),/繁忙/);await assert.rejects(c.library(),/暂停/);assert.equal(calls,1);
});
test('basic save includes a stable item key and validates per-item success',async()=>{
  let calls=0;const c=new ZoteroClient(settings,async(url,opts)=>{calls++;if(calls===1)return response({itemType:'journalArticle',tags:[]});const saved=JSON.parse(opts.body)[0];assert.equal(saved.key,'ABCD2345');assert.equal(saved.version,0);assert.equal(saved.title,'Test article');assert.equal(opts.headers['Zotero-Write-Token'],undefined);return response({successful:{0:{key:'ABCD2345',data:saved}},failed:{}});});
  const saved=await c.add({title:'Test article',authors:'J Smith',year:'2024',doi:'',primary_url:'https://example.org'},'ABCD2345');assert.equal(saved.key,'ABCD2345');
});
