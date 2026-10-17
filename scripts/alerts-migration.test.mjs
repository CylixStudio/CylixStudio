// Local PostgreSQL/WASM verification only. No network or production connection.
// Setup: npm install --prefix tmp/alerts-sql-qa --no-save --no-package-lock @electric-sql/pglite
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {randomUUID} from "node:crypto";
const {PGlite}=await import("../tmp/alerts-sql-qa/node_modules/@electric-sql/pglite/dist/index.js");
test("Alerts migrations: queue, idempotency, claims, ACK ownership, RLS and private storage",async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.qa_admins(id uuid primary key);
 create function public.is_admin(_user_id uuid) returns boolean language sql security definer as $$ select exists(select 1 from public.qa_admins where id=_user_id) $$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
 grant usage on schema auth,public,storage to anon,authenticated,service_role;
 `);
 const migrations=fs.readdirSync("supabase/migrations").filter(x=>/^20261017230[0-4]00_alerts_/.test(x)).sort();
 assert.equal(migrations.length,5);
 for(const name of migrations)await db.exec(fs.readFileSync("supabase/migrations/"+name,"utf8"));
 const a=randomUUID(),b=randomUUID(),viewer=randomUUID(),display=randomUUID(),other=randomUUID();
 for(const id of [a,b,viewer])await db.query("insert into auth.users values($1)",[id]);
 await db.query("insert into qa_admins values($1)",[a]);
 for(const [i,id] of [a,b].entries())await db.query("insert into alerts_studios(owner_id,overlay_token,overlay_token_hash) values($1,$2,$3)",[id,"alerts-"+String(i+1).repeat(64),String(i+1).repeat(64)]);
 const event=(count)=>({id:randomUUID(),alertId:"gift",count,config:{durationMs:1000,delayMs:0}});
 const one=event(1);
 const enqueue=async(owner,key,e)=>(await db.query("select alerts_enqueue($1,$2,$3::jsonb) as result",[owner,key,JSON.stringify(e)])).rows[0].result;
 assert.equal((await enqueue(a,"gift1",one)).queued,true);
 assert.equal((await enqueue(a,"gift1",event(99))).duplicate,true);
 assert.equal((await db.query("select count(*)::int as n from alerts_queue where owner_id=$1",[a])).rows[0].n,1);
 await enqueue(a,"gift25",event(25));
 await db.query("select alerts_control($1,'pause')",[a]);
 assert.equal((await db.query("select alerts_claim($1,$2) as c",[a,display])).rows[0].c.status,"paused");
 await db.query("select alerts_control($1,'resume')",[a]);
 const c=(await db.query("select alerts_claim($1,$2) as c",[a,display])).rows[0].c;
 assert.equal(c.status,"granted");assert.equal(c.event.count,1);
 assert.equal((await db.query("select alerts_claim($1,$2) as c",[a,other])).rows[0].c.status,"standby");
 const ack=async(owner,d,receipt)=>(await db.query("select alerts_ack($1,$2,$3,$4) as ok",[owner,c.event.id,d,receipt])).rows[0].ok;
 assert.equal(await ack(b,display,c.claimId),false);
 assert.equal(await ack(a,other,c.claimId),false);
 assert.equal(await ack(a,display,randomUUID()),false);
 assert.equal(await ack(a,display,c.claimId),true);
 assert.equal(await ack(a,display,c.claimId),false);
 const multi=(await db.query("select alerts_claim($1,$2) as c",[a,display])).rows[0].c;
 assert.equal(multi.event.count,25);
 await enqueue(a,"queued",event(4));await db.query("select alerts_control($1,'clear')",[a]);
 assert.equal((await db.query("select status from alerts_queue where id=$1",[multi.event.id])).rows[0].status,"claimed");
 await db.query("select alerts_control($1,'skip')",[a]);
 assert.equal((await db.query("select alerts_claim($1,$2) as c",[a,display])).rows[0].c.status,"empty");
 assert.equal((await db.query("select public from storage.buckets where id='alert-media'")).rows[0].public,false);
 await db.exec("set role authenticated");
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[viewer]);
 assert.equal((await db.query("select * from alerts_studios")).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 assert.equal((await db.query("select * from alerts_studios")).rows.length,1);
 await assert.rejects(db.query("select alerts_claim($1,$2)",[a,display]),/permission denied/);
 await assert.rejects(db.query("update alerts_studios set settings='{}'"),/permission denied/);
 await db.exec("reset role;set role anon");
 await assert.rejects(db.query("select * from alerts_studios"),/permission denied/);
 await db.exec("reset role");
 console.log("Applied five migrations locally; verified 1/25 gifts, duplicate suppression, pause/resume/clear/skip, token receipt isolation, admin RLS and private bucket.");
 }finally{await db.close();}
});
