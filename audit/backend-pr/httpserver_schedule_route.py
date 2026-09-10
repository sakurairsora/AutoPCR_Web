# autopcr/http_server/httpserver.py — configure_routes 内加（与 /clan_forbid 同风格，公开只读）
@self.api.route('/schedule', methods=["GET"])
async def get_schedule():
    """半月刊结构化日程（字段化，无账号依赖）。网页端通知与本 module 渲染共用数据源。"""
    return db.schedule_entries(), 200
