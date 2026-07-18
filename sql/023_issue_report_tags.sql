-- Tags de Issue Reports e vinculo N:N entre Issues e Tags.

create table if not exists issue_tags (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    color text null,
    is_active boolean not null default true,
    created_by uuid references users(id),
    updated_by uuid references users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint issue_tags_name_non_empty check (btrim(name) <> ''),
    constraint issue_tags_color_format check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists ux_issue_tags_active_name
    on issue_tags (lower(name))
    where is_active = true;

drop trigger if exists trg_issue_tags_updated_at on issue_tags;
create trigger trg_issue_tags_updated_at
before update on issue_tags
for each row
execute function set_updated_at();

create table if not exists issue_report_tags (
    issue_id uuid not null references issue_reports(id) on delete cascade,
    tag_id uuid not null references issue_tags(id) on delete cascade,
    created_by uuid references users(id),
    created_at timestamptz not null default now(),
    primary key (issue_id, tag_id)
);

create index if not exists idx_issue_report_tags_tag_id
    on issue_report_tags (tag_id);

create index if not exists idx_issue_report_tags_issue_id
    on issue_report_tags (issue_id);
