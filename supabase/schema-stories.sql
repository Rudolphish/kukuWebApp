-- 子どもが注文した話を置く。
-- schema.sql を実行したあとに、これを実行する。
--
-- 判断の根拠は docs/story-authoring-design.md。
--
-- 2026-10-27 に本番へ適用済み（migration: create_stories_table）。
-- 下の drop policy は、同じ内容を貼り直せるようにするためのもの。
-- MCP 経由で流すと破壊的文として確認を求められるため、
-- 新規のプロジェクトに当てるときは drop の 4 行を外して流してよい。
--
-- 認証は置かない（小 2 にログインさせない）。既存のテーブルと同じく、
-- 家族の合言葉を x-family-code ヘッダで送り、RLS でその行だけに絞る。
-- anon キーは公開されるものなので、分離は必ずこのポリシー側で行うこと。
--
-- 話を作るのは親の Claude のスケジュールタスク（docs/story-task.md）。
-- そちらも service_role ではなく anon キー + 合言葉で動かす。
-- アプリと同じ権限しか使わせない。

create table if not exists public.stories (
  id          text        primary key,
  family_code text        not null,

  -- ordered: 注文済み。まだ作られていない
  -- ready:   生成と検査を通った。遊べる
  -- failed:  作り直しても検査を通らなかった
  status      text        not null default 'ordered'
                          check (status in ('ordered', 'ready', 'failed')),

  -- 何の段の話か。未習の段は注文できない（アプリ側で解放済みに絞る）
  stage       integer     not null check (stage between 1 and 9),

  -- 誰が注文したか。StoryArea.author に入る
  author      text        not null,

  -- 子どもが出した種。どこ・だれ・どんなかんじ
  seed        jsonb       not null default '{}'::jsonb,

  -- 生成された StoryArea。status が ready のときだけ入る
  area        jsonb,

  -- failed のときに、何が起きたかを親に見せるために残す
  error       text,

  ordered_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 子どもの画面は「新しい順」で引く
create index if not exists stories_family_ordered_idx
  on public.stories (family_code, ordered_at desc);

-- 話を作る側は「まだ作られていないもの」だけを引く
create index if not exists stories_pending_idx
  on public.stories (family_code, ordered_at)
  where status = 'ordered';

alter table public.stories enable row level security;

drop policy if exists "read own family stories" on public.stories;
create policy "read own family stories"
  on public.stories for select
  to anon
  using (family_code = public.request_family_code());

drop policy if exists "insert own family stories" on public.stories;
create policy "insert own family stories"
  on public.stories for insert
  to anon
  with check (family_code = public.request_family_code());

-- 話を作る側が ordered -> ready / failed へ進めるために要る。
-- 合言葉を持つ者だけが更新できる点は、他のテーブルと同じ信頼水準。
drop policy if exists "update own family stories" on public.stories;
create policy "update own family stories"
  on public.stories for update
  to anon
  using (family_code = public.request_family_code())
  with check (family_code = public.request_family_code());

-- 記録（runs）と違い、話は消せる必要がある。
-- 親が事後に見て、合わないものを消す前提で設計しているため。
drop policy if exists "delete own family stories" on public.stories;
create policy "delete own family stories"
  on public.stories for delete
  to anon
  using (family_code = public.request_family_code());
