-- 域名防护配置加载:Redis(控制面下发) → lua_shared_dict 缓存 → 内置默认
-- 控制面写 aegis:cfg:<domain> (JSON 字符串);边缘缓存 CACHE_TTL 秒,实现热更新且不每请求查 Redis。
local cjson = require "cjson.safe"
local redis = require "aegis.redis"

local _M = {}
local CACHE = ngx.shared.aegis_cfg      -- 在 nginx.conf 用 lua_shared_dict 声明
local CACHE_TTL = 10                    -- 秒

-- 内置默认(未接控制面时也能跑;demo 用)
local DEFAULTS = {
  enabled = true,
  mode = "normal",                      -- normal | attack | strict
  -- 决策阈值
  challenge_score = 50,
  block_score = 80,
  bot_challenge_score = 60,   -- 强自动化(curl/python/headless 等)≥此分直接进挑战
  -- 限频:每个维度 { window=秒, limit=次数, algo="sliding|token|leaky" }
  ratelimit = {
    { dim = "ip",  window = 10, limit = 100, algo = "sliding" },
    { dim = "ip",  window = 60, limit = 600, algo = "sliding" },
    { dim = "uri", window = 60, limit = 300, algo = "sliding" },
  },
  -- 触发挑战的方式
  challenge = { on_score = true, on_country = {}, types = { "js" } },
  -- 封禁
  ban = { auto = true, base_ttl = 300, max_ttl = 86400 },
  -- WAF
  waf = { enabled = true, mode = "block", rulesets = { "sqli", "xss", "rce", "traversal", "webshell" } },
  -- 名单
  whitelist = { ip = {}, ua = {}, asn = {} },
  blacklist = { country = {}, asn = {} },
}

local function fetch_from_redis(domain)
  local res, err = redis.run(function(red)
    return red:get("aegis:cfg:" .. domain)
  end)
  if not res or res == ngx.null then
    return nil, err
  end
  local cfg = cjson.decode(res)
  return cfg
end

-- 加载域名配置(带缓存)
function _M.load(domain)
  domain = domain or "default"
  local cached = CACHE and CACHE:get("cfg:" .. domain)
  if cached then
    local cfg = cjson.decode(cached)
    if cfg then return cfg end
  end

  local cfg = fetch_from_redis(domain) or DEFAULTS
  if CACHE then
    CACHE:set("cfg:" .. domain, cjson.encode(cfg), CACHE_TTL)
  end
  return cfg
end

_M.DEFAULTS = DEFAULTS
return _M
