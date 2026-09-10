-- 親子で端末が分かれた時点で使う。第 1 版は端末内で完結しているため必須ではない。
--
-- 小 2 にログインさせたくないので認証は置かない。
-- 代わりに「家族の合言葉」をリクエストヘッダ x-family-code で送り、RLS でその行だけに絞る。
-- anon キーは公開されるものなので、分離は必ずこのポリシー側で行うこと。
-- 合言葉は推測されにくい長い文字列にすること（例: 32 文字のランダム）。

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

-- 記録は上書き・削除させない。ベストの判定はクライアント側で行う。
