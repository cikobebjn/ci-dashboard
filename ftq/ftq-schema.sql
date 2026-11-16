-- FTQ Monitoring | Kobe Bojonegoro
-- Sumber: SAP sheet Data -> Resume; total GR/Reject; exclude B101 B401 B701
-- Jalankan sekali di Supabase SQL Editor. Aktifkan Integrations > Cron dahulu.

create table if not exists public.ftq_sap_rows (
    doc_key text primary key,
    month_key date not null,
    prod_date date not null,
    mat_doc text not null,
    mat_doc_year text not null,
    mat_doc_item text not null,
    plant text not null default '',
    prod_order text not null default '',
    material text not null default '',
    material_description text not null default '',
    material_group_desc text not null default '',
    order_type text not null default '',
    total_gr numeric(20,4) not null default 0,
    total_uu numeric(20,4) not null default 0,
    total_reject numeric(20,4) not null default 0,
    total_qi_24h numeric(20,4) not null default 0,
    source_ftq numeric(16,5),
    entry_date date,
    imported_at timestamptz not null default now(),
    constraint ftq_month_matches_date check (date_trunc('month', prod_date)::date = month_key)
);

create index if not exists ftq_rows_date_idx on public.ftq_sap_rows (prod_date);
create index if not exists ftq_rows_month_idx on public.ftq_sap_rows (month_key);
create index if not exists ftq_rows_month_material_idx on public.ftq_sap_rows (month_key, material);

create table if not exists public.ftq_action_notes (
    prod_date date primary key,
    issue text not null default '',
    root_cause text not null default '',
    corrective_action text not null default '',
    preventive_action text not null default '',
    updated_by uuid references auth.users(id) on delete set null,
    updated_at timestamptz not null default now()
);

create table if not exists public.ftq_admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    granted_at timestamptz not null default now()
);

-- Hanya tabel agregat dan catatan yang dapat dilihat publik. Data transaksi mentah terlindungi.
alter table public.ftq_sap_rows enable row level security;
alter table public.ftq_action_notes enable row level security;
alter table public.ftq_admins enable row level security;
revoke all on public.ftq_sap_rows from anon, authenticated;
revoke all on public.ftq_action_notes from anon, authenticated;
revoke all on public.ftq_admins from anon, authenticated;

grant select on public.ftq_action_notes to anon, authenticated;
drop policy if exists ftq_notes_read_only on public.ftq_action_notes;
create policy ftq_notes_read_only on public.ftq_action_notes
    for select to anon, authenticated using (true);

-- Perhitungan persis Pivot Resume: (SUM(Total GR)-SUM(Total Reject))/SUM(Total GR)
create or replace view public.ftq_daily_resume
with (security_barrier = true) as
select
    r.prod_date,
    date_trunc('month', r.prod_date)::date as month_key,
    count(*)::integer as doc_count,
    round(sum(r.total_gr),4) as total_gr,
    round(sum(r.total_reject),4) as total_reject,
    round(sum(r.total_qi_24h),4) as total_qi_24h,
    case when sum(r.total_gr) = 0 then null
         else round((sum(r.total_gr)-sum(r.total_reject))*100/sum(r.total_gr), 8)
    end as ftq_pct,
    max(r.imported_at) as last_imported_at
from public.ftq_sap_rows r
where r.order_type not in ('B101','B401','B701')
group by r.prod_date;

create or replace view public.ftq_reject_material_monthly
with (security_barrier = true) as
select
    r.month_key,
    r.material,
    r.material_description,
    r.material_group_desc,
    count(*)::integer as doc_count,
    round(sum(r.total_gr),4) as total_gr,
    round(sum(r.total_reject),4) as total_reject
from public.ftq_sap_rows r
where r.order_type not in ('B101','B401','B701')
group by r.month_key, r.material, r.material_description, r.material_group_desc;

grant select on public.ftq_daily_resume to anon, authenticated;
grant select on public.ftq_reject_material_monthly to anon, authenticated;

-- Validasi identitas admin melalui Auth. Jangan memberikan hak write ke anonymous.
create or replace function public.ftq_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
    select auth.uid() is not null
       and exists (select 1 from public.ftq_admins where user_id = auth.uid());
$$;
revoke all on function public.ftq_is_admin() from public;
grant execute on function public.ftq_is_admin() to authenticated;

-- Upload snapshot full MTD, dilakukan dalam satu transaksi Postgres.
-- Jika file gagal validasi, snapshot bulan lama tidak akan dihapus.
create or replace function public.ftq_replace_month(p_month date, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    v_count integer;
    v_min date;
    v_max date;
    v_cutoff date := ((now() at time zone 'Asia/Jakarta')::date - interval '1 year')::date;
begin
    if not public.ftq_is_admin() then
        raise exception 'Akses ditolak. Masuk dengan akun admin FTQ.' using errcode = '42501';
    end if;
    if p_month is null or p_month <> date_trunc('month', p_month)::date then
        raise exception 'p_month harus tanggal 1 pada bulan yang diimpor';
    end if;
    if p_month < date_trunc('month', v_cutoff)::date then
        raise exception 'Periode melewati retensi 1 tahun';
    end if;
    if p_month > date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date then
        raise exception 'Tidak boleh impor bulan mendatang';
    end if;
    if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
        raise exception 'File SAP tidak berisi baris data';
    end if;
    if jsonb_array_length(p_rows) > 50000 then
        raise exception 'Maksimal 50.000 baris per upload';
    end if;

    create temporary table ftq_stage (
      doc_key text primary key,
      prod_date date not null,
      mat_doc text not null,
      mat_doc_year text not null,
      mat_doc_item text not null,
      plant text not null,
      prod_order text not null,
      material text not null,
      material_description text not null,
      material_group_desc text not null,
      order_type text not null,
      total_gr numeric(20,4) not null,
      total_uu numeric(20,4) not null,
      total_reject numeric(20,4) not null,
      total_qi_24h numeric(20,4) not null,
      source_ftq numeric(16,5),
      entry_date date
    ) on commit drop;

    insert into pg_temp.ftq_stage (
      doc_key,prod_date,mat_doc,mat_doc_year,mat_doc_item,plant,prod_order,
      material,material_description,material_group_desc,order_type,
      total_gr,total_uu,total_reject,total_qi_24h,source_ftq,entry_date
    )
    select
      nullif(trim(v.doc_key),'') as doc_key,
      v.prod_date,
      coalesce(v.mat_doc,''),coalesce(v.mat_doc_year,''),
      coalesce(v.mat_doc_item,''),coalesce(v.plant,''),coalesce(v.prod_order,''),
      coalesce(v.material,''),coalesce(v.material_description,''),
      coalesce(v.material_group_desc,''),coalesce(v.order_type,''),
      coalesce(v.total_gr,0),coalesce(v.total_uu,0),
      coalesce(v.total_reject,0),coalesce(v.total_qi_24h,0),
      v.source_ftq,v.entry_date
    from jsonb_to_recordset(p_rows) as v (
      doc_key text,prod_date date,mat_doc text,mat_doc_year text,mat_doc_item text,
      plant text,prod_order text,material text,material_description text,
      material_group_desc text,order_type text,total_gr numeric,total_uu numeric,
      total_reject numeric,total_qi_24h numeric,source_ftq numeric,entry_date date
    );

    select count(*), min(prod_date), max(prod_date)
        into v_count, v_min, v_max from pg_temp.ftq_stage;
    if exists (select 1 from pg_temp.ftq_stage where prod_date < p_month or prod_date >= p_month + interval '1 month') then
        raise exception 'Tanggal produksi dalam SAP tidak seluruhnya berada di bulan yang dipilih';
    end if;
    if exists (select 1 from pg_temp.ftq_stage where prod_date < v_cutoff) then
        raise exception 'File memuat transaksi melewati retensi 1 tahun';
    end if;

    insert into public.ftq_sap_rows (
       doc_key,month_key,prod_date,mat_doc,mat_doc_year,mat_doc_item,plant,prod_order,
       material,material_description,material_group_desc,order_type,total_gr,total_uu,
       total_reject,total_qi_24h,source_ftq,entry_date,imported_at
    )
    select
       s.doc_key,p_month,s.prod_date,s.mat_doc,s.mat_doc_year,s.mat_doc_item,s.plant,
       s.prod_order,s.material,s.material_description,s.material_group_desc,s.order_type,
       s.total_gr,s.total_uu,s.total_reject,s.total_qi_24h,s.source_ftq,s.entry_date,now()
    from pg_temp.ftq_stage s
    on conflict (doc_key) do update set
       month_key = excluded.month_key,
       prod_date = excluded.prod_date,
       mat_doc = excluded.mat_doc,
       mat_doc_year = excluded.mat_doc_year,
       mat_doc_item = excluded.mat_doc_item,
       plant = excluded.plant,
       prod_order = excluded.prod_order,
       material = excluded.material,
       material_description = excluded.material_description,
       material_group_desc = excluded.material_group_desc,
       order_type = excluded.order_type,
       total_gr = excluded.total_gr,
       total_uu = excluded.total_uu,
       total_reject = excluded.total_reject,
       total_qi_24h = excluded.total_qi_24h,
       source_ftq = excluded.source_ftq,
       entry_date = excluded.entry_date,
       imported_at = excluded.imported_at;

    delete from public.ftq_sap_rows old
    where old.month_key = p_month
      and not exists (select 1 from pg_temp.ftq_stage s where s.doc_key = old.doc_key);

    -- Catatan admin sengaja tidak diubah saat import SAP.
    return jsonb_build_object('month',p_month,'rows',v_count,'first_date',v_min,'last_date',v_max);
end;
$$;
revoke all on function public.ftq_replace_month(date,jsonb) from public;
grant execute on function public.ftq_replace_month(date,jsonb) to authenticated;

create or replace function public.ftq_save_action(
    p_date date,p_issue text,p_root_cause text,p_corrective_action text,p_preventive_action text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cutoff date := ((now() at time zone 'Asia/Jakarta')::date - interval '1 year')::date;
begin
  if not public.ftq_is_admin() then
    raise exception 'Akses ditolak. Masuk dengan akun admin FTQ.' using errcode='42501';
  end if;
  if p_date is null or p_date < v_cutoff then
    raise exception 'Tanggal tidak tersedia dalam masa retensi';
  end if;
  if not exists (select 1 from public.ftq_sap_rows where prod_date = p_date
     and order_type not in ('B101','B401','B701')) then
    raise exception 'Tidak ada transaksi FTQ untuk tanggal yang dipilih';
  end if;
  if greatest(length(coalesce(p_issue,'')),length(coalesce(p_root_cause,'')),
     length(coalesce(p_corrective_action,'')),length(coalesce(p_preventive_action,''))) > 2000 then
    raise exception 'Setiap isian maksimal 2.000 karakter';
  end if;
  insert into public.ftq_action_notes
    (prod_date,issue,root_cause,corrective_action,preventive_action,updated_by,updated_at)
  values
    (p_date,trim(coalesce(p_issue,'')),trim(coalesce(p_root_cause,'')),
     trim(coalesce(p_corrective_action,'')),trim(coalesce(p_preventive_action,'')),auth.uid(),now())
  on conflict (prod_date) do update set
    issue = excluded.issue,
    root_cause = excluded.root_cause,
    corrective_action = excluded.corrective_action,
    preventive_action = excluded.preventive_action,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
  return jsonb_build_object('saved',true,'date',p_date);
end;
$$;
revoke all on function public.ftq_save_action(date,text,text,text,text) from public;
grant execute on function public.ftq_save_action(date,text,text,text,text) to authenticated;

-- Retensi rolling 1 tahun menurut tanggal produksi (Asia/Jakarta).
create or replace function public.ftq_purge_old_data()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_cutoff date := ((now() at time zone 'Asia/Jakarta')::date - interval '1 year')::date;
  v_rows integer;
  v_notes integer;
begin
  delete from public.ftq_sap_rows where prod_date < v_cutoff;
  get diagnostics v_rows = row_count;
  delete from public.ftq_action_notes where prod_date < v_cutoff;
  get diagnostics v_notes = row_count;
  return jsonb_build_object('cutoff',v_cutoff,'sap_deleted',v_rows,'notes_deleted',v_notes);
end;
$$;
revoke all on function public.ftq_purge_old_data() from public,anon,authenticated;

-- Jalankan pembersihan awal (boleh diulang via SQL Editor).
select public.ftq_purge_old_data();

-- Menggunakan Supabase Cron (pg_cron). Aktifkan modul di Integrations > Cron terlebih dahulu.
-- 17:15 UTC = 00:15 WIB pada hari berikutnya.
select cron.schedule(
    'ftq-retention-one-year',
    '15 17 * * *',
    $$select public.ftq_purge_old_data();$$
);

-- Penetapan admin, contoh setelah akun dibuat melalui Authentication > Users:
-- insert into public.ftq_admins (user_id)
-- select id from auth.users where email = 'email-admin@perusahaan.com'
-- on conflict (user_id) do nothing;

-- Pemeriksaan:
-- select jobname, schedule, active from cron.job where jobname='ftq-retention-one-year';
-- select * from public.ftq_daily_resume order by prod_date desc limit 30;
