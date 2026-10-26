begin;
insert into auth.users(id) values('10000000-1111-4111-8111-000000000001'),('10000000-1111-4111-8111-000000000002'),('10000000-1111-4111-8111-000000000003');
insert into public.archive_members values('10000000-1111-4111-8111-000000000001','upload_test_admin'),('10000000-1111-4111-8111-000000000002','upload_test_contributor'),('10000000-1111-4111-8111-000000000003','upload_test_listener');
insert into public.archive_upload_roles values('10000000-1111-4111-8111-000000000001','admin'),('10000000-1111-4111-8111-000000000002','contributor');
select public.reserve_archive_submission('10000000-1111-4111-8111-000000000002','20000000-1111-4111-8111-000000000001','test.mp3','Test',2000,repeat('a',64),'');
-- Retry reuses one record, even with another request ID.
select public.reserve_archive_submission('10000000-1111-4111-8111-000000000002','20000000-1111-4111-8111-000000000002','test.mp3','Test',2000,repeat('a',64),'');
do $$ begin
 if (select count(*) from public.archive_submissions where sha256=repeat('a',64))<>1 then raise exception 'Retry duplicated upload'; end if;
 begin
 perform public.reserve_archive_submission('10000000-1111-4111-8111-000000000003',gen_random_uuid(),'test.mp3','Test',2000,repeat('b',64),'');
 raise exception 'Listener was allowed to upload';
 exception when others then if sqlerrm='Listener was allowed to upload' then raise; end if; end;
 begin
 perform public.begin_archive_publish('10000000-1111-4111-8111-000000000002','20000000-1111-4111-8111-000000000001','Test');
 raise exception 'Contributor was allowed to publish';
 exception when others then if sqlerrm='Contributor was allowed to publish' then raise; end if; end;
 begin
 perform public.begin_archive_publish('10000000-1111-4111-8111-000000000001','20000000-1111-4111-8111-000000000001','Test');
 raise exception 'Unchecked audio was allowed to publish';
 exception when others then if sqlerrm='Unchecked audio was allowed to publish' then raise; end if; end;
end $$;
update public.archive_submissions set status='pending',duration=3 where id='20000000-1111-4111-8111-000000000001';
select public.begin_archive_publish('10000000-1111-4111-8111-000000000001','20000000-1111-4111-8111-000000000001','Reviewed test');
select public.begin_archive_publish('10000000-1111-4111-8111-000000000001','20000000-1111-4111-8111-000000000001','Reviewed test');
select public.finish_archive_publish('10000000-1111-4111-8111-000000000001','20000000-1111-4111-8111-000000000001');
select public.finish_archive_publish('10000000-1111-4111-8111-000000000001','20000000-1111-4111-8111-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-1111-4111-8111-000000000003',true);
do $$ begin
 if exists(select 1 from public.archive_submissions) then raise exception 'Listener can read submissions'; end if;
 if exists(select 1 from public.archive_upload_roles) then raise exception 'Listener can read roles'; end if;
 if has_function_privilege('authenticated','public.begin_archive_publish(uuid,uuid,text)','execute') then raise exception 'Client can bypass publication checks'; end if;
 if has_table_privilege('authenticated','public.archive_submissions','insert,update,delete') then raise exception 'Client has write privileges'; end if;
end $$;
reset role;
rollback;
