package main

import (
	"context"
	"encoding/json"
	"io"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

const (
	loginURL     = "https://passport.migu.cn/login?sourceid=220029&apptype=2&forceAuthn=false&isPassive=false&display=pc&callbackURL=PostToken&hideRegister=1&hideForgetPass=1"
	loginTimeout = 4*time.Minute + 30*time.Second
)

type result struct {
	Kind  string `json:"kind,omitempty"`
	Token string `json:"token,omitempty"`
	Error string `json:"error,omitempty"`
}

func main() {
	// The parent holds stdin open until it wants the login window to close.
	// Bound startup and shutdown even if the native event loop stops responding.
	var sent sync.Once
	reply := func(r result) {
		sent.Do(func() { _ = json.NewEncoder(os.Stdout).Encode(r) })
	}
	parentClosed := make(chan struct{})
	go func() {
		_, _ = io.Copy(io.Discard, os.Stdin)
		close(parentClosed)
		time.Sleep(3 * time.Second)
		reply(result{Error: "closed"})
		os.Exit(0)
	}()
	deadline := time.AfterFunc(loginTimeout+5*time.Second, func() {
		reply(result{Error: "timeout"})
		os.Exit(0)
	})
	defer deadline.Stop()

	outcome := make(chan result, 1)
	mygo.App.SetName("咪咕音乐登录")
	mygo.App.OnWindowAllClosed(func() {})
	mygo.App.WhenReady(func() {
		if !mygo.WebViewAvailable() {
			outcome <- result{Error: "setup"}
			mygo.App.Quit()
			return
		}
		go func() {
			defer mygo.App.Quit()
			outcome <- webLogin(parentClosed)
		}()
	})

	// stdout is the private pipe to the plugin. Emit only the final result.
	if mygo.App.Run() != nil {
		reply(result{Error: "setup"})
		return
	}
	select {
	case r := <-outcome:
		reply(r)
	default:
		reply(result{Error: "closed"})
	}
}

func webLogin(parentClosed <-chan struct{}) result {
	session := mygo.NewEphemeralSession()
	window := mygo.NewWindow(mygo.WindowOptions{
		Title: "登录咪咕音乐", Width: 520, Height: 680, MinWidth: 360, MinHeight: 480,
		Page: mygo.PageOptions{Session: session, Untrusted: true, DevTools: mygo.DevToolsDisabled},
	})
	defer window.Close()

	page := window.Page()
	callback := make(chan result, 1)
	closed := make(chan struct{})
	failed := make(chan struct{}, 1)
	reportURL := func(raw string) bool {
		if candidate := tokenFromURL(raw); candidate.Token != "" {
			select {
			case callback <- candidate:
			default:
			}
			return true
		}
		return false
	}
	window.OnClosed(func() { close(closed) })
	page.OnWillNavigate(func(event *mygo.NavigateEvent) {
		// The Passport page can redirect through the legacy music endpoint,
		// which may immediately redirect again and drop the query string.
		if _, ok := miguURL(event.URL); !ok || reportURL(event.URL) {
			event.PreventDefault()
		}
	})
	page.OnDidNavigate(func(raw string) { reportURL(raw) })
	page.OnDidFailLoad(func(err *mygo.LoadError) {
		if err != nil && err.Code != -999 && err.URL == loginURL {
			select {
			case failed <- struct{}{}:
			default:
			}
		}
	})
	if err := page.LoadURL(loginURL); err != nil {
		return result{Error: "load"}
	}
	// MyGo Music starts helpers with a hidden console on Windows. Show the
	// window again after creation so Windows honors the visible state.
	window.Show()
	window.Focus()

	ctx, cancel := context.WithTimeout(context.Background(), loginTimeout)
	defer cancel()
	ticker := time.NewTicker(750 * time.Millisecond)
	defer ticker.Stop()
	probes := make(chan result, 1)
	probing := false
	for {
		select {
		case <-parentClosed:
			return result{Error: "closed"}
		case <-closed:
			return result{Error: "closed"}
		case <-ctx.Done():
			return result{Error: "timeout"}
		case <-failed:
			return result{Error: "load"}
		case candidate := <-callback:
			return candidate
		case candidate := <-probes:
			probing = false
			if candidate.Token != "" {
				return candidate
			}
		case <-ticker.C:
			if !probing {
				probing = true
				// Keep cancellation responsive if the system WebView stalls.
				go func() { probes <- sessionToken(ctx, page, session) }()
			}
		}
	}
}

func sessionToken(ctx context.Context, page *mygo.Page, session *mygo.Session) result {
	cookies, _ := session.Cookies.List(mygo.CookieFilter{Name: "pacmtoken", Domain: "migu.cn"})
	for _, cookie := range cookies {
		value, err := url.PathUnescape(cookie.Value)
		if err != nil {
			value = cookie.Value
		}
		if token := cleanToken(value); token != "" {
			return result{Kind: "session", Token: token}
		}
	}

	// Read only the website SDK's session key, and check the origin again
	// inside the evaluation in case the page has since navigated.
	probe, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	value, _ := page.EvalContext(probe, `(() => {
		if (location.origin !== "https://music.migu.cn" &&
		    location.origin !== "https://passport.migu.cn") return "";
		for (const store of [localStorage, sessionStorage]) {
			const raw = store.getItem("mg_auth_pacmtoken");
			if (!raw) continue;
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed === "string") return parsed;
			} catch {}
			return raw;
		}
		return "";
	})()`)
	text, _ := value.(string)
	return result{Kind: "session", Token: cleanToken(text)}
}

func miguURL(raw string) (*url.URL, bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil {
		return nil, false
	}
	switch u.Host {
	case "passport.migu.cn", "music.migu.cn", "y.migu.cn", "c.musicapp.migu.cn":
		return u, true
	default:
		return nil, false
	}
}

func tokenFromURL(raw string) result {
	u, ok := miguURL(raw)
	if !ok {
		return result{}
	}
	fragment := u.EscapedFragment()
	if _, query, found := strings.Cut(fragment, "?"); found {
		fragment = query
	}
	var passport string
	for _, query := range []string{u.RawQuery, fragment} {
		for pair := range strings.SplitSeq(query, "&") {
			key, encoded, found := strings.Cut(pair, "=")
			if !found {
				continue
			}
			// Passport appends the token directly. Preserve literal pluses.
			value, err := url.PathUnescape(encoded)
			if err != nil {
				continue
			}
			token := cleanToken(value)
			if token == "" {
				continue
			}
			switch strings.ToLower(key) {
			case "pacmtoken":
				return result{Kind: "session", Token: token}
			case "token", "ptoken", "utoken":
				if passport == "" {
					passport = token
				}
			}
		}
	}
	if passport != "" {
		return result{Kind: "passport", Token: passport}
	}
	return result{}
}

func cleanToken(value string) string {
	if len(value) == 0 || len(value) > 16384 || strings.EqualFold(value, "null") || strings.EqualFold(value, "undefined") {
		return ""
	}
	for _, c := range value {
		if c <= ' ' || c > '~' || c == ';' || c == ',' || c == '"' {
			return ""
		}
	}
	return value
}
