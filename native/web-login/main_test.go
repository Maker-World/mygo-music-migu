package main

import "testing"

func TestTokenFromURL(t *testing.T) {
	tests := []struct {
		name, url, kind, token string
	}{
		{"legacy redirect", "https://music.migu.cn/v3/user/login?callbackURL=PostToken&token=a+b%2Fc%3D", "passport", "a+b/c="},
		{"fragment callback", "https://music.migu.cn/v5/#/callback?token=short&pacmtoken=a%2Bb", "session", "a+b"},
		{"initial page", loginURL, "", ""},
		{"nested callback parameter", "https://passport.migu.cn/login?callbackURL=https://music.migu.cn/v5/?token=ignored", "", ""},
		{"foreign origin", "https://passport.migu.cn.example.org/?token=ignored", "", ""},
		{"credentials in authority", "https://example.org@passport.migu.cn/?token=ignored", "", ""},
		{"insecure redirect", "http://music.migu.cn/?token=ignored", "", ""},
		{"invalid token", "https://music.migu.cn/?token=a%0D%0Ab", "", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := tokenFromURL(tc.url)
			if got.Kind != tc.kind || got.Token != tc.token {
				t.Errorf("tokenFromURL() = %#v, want kind %q and token %q", got, tc.kind, tc.token)
			}
		})
	}
}
