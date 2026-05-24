# GeoIP 数据库放置目录

把 MaxMind **GeoLite2-Country.mmdb** 放到本目录,边缘启动时自动加载,实现真实的国家解析与地区拦截。

## 获取 GeoLite2(免费,需注册)

1. 注册 MaxMind 账号:https://www.maxmind.com/en/geolite2/signup
2. 下载 **GeoLite2 Country**(.mmdb 格式),解压得到 `GeoLite2-Country.mmdb`
3. 放到本目录:`edge/openresty/geoip/GeoLite2-Country.mmdb`
4. compose 已把本目录挂载到容器 `/etc/openresty/geoip/`,重启 openresty 即生效

> 也可用 `geoipupdate` 工具定期更新。ASN 维度需额外的 `GeoLite2-ASN.mmdb`(本期国家优先,ASN 暂留 0)。

## 没有 mmdb 时?

引擎会**优雅降级**:`geo.lua` 检测不到数据库就返回国家码 `XX`,
地区拦截规则不会误伤,其余防护(CC/WAF/Bot/挑战/封禁)正常工作。

> .mmdb 文件较大且有许可,**不纳入版本库**(见 .gitignore)。
