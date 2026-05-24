// AegisCDN edge-agent:tail OpenResty JSON 决策日志 → 批量写 ClickHouse。
// 纯标准库,零外部依赖。支持断点续传(offset 持久化)、日志轮转检测、批量+定时刷新、失败重试。
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// ---- 配置(环境变量)----
type Config struct {
	LogPath    string
	OffsetFile string
	CHUrl      string // http://clickhouse:8123
	CHDatabase string
	CHTable    string
	BatchSize  int
	FlushEvery time.Duration
	PollEvery  time.Duration
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func loadConfig() Config {
	bs, _ := strconv.Atoi(envOr("BATCH_SIZE", "500"))
	flush, _ := strconv.Atoi(envOr("FLUSH_INTERVAL_MS", "2000"))
	poll, _ := strconv.Atoi(envOr("POLL_INTERVAL_MS", "500"))
	return Config{
		LogPath:    envOr("LOG_PATH", "/var/log/openresty/access.json.log"),
		OffsetFile: envOr("OFFSET_FILE", "/var/lib/aegis-agent/offset"),
		CHUrl:      strings.TrimRight(envOr("CLICKHOUSE_URL", "http://clickhouse:8123"), "/"),
		CHDatabase: envOr("CLICKHOUSE_DB", "aegis"),
		CHTable:    envOr("CLICKHOUSE_TABLE", "request_log"),
		BatchSize:  bs,
		FlushEvery: time.Duration(flush) * time.Millisecond,
		PollEvery:  time.Duration(poll) * time.Millisecond,
	}
}

// ---- OpenResty 日志行(nginx log_format aegis_json)----
type logLine struct {
	Time    string  `json:"time"`
	Host    string  `json:"host"`
	IP      string  `json:"ip"`
	Method  string  `json:"method"`
	URI     string  `json:"uri"`
	Status  int     `json:"status"`
	UA      string  `json:"ua"`
	Referer string  `json:"referer"`
	Bytes   int64   `json:"bytes"`
	RT      float64 `json:"rt"`
	Country string  `json:"country"`
	ASN     string  `json:"asn"`
	Action  string  `json:"action"`
	Risk    int     `json:"risk"`
	Rule    string  `json:"rule"`
	Reason  string  `json:"reason"`
	Bot     string  `json:"bot"`
	Ray     string  `json:"ray"`
}

// ---- ClickHouse request_log 行(JSONEachRow)----
type chRow struct {
	Ts      int64   `json:"ts"` // unix 秒,CH DateTime 接受整数 unixtime
	Domain  string  `json:"domain"`
	IP      string  `json:"ip"`
	Country string  `json:"country"`
	ASN     uint32  `json:"asn"`
	Method  string  `json:"method"`
	URI     string  `json:"uri"`
	Status  uint16  `json:"status"`
	Action  string  `json:"action"`
	Risk    uint8   `json:"risk"`
	Rule    string  `json:"rule"`
	Reason  string  `json:"reason"`
	Bot     string  `json:"bot"`
	UA      string  `json:"ua"`
	Bytes   uint64  `json:"bytes"`
	RT      float32 `json:"rt"`
	Ray     string  `json:"ray"`
}

func parseTime(s string) int64 {
	// nginx $time_iso8601 形如 2026-05-21T13:08:38+08:00
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05Z07:00", "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.Unix()
		}
	}
	return time.Now().Unix()
}

func toRow(l logLine) chRow {
	asn, _ := strconv.ParseUint(l.ASN, 10, 32)
	status := l.Status
	if status < 0 {
		status = 0
	}
	risk := l.Risk
	if risk < 0 {
		risk = 0
	} else if risk > 255 {
		risk = 255
	}
	bytesOut := l.Bytes
	if bytesOut < 0 {
		bytesOut = 0
	}
	return chRow{
		Ts: parseTime(l.Time), Domain: l.Host, IP: l.IP, Country: l.Country,
		ASN: uint32(asn), Method: l.Method, URI: l.URI, Status: uint16(status),
		Action: l.Action, Risk: uint8(risk), Rule: l.Rule, Reason: l.Reason,
		Bot: l.Bot, UA: l.UA, Bytes: uint64(bytesOut), RT: float32(l.RT), Ray: l.Ray,
	}
}

// ---- ClickHouse 批量写(HTTP + JSONEachRow)----
type chWriter struct {
	cfg    Config
	client *http.Client
	query  string
}

func newCHWriter(cfg Config) *chWriter {
	return &chWriter{
		cfg:    cfg,
		client: &http.Client{Timeout: 10 * time.Second},
		query:  "INSERT INTO " + cfg.CHDatabase + "." + cfg.CHTable + " FORMAT JSONEachRow",
	}
}

func (w *chWriter) insert(rows []chRow) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	for _, r := range rows {
		if err := enc.Encode(r); err != nil { // 每行一个 JSON 对象 + 换行
			return err
		}
	}
	req, err := http.NewRequest("POST", w.cfg.CHUrl+"/?query="+urlEscape(w.query), &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	resp, err := w.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return &chError{code: resp.StatusCode, msg: string(body)}
	}
	io.Copy(io.Discard, resp.Body)
	return nil
}

type chError struct {
	code int
	msg  string
}

func (e *chError) Error() string { return "clickhouse " + strconv.Itoa(e.code) + ": " + e.msg }

func urlEscape(s string) string {
	// 仅转义 query 中必要字符,避免引入 net/url 复杂度
	r := strings.NewReplacer(" ", "%20", "\n", "%0A", "+", "%2B", "&", "%26", "#", "%23")
	return r.Replace(s)
}

// ---- offset 持久化 ----
func readOffset(path string) int64 {
	b, err := os.ReadFile(path)
	if err != nil {
		return -1
	}
	n, _ := strconv.ParseInt(strings.TrimSpace(string(b)), 10, 64)
	return n
}

func writeOffset(path string, off int64) {
	_ = os.MkdirAll(dir(path), 0o755)
	_ = os.WriteFile(path, []byte(strconv.FormatInt(off, 10)), 0o644)
}

func dir(p string) string {
	if i := strings.LastIndexByte(p, '/'); i >= 0 {
		return p[:i]
	}
	return "."
}

func main() {
	cfg := loadConfig()
	log.Printf("[edge-agent] start log=%s ch=%s/%s.%s batch=%d", cfg.LogPath, cfg.CHUrl, cfg.CHDatabase, cfg.CHTable, cfg.BatchSize)
	writer := newCHWriter(cfg)

	offset := readOffset(cfg.OffsetFile) // -1 表示从文件末尾开始
	var batch []chRow
	flushTicker := time.NewTicker(cfg.FlushEvery)
	defer flushTicker.Stop()

	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := writer.insert(batch); err != nil {
			log.Printf("[edge-agent] insert failed (will retry): %v", err)
			return // 保留 batch,下次重试;暂不前移 offset
		}
		log.Printf("[edge-agent] flushed %d rows", len(batch))
		batch = batch[:0]
		writeOffset(cfg.OffsetFile, offset)
	}

	for {
		f, err := os.Open(cfg.LogPath)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		size, _ := f.Seek(0, io.SeekEnd)
		if offset < 0 || offset > size {
			offset = size // 首次启动从末尾;或检测到轮转(文件变小)则重置
		}
		f.Seek(offset, io.SeekStart)
		reader := bufio.NewReader(f)

		for {
			line, _ := reader.ReadString('\n')
			if len(line) > 0 && strings.HasSuffix(line, "\n") {
				offset += int64(len(line))
				var ll logLine
				if json.Unmarshal([]byte(strings.TrimSpace(line)), &ll) == nil && ll.IP != "" {
					batch = append(batch, toRow(ll))
					if len(batch) >= cfg.BatchSize {
						flush()
					}
				}
				continue
			}
			// 没有完整行了。半行的字节未计入 offset(只有完整行才 offset += len),
			// 所以无需回退;下次重开文件 seek 到 offset 会重读这半行,等换行到达。
			break
		}
		f.Close()

		select {
		case <-flushTicker.C:
			flush()
		case <-time.After(cfg.PollEvery):
		}
	}
}
