-- 决策日志:把流水线判定结果写到 nginx 变量,由 JSON log_format 落盘,
-- edge-agent tail 后批量写 ClickHouse(见 edge/clickhouse/schema.sql)。
local _M = {}

-- 在 log_by_lua 阶段调用:将 ngx.ctx.aegis 暴露到日志变量
function _M.finalize()
  local a = ngx.ctx.aegis
  if not a then return end
  -- 这些变量需在 server/location 用 `set $aegis_xxx '-';` 预声明
  ngx.var.aegis_action  = a.action or "allow"
  ngx.var.aegis_risk    = tostring(a.risk or 0)
  ngx.var.aegis_rule    = a.rule or "-"
  ngx.var.aegis_reason  = a.reason or "-"
  ngx.var.aegis_bot     = a.bot_category or "-"
end

return _M
