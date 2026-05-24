// 复制自 upstream/EdgeAPI/internal/encrypt/method.go
// (BSD-3-Clause, Copyright (c) 2020, LiuXiangChao)
// 用于 Phase 3 Step 2 token 互通 self-test,不在生产 build 链路。
package encrypt

type MethodInterface interface {
	Init(key []byte, iv []byte) error
	Encrypt(src []byte) (dst []byte, err error)
	Decrypt(dst []byte) (src []byte, err error)
}
