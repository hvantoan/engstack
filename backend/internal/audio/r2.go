package audio

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// R2 là client S3-compatible tối thiểu cho Cloudflare R2 (SigV4, chỉ
// HeadObject + PutObject — tránh kéo cả AWS SDK cho 2 thao tác).
type R2 struct {
	endpoint  string // https://<account>.r2.cloudflarestorage.com
	bucket    string
	accessKey string
	secretKey string
	http      *http.Client
}

func NewR2(accountID, accessKey, secretKey, bucket string) *R2 {
	return &R2{
		endpoint:  fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID),
		bucket:    bucket,
		accessKey: accessKey,
		secretKey: secretKey,
		http:      &http.Client{Timeout: 30 * time.Second},
	}
}

// Configured báo client có đủ credentials để gọi R2 chưa.
func (r *R2) Configured() bool {
	return r != nil && r.accessKey != "" && r.secretKey != "" && r.bucket != "" && r.endpoint != ""
}

// Exists báo object đã tồn tại trên bucket.
func (r *R2) Exists(ctx context.Context, key string) (bool, error) {
	req, err := r.sign(ctx, http.MethodHead, key, nil, "")
	if err != nil {
		return false, err
	}
	res, err := r.http.Do(req)
	if err != nil {
		return false, err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("r2 HEAD %s: status %d", key, res.StatusCode)
	}
}

// Put upload body lên key với content-type + cache-control cho trước.
func (r *R2) Put(ctx context.Context, key string, body []byte, contentType, cacheControl string) error {
	req, err := r.sign(ctx, http.MethodPut, key, body, contentType)
	if err != nil {
		return err
	}
	if cacheControl != "" {
		req.Header.Set("Cache-Control", cacheControl)
	}
	res, err := r.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return fmt.Errorf("r2 PUT %s: status %d: %s", key, res.StatusCode, msg)
	}
	return nil
}

func (r *R2) sign(ctx context.Context, method, key string, body []byte, contentType string) (*http.Request, error) {
	rawURL := fmt.Sprintf("%s/%s/%s", r.endpoint, r.bucket, url.PathEscape(key))
	req, err := http.NewRequestWithContext(ctx, method, rawURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	payloadHash := sha256Hex(body)

	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	// Canonical request — ký đúng các header đã set.
	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"
	if contentType == "" {
		signedHeaders = "host;x-amz-content-sha256;x-amz-date"
	}
	var canonicalHeaders strings.Builder
	if contentType != "" {
		fmt.Fprintf(&canonicalHeaders, "content-type:%s\n", contentType)
	}
	fmt.Fprintf(&canonicalHeaders, "host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		req.URL.Host, payloadHash, amzDate)

	canonicalURI := "/" + r.bucket + "/" + url.PathEscape(key)
	canonicalRequest := strings.Join([]string{
		method, canonicalURI, "", canonicalHeaders.String(), signedHeaders, payloadHash,
	}, "\n")

	scope := dateStamp + "/auto/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + scope + "\n" + sha256Hex([]byte(canonicalRequest))

	kDate := hmacSHA256([]byte("AWS4"+r.secretKey), dateStamp)
	kRegion := hmacSHA256(kDate, "auto")
	kService := hmacSHA256(kRegion, "s3")
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))

	req.Header.Set("Authorization", fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		r.accessKey, scope, signedHeaders, signature))
	return req, nil
}

func sha256Hex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}
