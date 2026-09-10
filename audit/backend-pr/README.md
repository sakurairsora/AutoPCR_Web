# 半月刊字段化 — 后端 PR 素材（提交流程说明）

## 背景
Discord 讨论定案：半月刊（half_schedule, `autopcr/module/modules/nologin.py`）的解析逻辑
挪进 `db`（database.py）返回结构化数据，供 module 渲染与网站 API 共用；网页端基于此做
「复刻活动/特别地下城/新斗技场/公会战开启」通知，不再依赖运行任务读警报。

## 重要约束（为什么这个目录里只有素材没有直接改动）
后端仓库 U:\autopcr（cc004/autopcr，dev 分支）正在被本机 Docker 容器运行，工作区不能直接改。
本目录保存已完成的设计与代码素材，PR 需要在后端仓库的独立分支上落地。

## 提 PR 步骤（在后端仓库做）
1. cd U:\autopcr
2. git checkout -b feat/schedule-entries origin/dev
3. 按本目录两个 .py 素材文件落改动：
   - database_schedule_entries.py 的方法体 → 粘进 autopcr/db/database.py 的
     database 类（放 is_clan_battle_time 之前即可；List/Counter 已在文件头有 import）
   - nologin_half_schedule.py 的 do_task → 替换 autopcr/module/modules/nologin.py
     half_schedule 类里现有的 do_task（schedule_sources 静态方法可保留，已无消费者，也可一并删）
4. 本地验证：
   - python -c "from autopcr.db.database import db; e=db.schedule_entries(); print(len(e), e[0])"
     （应输出条目数与第一条字段化日程，渲染文本与半月刊一致）
   - 跑一次半月刊 module，输出应与改动前逐行一致（排序键相同：start_time 字符串序）
5. httpserver.py 加只读端点（与 /clan_forbid 同风格，无需登录）：
   @self.api.route('/schedule', methods=["GET"])
   async def get_schedule():
       return db.schedule_entries(), 200
   （注意 schedule_entries 每次调用都全表扫 17 张红标表，量级小可接受；若在意可加 lazy_property 缓存，
    但 enabled 依赖当前时间，缓存须带 TTL——首版建议不加）
6. git add autopcr/db/database.py autopcr/module/modules/nologin.py autopcr/http_server/httpserver.py
   git commit；push 到自己 fork 或分支；向 cc004/autopcr 提 PR。

## 字段化数据形状
每条日程：{ key, category, start_time, end_time, description }
- key：稳定唯一（"类别:来源主键"，同主键多来源加 #序号），通知侧已读去重直接用它
- category：半月刊渲染的类别名（公会战/特别地下城/新斗技场/庆典/活动/扭蛋/...）
- start_time / end_time：YYYY/MM/DD（与半月刊渲染一致）
- description：与半月刊逐行渲染完全相同的文本（up 名单、掉落倍率等都在这里面）

## 前端侧约定（本仓库，等后端 API 合入后实现）
- GET /daily/api/schedule（或后端定的实际路径）→ ScheduleEntry[]
- NotifyWatcher 或独立 ScheduleWatcher 轮询（低频，如每 30 分钟）：
  只关心 category ∈ {复刻活动相关, 特别地下城, 新斗技场, 公会战}（用户明确不要掉落/up 类庆典噪声——
  category=庆典的条目按 description 前缀过滤，或后端在 schedule_entries 加 strict_category 字段）
- 开启当天（start_time == 今天）且 localStorage 已读集合没有该 key → 浏览器通知 + 已读标记持久化
