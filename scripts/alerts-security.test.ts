import assert from "node:assert/strict";
import test from "node:test";
import {authorizeAlertRequest,AlertHttpError,boundedBody,alertJson} from "../src/lib/alertAccess.server.ts";
import {ALERT_CATALOG,selectableAlert,normalizeConfig,normalizeAlertMediaUrl,inspectUpload,FREE_MEDIA_BYTES,PRO_MEDIA_BYTES} from "../src/lib/alertStudio.ts";
const request=(headers={})=>new Request("https://studio.example/api/alerts",{headers});
const bearer={authorization:"Bearer a.b.c"};
const deps=(admin)=>({verify:async()=> "actor",admin:async()=>admin,owner:async()=>"granted-owner"});
test("guest and forged identity fail closed; Free/Pro without real admin are denied",async()=>{
 await assert.rejects(authorizeAlertRequest(request(),deps(true)),e=>e instanceof AlertHttpError&&e.status===401);
 await assert.rejects(authorizeAlertRequest(request(bearer),{...deps(true),verify:async()=>null}),e=>e.status===401);
 for(const plan of ["free","pro"])await assert.rejects(authorizeAlertRequest(request({...bearer,"x-plan":plan,"x-is-admin":"true"}),deps(false)),e=>e.status===403);
 assert.deepEqual(await authorizeAlertRequest(request(bearer),deps(true)),{actorId:"actor",ownerId:"granted-owner"});
 await assert.rejects(authorizeAlertRequest(new Request("https://studio.example/api/alerts",{method:"POST",headers:{...bearer,origin:"https://evil.example"}}),deps(true)),e=>e.status===403);
});
test("body validation enforces size without trusting content-length",async()=>{
 await assert.rejects(boundedBody(new Request("https://studio.example/api/alerts",{method:"POST",body:"x".repeat(33)}),32),e=>e.status===413);
 await assert.rejects(alertJson(new Request("https://studio.example/api/alerts",{method:"POST",headers:{"content-type":"application/json"},body:"[]"})),e=>e.status===400);
});
test("archived types remain stored but cannot be selected; slots and URL sources validate",()=>{
 const catalog=(platform)=>ALERT_CATALOG.filter(x=>selectableAlert(x,platform)).map(x=>x.id);
 assert.deepEqual(catalog("KICK"),["follow","subscription","resubscription","gift","raid","kicks"]);
 assert.ok(catalog("TWITCH").includes("cheer"));assert.equal(catalog("TWITCH").includes("kicks"),false);
 assert.equal(normalizeAlertMediaUrl("https://127.0.0.1/a.png","visual"),"");
 assert.equal(normalizeAlertMediaUrl("https://public.example/a.wav","audio"),"https://public.example/a.wav");
 const png=new Uint8Array(FREE_MEDIA_BYTES+1);png.set([0x89,0x50,0x4e,0x47]);
 assert.equal(inspectUpload(png,"a.png","visual","free").ok,false);
 assert.equal(inspectUpload(png,"a.png","visual","pro").ok,true);
 const huge=new Uint8Array(PRO_MEDIA_BYTES+1);huge.set(png.subarray(0,4));
 assert.equal(inspectUpload(huge,"a.png","visual","pro").ok,false);
 assert.equal(inspectUpload(new TextEncoder().encode("<html>"),"a.png","visual","pro").ok,false);
 const def=ALERT_CATALOG.find(x=>x.id==="gift");
 const saved=normalizeConfig({message:"custom {count}",visualSource:"none",audioSource:"url",audioUrl:"https://public.example/a.wav"},def);
 assert.deepEqual(normalizeConfig(JSON.parse(JSON.stringify(saved)),def),saved);
});
