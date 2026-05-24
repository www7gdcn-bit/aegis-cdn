// decrypt-token.go — 读 stdin 的 {secret, nodeId, token},用上游 EdgeAPI 同实现解密。
// 用于验证 Node SDK buildGoEdgeToken 生成的 token 能被 Go 侧正确解码。
//
// 用法:
//   echo '{"secret":"...","nodeId":"...","token":"..."}' | go run .
//   (或) node gen-token.cjs | go run .
//
// 预期 stdout:解密后的 JSON 明文 `{"type":"admin","timestamp":...,"userId":0}`
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"aegis-test-grpc-compat/encrypt"
)

type Input struct {
	Secret string `json:"secret"`
	NodeId string `json:"nodeId"`
	Token  string `json:"token"`
}

func main() {
	raw, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stdin read err:", err)
		os.Exit(2)
	}
	var in Input
	if err := json.Unmarshal(raw, &in); err != nil {
		fmt.Fprintln(os.Stderr, "input JSON parse err:", err)
		os.Exit(2)
	}
	if in.Secret == "" || in.NodeId == "" || in.Token == "" {
		fmt.Fprintln(os.Stderr, "input missing secret/nodeId/token")
		os.Exit(2)
	}

	m := &encrypt.AES256CFBMethod{}
	if err := m.Init([]byte(in.Secret), []byte(in.NodeId)); err != nil {
		fmt.Fprintln(os.Stderr, "encrypt init err:", err)
		os.Exit(3)
	}

	data, err := base64.StdEncoding.DecodeString(in.Token)
	if err != nil {
		fmt.Fprintln(os.Stderr, "base64 decode err:", err)
		os.Exit(4)
	}

	plain, err := m.Decrypt(data)
	if err != nil {
		fmt.Fprintln(os.Stderr, "decrypt err:", err)
		os.Exit(5)
	}

	// 验证明文是合法 JSON 且含 type 字段
	var payload map[string]interface{}
	if err := json.Unmarshal(plain, &payload); err != nil {
		fmt.Fprintln(os.Stderr, "plaintext not valid JSON:", err)
		fmt.Fprintln(os.Stderr, "raw plaintext bytes:", plain)
		os.Exit(6)
	}

	fmt.Println(string(plain))
}
