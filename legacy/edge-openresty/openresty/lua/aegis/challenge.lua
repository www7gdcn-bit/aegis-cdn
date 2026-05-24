-- 动态挑战:JS Challenge / 5 秒盾。HMAC Cookie 校验,阻断不执行 JS/Cookie 的脚本类客户端。
-- 关键:只有客户端带回合法 Cookie(=真正执行了挑战 JS)才放行;绝不在下发时预先放行。
local _M = {}

local SECRET = os.getenv("AEGIS_SECRET") or "change-me-aegis-secret"
local COOKIE = "aegis_clr"
local TTL = 1800            -- 通行 Cookie 有效期(秒)
local WINDOW = 1800         -- token 时间窗

local function token_for(window)
  local ip = ngx.var.remote_addr or "?"
  local ua = ngx.var.http_user_agent or "-"
  local digest = ngx.hmac_sha1(SECRET, ip .. "|" .. ua .. "|" .. window)
  return (ngx.encode_base64(digest):gsub("[/+=]", ""))
end

-- 校验通行 Cookie(容忍跨窗口时钟偏移)。通过 = 客户端已解出挑战。
function _M.verify()
  local cookie = ngx.var["cookie_" .. COOKIE]
  if not cookie or #cookie == 0 then return false end
  local w = math.floor(ngx.time() / WINDOW)
  return cookie == token_for(w) or cookie == token_for(w - 1)
end

-- 下发 5 秒盾挑战页(503):JS 等待后种 HMAC Cookie 并自动跳回;采集浏览器指纹。
function _M.issue()
  local token = token_for(math.floor(ngx.time() / WINDOW))
  ngx.status = 503
  ngx.header["Content-Type"] = "text/html; charset=utf-8"
  ngx.header["Cache-Control"] = "no-store"
  ngx.say(string.format([[<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>正在验证您的浏览器…</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0b0f;color:#fff;
font-family:-apple-system,Segoe UI,Roboto,sans-serif}.box{text-align:center}
.ring{width:42px;height:42px;border:3px solid rgba(255,255,255,.15);border-top-color:#0A84FF;
border-radius:50%%;margin:0 auto 20px;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}h1{font-size:20px;font-weight:600}p{color:#8a8f98;font-size:14px}</style>
</head><body><div class="box"><div class="ring"></div>
<h1>正在验证您的浏览器</h1><p>AegisCDN 安全检查 · 请稍候,即将自动跳转…</p></div>
<script>
(function(){
  try{
    var fp={ua:navigator.userAgent,lang:navigator.language,plat:navigator.platform,
      tz:Intl.DateTimeFormat().resolvedOptions().timeZone,scr:screen.width+'x'+screen.height,
      wd:!!navigator.webdriver};
    document.cookie='aegis_fp='+encodeURIComponent(btoa(JSON.stringify(fp)))+';path=/;max-age=1800';
  }catch(e){}
  setTimeout(function(){
    document.cookie='%s=%s;path=/;max-age=%d;SameSite=Lax';
    location.reload();
  }, 4500);
})();
</script></body></html>]], COOKIE, token, TTL))
  return ngx.exit(503)
end

return _M
