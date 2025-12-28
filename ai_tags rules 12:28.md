明白：你现在 **`tags` 也是 jsonb**（你刚打了 “josonb” 我按 jsonb 理解）。那我把给技术的资料补齐成**jsonb 友好版**：字段建议、索引、以及一个“写入 ai_tags 前的校验/清洗”触发器（可选）。

下面这份你可以直接转发。

---

# 给技术：places 表（tags=jsonb，ai_tags=jsonb[]）最终落地方案

## 1) 字段约定（jsonb 版）

### places 表（保留你现有列）
* `tags jsonb`（你已有：内部结构化标签容器）
* `ai_tags jsonb[]`（你已有：展示标签，最多 2）
* `i18n jsonb`（新增：多语言文本容器）

### tags(jsonb) 推荐结构（统一格式，避免一会儿 string 一会儿对象）

建议固定为：

```json
{
  "style": ["Brutalist", "ArtDeco"],
  "theme": ["feminism"],
  "award": ["pritzker"],
  "meal": ["brunch"],
  "cuisine": ["Japanese"],
  "architectQ": ["Q82840"],
  "personQ": ["Q254"],
  "alt_category": ["museum"]
}
```

> 这样你既能做规则匹配，也方便前端/分析查询。
> 不再建议存 `["style:Brutalist", "theme:feminism"]` 这种扁平字符串，jsonb 下维护成本更高。

---

## 2) ai_tags(jsonb[]) 元素结构（展示标签对象）

每个元素：

```json
{"kind":"facet|person|architect","id":"Pritzker|Brutalist|Q254|...","en":"Pritzker","zh":"普利兹克","priority":95}
```

约束：

* `ai_tags` 最多 2 个
* 不允许出现 category 同义（例如 category_en=Museum，则 ai_tags.en 不能是 Museum）

---

## 3) 建议新增字典表（受控 facet）

建一张 `ai_facet_dictionary`，用于 kind=facet 的白名单与中英映射。

```sql
create table if not exists ai_facet_dictionary (
  id text primary key,          -- e.g. 'Brutalist'
  en text not null,             -- e.g. 'Brutalist'
  zh text not null,             -- e.g. '粗野主义'
  priority int not null default 50,
  allowed_categories text[] null, -- optional
  derive_from jsonb null          -- optional, for config
);
```

> 你维护的 `ai_facet_dictionary.csv` 可以导入这张表。

---

## 4) 索引/约束 SQL（jsonb 版可执行）

```sql
-- A) 新增列（如已存在会报错，可自行加 IF NOT EXISTS 适配）
alter table places add column if not exists category_slug text;
alter table places add column if not exists category_en text;
alter table places add column if not exists category_zh text;
alter table places add column if not exists i18n jsonb;

-- B) google_place_id 唯一（允许 NULL）
create unique index if not exists places_google_place_id_uq
on places (google_place_id)
where google_place_id is not null;

-- C) (source, source_detail) 唯一（允许 NULL）
create unique index if not exists places_source_detail_uq
on places (source, source_detail)
where source is not null and source_detail is not null;

-- D) ai_tags 最多 2 个（jsonb[] 是 PG array）
alter table places
add constraint if not exists places_ai_tags_len_chk
check (ai_tags is null or array_length(ai_tags, 1) <= 2);

-- E) tags 的 GIN 索引（方便 contains 查询）
create index if not exists places_tags_gin
on places using gin (tags);
```

---

## 5) 可选：ai_tags 校验/清洗触发器（强烈建议）

作用：

* 保证 ai_tags 元素必须含 kind/id/en/zh
* kind 必须在枚举里
* 数量最多 2（再双保险）
* 过滤掉 ai_tags.en == category_en 的元素

> 这是“可选增强”，如果你们不想上 trigger，也可以在应用层做；但 trigger 能防止脏数据写入。

```sql
create or replace function normalize_ai_tags()
returns trigger
language plpgsql
as $$
declare
  cleaned jsonb[];
  t jsonb;
  k text;
  en text;
begin
  if new.ai_tags is null then
    return new;
  end if;

  cleaned := array[]::jsonb[];

  foreach t in array new.ai_tags loop
    -- 只接受对象
    if jsonb_typeof(t) <> 'object' then
      continue;
    end if;

    k := coalesce(t->>'kind','');
    en := coalesce(t->>'en','');

    -- 必填字段校验
    if k = '' or coalesce(t->>'id','') = '' or en = '' or coalesce(t->>'zh','') = '' then
      continue;
    end if;

    -- kind 枚举
    if k not in ('facet','person','architect') then
      continue;
    end if;

    -- 不允许跟 category_en 重复
    if new.category_en is not null and lower(en) = lower(new.category_en) then
      continue;
    end if;

    -- 去重（按 kind+id）
    if array_position(
        array(select (x->>'kind')||':'||(x->>'id') from unnest(cleaned) as x),
        (k||':'||(t->>'id'))
      ) is null then
      cleaned := array_append(cleaned, t);
    end if;
  end loop;

  -- 截断到最多 2 个（假设应用层已排序好 priority）
  if array_length(cleaned, 1) > 2 then
    cleaned := cleaned[1:2];
  end if;

  new.ai_tags := cleaned;
  return new;
end;
$$;

drop trigger if exists trg_normalize_ai_tags on places;

create trigger trg_normalize_ai_tags
before insert or update of ai_tags, category_en
on places
for each row
execute function normalize_ai_tags();
```

---

## 6) 规则实现：用 tags(jsonb) 生成 ai_tags（展示）

### 生成优先级（挑最多 2 个）

1. `Pritzker`
2. 建筑风格（最多 1 个）
3. `Brunch`（restaurant/cafe/bakery 允许）
4. Cuisine（仅 restaurant）
5. 体验类（Photogenic 等）

### 从 tags(jsonb) 到 facet 的命中示例

* `tags.award` 包含 `pritzker` → facet `Pritzker`
* `tags.style` 包含 `Brutalist` → facet `Brutalist`
* `tags.meal` 包含 `brunch` → facet `Brunch`
* `tags.cuisine` 包含 `Japanese` → facet `Japanese`
* `tags.theme` 包含 `feminism` → facet `Feminist`

### 动态实体（Mozart/Aalto）

* 若 `tags.personQ` 有 `Q254` 并且该关系来自可信来源 → ai_tags push `{kind:"person", id:"Q254", en:"Mozart", zh:"莫扎特"}`
* 若 `tags.architectQ` 有 `Q82840` → 同理 `{kind:"architect"...}`

> 同一地点最多展示 1 个实体（person/architect）
