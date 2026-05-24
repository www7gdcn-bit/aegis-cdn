-- Redis 连接池封装 + 原子脚本(EVAL)
-- 设计:连接失败时调用方应"故障放行"(fail-open),CDN 不能因 Redis 抖动而全站 5xx。
local redis = require "resty.redis"

local _M = { _VERSION = "0.1.0" }

local HOST = os.getenv("REDIS_HOST") or "127.0.0.1"
local PORT = tonumber(os.getenv("REDIS_PORT") or "6379")
local PASS = os.getenv("REDIS_PASSWORD")
local POOL_IDLE_MS = 10000
local POOL_SIZE = 100

-- 取一个连接(失败返回 nil, err)
function _M.connect()
  local red = redis:new()
  red:set_timeouts(200, 1000, 1000) -- connect / send / read
  local ok, err = red:connect(HOST, PORT)
  if not ok then
    return nil, err
  end
  if PASS and PASS ~= "" then
    local times = red:get_reused_times()
    if times == 0 then
      local aok, aerr = red:auth(PASS)
      if not aok then
        red:close()
        return nil, "auth failed: " .. tostring(aerr)
      end
    end
  end
  return red
end

-- 归还连接到连接池(出错则关闭)
function _M.release(red, errored)
  if not red then return end
  if errored then
    red:close()
  else
    red:set_keepalive(POOL_IDLE_MS, POOL_SIZE)
  end
end

-- 跑一段需要 Redis 的逻辑;Redis 不可用时 fn 不被调用,返回 (nil, err)
function _M.run(fn)
  local red, err = _M.connect()
  if not red then
    return nil, err
  end
  local ok, res = pcall(fn, red)
  _M.release(red, not ok)
  if not ok then
    return nil, res
  end
  return res
end

return _M
