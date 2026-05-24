-- 多维度限频:滑动窗口计数器 / 令牌桶 / 漏桶,均用 Redis Lua 脚本保证原子性。
-- 维度 key: aegis:rl:<domain>:<dim>:<value>:<window>
local _M = {}

-- 滑动窗口计数器(两窗口加权,消除固定窗口边界突刺)。返回加权后的请求数。
local SLIDING = [[
local window = tonumber(ARGV[1])
local now    = tonumber(ARGV[2])
local cur_win = math.floor(now / window)
local kcur  = KEYS[1] .. ':' .. cur_win
local kprev = KEYS[1] .. ':' .. (cur_win - 1)
local newcur = redis.call('INCR', kcur)
if newcur == 1 then redis.call('EXPIRE', kcur, window * 2) end
local prev = tonumber(redis.call('GET', kprev) or '0')
local elapsed = (now % window) / window
local weighted = prev * (1 - elapsed) + newcur
return math.floor(weighted + 0.5)
]]

-- 令牌桶:返回 1=放行 0=超限。ARGV: rate(每秒令牌), capacity, now(秒), requested
local TOKEN_BUCKET = [[
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local cap  = tonumber(ARGV[2])
local now  = tonumber(ARGV[3])
local req  = tonumber(ARGV[4])
local d = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(d[1])
local ts = tonumber(d[2])
if tokens == nil then tokens = cap; ts = now end
local delta = now - ts
if delta < 0 then delta = 0 end
tokens = math.min(cap, tokens + delta * rate)
local allowed = 0
if tokens >= req then tokens = tokens - req; allowed = 1 end
redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(cap / rate) + 10)
return allowed
]]

-- 漏桶:恒定漏出速率,返回 1=放行 0=溢出。ARGV: leak_rate(每秒漏出), capacity, now(秒)
local LEAKY_BUCKET = [[
local key = KEYS[1]
local rate = tonumber(ARGV[1])
local cap  = tonumber(ARGV[2])
local now  = tonumber(ARGV[3])
local d = redis.call('HMGET', key, 'water', 'ts')
local water = tonumber(d[1])
local ts = tonumber(d[2])
if water == nil then water = 0; ts = now end
local leaked = (now - ts) * rate
water = math.max(0, water - leaked)
local allowed = 0
if water + 1 <= cap then water = water + 1; allowed = 1 end
redis.call('HMSET', key, 'water', water, 'ts', now)
redis.call('EXPIRE', key, math.ceil(cap / rate) + 10)
return allowed
]]

local function key_for(domain, dim, value, window)
  return string.format("aegis:rl:%s:%s:%s:%d", domain, dim, value, window)
end

-- 滑动窗口:返回 count
function _M.sliding(red, domain, dim, value, window)
  local k = key_for(domain, dim, value, window)
  local res, err = red:eval(SLIDING, 1, k, window, ngx.time())
  if not res then return nil, err end
  return tonumber(res)
end

-- 令牌桶:返回 allowed(bool)
function _M.token_bucket(red, domain, dim, value, rate, cap)
  local k = key_for(domain, dim, value, 0)
  local res, err = red:eval(TOKEN_BUCKET, 1, k, rate, cap, ngx.time(), 1)
  if not res then return nil, err end
  return res == 1
end

-- 漏桶:返回 allowed(bool)
function _M.leaky_bucket(red, domain, dim, value, rate, cap)
  local k = key_for(domain, dim, value, 0)
  local res, err = red:eval(LEAKY_BUCKET, 1, k, rate, cap, ngx.time())
  if not res then return nil, err end
  return res == 1
end

-- 取某维度的取值
local function dim_value(dim)
  if dim == "ip"      then return ngx.var.remote_addr end
  if dim == "uri"     then return ngx.var.uri end
  if dim == "ua"      then return ngx.md5(ngx.var.http_user_agent or "-") end
  if dim == "cookie"  then return ngx.md5(ngx.var.http_cookie or "-") end
  if dim == "session" then return ngx.var.cookie_aegis_sid or ngx.var.remote_addr end
  if dim == "asn"     then return ngx.var.aegis_asn or "0" end
  if dim == "country" then return ngx.var.aegis_country or "XX" end
  return ngx.var.remote_addr
end

-- 按配置评估所有限频维度。返回 { exceeded=bool, max_ratio=0..n, hits={...} }
-- max_ratio>1 表示超限;调用方据此决定挑战/封禁/加分。
function _M.evaluate(red, domain, rules)
  local result = { exceeded = false, max_ratio = 0, hits = {} }
  if not rules then return result end
  for _, r in ipairs(rules) do
    local value = dim_value(r.dim)
    local algo = r.algo or "sliding"
    if algo == "sliding" then
      local count = _M.sliding(red, domain, r.dim, value, r.window)
      if count then
        local ratio = count / r.limit
        if ratio > result.max_ratio then result.max_ratio = ratio end
        if count > r.limit then
          result.exceeded = true
          result.hits[#result.hits + 1] = { dim = r.dim, window = r.window, count = count, limit = r.limit }
        end
      end
    else
      -- token / leaky:rate 由 limit/window 推导,capacity=limit
      local rate = r.limit / r.window
      local ok
      if algo == "token" then
        ok = _M.token_bucket(red, domain, r.dim, value, rate, r.limit)
      else
        ok = _M.leaky_bucket(red, domain, r.dim, value, rate, r.limit)
      end
      if ok == false then
        result.exceeded = true
        result.max_ratio = math.max(result.max_ratio, 1.5)
        result.hits[#result.hits + 1] = { dim = r.dim, algo = algo, limit = r.limit }
      end
    end
  end
  return result
end

return _M
