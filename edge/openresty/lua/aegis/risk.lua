-- 风险评分 0-100:多特征加权。权重可由控制面下发覆盖。
local _M = {}

local WEIGHTS = {
  rate = 35,       -- 限频压力
  bot = 30,        -- 自动化/Bot 信号
  fp = 15,         -- 指纹矛盾
  geo = 10,        -- 高风险地区
  history = 20,    -- 历史违规累计(来自 Redis / 离线 ML 回灌)
  waf_soft = 25,   -- WAF 观察模式软命中
}

local function clamp(n, lo, hi)
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

-- features:
--   rate_ratio  : 限频 max_ratio(>1 超限)
--   bot_score   : 0-100
--   fp_anomaly  : 0..3
--   geo_risk    : 0..1
--   history     : 0..1
--   waf_soft    : bool
function _M.score(f)
  local s = 0
  -- 限频:ratio 1 → 满,>1 维持满
  s = s + WEIGHTS.rate * clamp((f.rate_ratio or 0), 0, 1)
  s = s + WEIGHTS.bot * clamp((f.bot_score or 0) / 100, 0, 1)
  s = s + WEIGHTS.fp * clamp((f.fp_anomaly or 0) / 3, 0, 1)
  s = s + WEIGHTS.geo * clamp((f.geo_risk or 0), 0, 1)
  s = s + WEIGHTS.history * clamp((f.history or 0), 0, 1)
  if f.waf_soft then s = s + WEIGHTS.waf_soft end
  return math.floor(clamp(s, 0, 100) + 0.5)
end

_M.WEIGHTS = WEIGHTS
return _M
