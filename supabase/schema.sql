-- 親が自分の端末を使う構成で必要になる。
-- 子ども専用端末だけで完結させる場合は、これを実行しなくても最後まで遊べる。
--
-- 小 2 にログインさせたくないので認証は置かない。
-- 代わりに「家族の合言葉」をリクエストヘッダ x-family-code で送り、RLS でその行だけに絞る。
-- anon キーは公開されるものなので、分離は必ずこのポリシー側で行うこと。
-- 合言葉は推測されにくい長い文字列にすること（例: 32 文字のランダム）。

-- リクエストヘッダから合言葉を取り出す。未指定なら null を返し、どの行にも一致しない。
create or replace function public.request_family_code()
returns text
language sql
stable
as $$
  select nullif(
    current_setting('request.headers', true)::json ->> 'x-family-code',
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- 記録
-- ---------------------------------------------------------------------------

create table if not exists public.runs (
  id          text primary key,
  family_code text        not null,
  who         text        not null check (who in ('child', 'parent')),
  stage       text        not null,
  total_ms    integer     not null,
  correct     integer     not null,
  total       integer     not null,
  at          timestamptz not null,
  facts       jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists runs_family_at_idx on public.runs (family_code, at desc);

alter table public.runs enable row level security;

drop policy if exists "read own family runs" on public.runs;
create policy "read own family runs"
  on public.runs for select
  to anon
  using (family_code = public.request_family_code());

drop policy if exists "insert own family runs" on public.runs;
create policy "insert own family runs"
  on public.runs for insert
  to anon
  with check (family_code = public.request_family_code());

-- 記録は不変として扱う。update / delete のポリシーは置かない。
-- 再送による重複はクライアントが Prefer: resolution=ignore-duplicates で無視させる。

-- ---------------------------------------------------------------------------
-- 家族で共有する設定（段の解放、テーマ、敵の名前、呼び名）
-- ---------------------------------------------------------------------------

create table if not exists public.family_settings (
  family_code text        primary key,
  settings    jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.family_settings enable row level security;

drop policy if exists "read own family settings" on public.family_settings;
create policy "read own family settings"
  on public.family_settings for select
  to anon
  using (family_code = public.request_family_code());

drop policy if exists "insert own family settings" on public.family_settings;
create policy "insert own family settings"
  on public.family_settings for insert
  to anon
  with check (family_code = public.request_family_code());

-- 設定は上書きする。更新時刻の新しい方をクライアントが採る（後勝ち）。
-- 家庭内で同時に設定を触ることは稀なので、これで足りる。
drop policy if exists "update own family settings" on public.family_settings;
create policy "update own family settings"
  on public.family_settings for update
  to anon
  using (family_code = public.request_family_code())
  with check (family_code = public.request_family_code());
