-- WAF 规则引擎:内置 OWASP 方向签名 + 控制面自定义规则(Redis JSON,热更新)
-- 每条规则:{ id, name, target, op, pattern, action, severity, ruleset }
--   target: uri | args | body | ua | cookie | referer | headers
--   op:     regex | contains
--   action: log | challenge | block
local cjson = require "cjson.safe"

local _M = {}
local CACHE = ngx.shared.aegis_waf

-- 内置规则集(精简但真实可用的签名;生产可由控制面扩充托管规则)
local BUILTIN = {
  -- SQL 注入
  { id = "sqli-1", ruleset = "sqli", target = "args", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)(union(\s|/\*.*\*/)+select|select.+from\s|insert\s+into\s|\bor\b\s+\d+\s*=\s*\d+|sleep\s*\(|benchmark\s*\(|information_schema)]] },
  { id = "sqli-2", ruleset = "sqli", target = "uri", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)(\'\s*or\s*\'?\d|--\s|;\s*drop\s+table|xp_cmdshell)]] },
  -- XSS
  { id = "xss-1", ruleset = "xss", target = "args", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)(<script[\s>]|javascript:|onerror\s*=|onload\s*=|<img[^>]+src[^>]+=|document\.cookie|<svg/?\s*onload)]] },
  -- RCE / 命令执行
  { id = "rce-1", ruleset = "rce", target = "args", op = "regex", action = "block", severity = "critical",
    pattern = [[(?i)(;\s*(cat|ls|id|whoami|wget|curl|bash|sh)\s|\|\s*(nc|netcat|bash)\b|\$\(.*\)|`.*`|/etc/passwd)]] },
  -- 路径穿越 / LFI
  { id = "traversal-1", ruleset = "traversal", target = "uri", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)(\.\./|\.\.%2f|%2e%2e/|/etc/passwd|/proc/self/environ|c:\\windows)]] },
  -- SSRF
  { id = "ssrf-1", ruleset = "ssrf", target = "args", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)(https?://(127\.0\.0\.1|localhost|169\.254\.169\.254|0\.0\.0\.0|metadata\.google)|file://|gopher://|dict://)]] },
  -- XXE
  { id = "xxe-1", ruleset = "xxe", target = "body", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)(<!entity|<!doctype[^>]+system|SYSTEM\s+["']file:)]] },
  -- WebShell / 文件上传
  { id = "webshell-1", ruleset = "webshell", target = "body", op = "regex", action = "block", severity = "critical",
    pattern = [[(?i)(eval\s*\(\s*\$_(get|post|request)|base64_decode\s*\(|assert\s*\(\s*\$_|system\s*\(\s*\$_|<\?php.+(eval|assert|system))]] },
  { id = "webshell-2", ruleset = "webshell", target = "uri", op = "regex", action = "block", severity = "high",
    pattern = [[(?i)\.(php|asp|aspx|jsp)\.(jpg|png|gif|txt)$]] },
}

-- 取 target 对应的待检文本
local function target_value(target)
  if target == "uri"     then return ngx.var.request_uri end
  if target == "args"    then return ngx.var.args end
  if target == "ua"      then return ngx.var.http_user_agent end
  if target == "cookie"  then return ngx.var.http_cookie end
  if target == "referer" then return ngx.var.http_referer end
  if target == "headers" then return ngx.var.http_user_agent end -- 简化:可扩展拼接更多头
  if target == "body" then
    ngx.req.read_body()
    return ngx.req.get_body_data()
  end
  return nil
end

local function match_rule(rule)
  local value = target_value(rule.target)
  if not value or value == "" then return false end
  if rule.op == "contains" then
    return value:find(rule.pattern, 1, true) ~= nil
  end
  -- regex(JIT + 编译缓存)
  return ngx.re.find(value, rule.pattern, "jo") ~= nil
end

-- 取自定义规则(控制面下发到 Redis,缓存于 shared dict)
local function load_custom(domain)
  if not CACHE then return {} end
  local raw = CACHE:get("waf:" .. domain)
  if not raw then return {} end
  return cjson.decode(raw) or {}
end

-- 检测。enabled_rulesets 控制启用哪些内置集;mode: observe(仅记录) | block
-- 返回 { matched, action, rule, severity }
function _M.inspect(domain, waf_cfg)
  local result = { matched = false }
  if not waf_cfg or waf_cfg.enabled == false then return result end

  local enabled = {}
  for _, rs in ipairs(waf_cfg.rulesets or {}) do enabled[rs] = true end

  local function eval_set(rules, is_custom)
    for _, rule in ipairs(rules) do
      if is_custom or enabled[rule.ruleset] then
        if match_rule(rule) then
          local action = rule.action or "block"
          if waf_cfg.mode == "observe" then action = "log" end
          result.matched = true
          result.action = action
          result.rule = rule.id or rule.name
          result.severity = rule.severity or "medium"
          if action == "block" then return true end -- block 立即短路
        end
      end
    end
    return false
  end

  if eval_set(load_custom(domain), true) then return result end -- 自定义优先
  eval_set(BUILTIN, false)
  return result
end

_M.BUILTIN = BUILTIN
return _M
