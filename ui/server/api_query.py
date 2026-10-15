# api_query.py : endpoints for the Query page and the Data model view

from ui.storage import saved_queries


# GET /api/sql/schema
def schema(ctx, q):
    return ctx.sql.schema()


# GET /api/sql/profile?table=
def profile(ctx, q):
    return ctx.sql.profile(q.get("table", ""))


# POST /api/sql/query {sql}
def run(ctx, body):
    return ctx.sql.query(str(body.get("sql", "")))


# GET /api/sql/export?table=|sql=&format=csv|json  (file download)
def export(ctx, q):
    return ctx.sql.export(q.get("table"), q.get("sql"), q.get("format", "csv"))


# GET /api/sql/saved
def saved(ctx, q):
    return {"queries": saved_queries.list_queries(ctx.db)}


# POST /api/sql/save {name, mode, sql, builder}
def save(ctx, body):
    qid = saved_queries.save_query(ctx.db, body.get("name"), body.get("mode", "sql"), str(body.get("sql", "")), body.get("builder"))
    return {"ok": True, "id": qid}


# POST /api/sql/view {name, sql} - save any SELECT (WITH, UNION... too) as a view
def save_view(ctx, body):
    return ctx.sql.save_view(str(body.get("name", "")).strip(), str(body.get("sql", "")))


# POST /api/sql/view/delete {name}
def delete_view(ctx, body):
    return ctx.sql.delete_view(str(body.get("name", "")))


# POST /api/sql/delete {id}
def delete(ctx, body):
    saved_queries.delete_query(ctx.db, int(body["id"]))
    return {"ok": True}