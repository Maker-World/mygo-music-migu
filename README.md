# 咪咕音乐 · MyGo Music 插件

在 [MyGo Music](https://mygo-music.egoist.dev) 里听咪咕音乐，用的是 [music.migu.cn](https://music.migu.cn/v5/) 网页版自己的接口。

需要 MyGo Music **0.1.21** 及以上。

## 安装

任选一种：

1. **在插件页一键安装**：打开 [mygo-music.egoist.dev/zh/plugins](https://mygo-music.egoist.dev/zh/plugins)，找到「migu」点安装，会唤起 MyGo Music 并询问是否安装。
2. **在应用里从 GitHub 安装**：MyGo Music → 设置 → 插件 → `+`，填入仓库：

   ```text
   Maker-World/mygo-music-migu
   ```

   也可以填完整地址 `https://github.com/Maker-World/mygo-music-migu`。
3. **用安装链接**：GitHub 不让 README 里的 `mygo-music://` 链接点击，把下面这行复制到浏览器地址栏打开即可：

   ```text
   mygo-music://install-plugin?repo=Maker-World/mygo-music-migu
   ```

4. **从 ZIP 安装**：在 设置 → 插件 → `+` 里直接选择插件 ZIP。网页登录需要带登录助手的对应平台 ZIP，文件名包含 `darwin-arm64`、`darwin-amd64`、`windows-arm64` 或 `windows-amd64`。GitHub 的 [main.zip](https://github.com/Maker-World/mygo-music-migu/archive/refs/heads/main.zip) 是源码包，可用来扫码登录。
5. **手动安装**：把仓库克隆或解压出来的整个文件夹放进插件目录（设置 → 插件 → `+` → 显示插件文件夹），重启 MyGo Music。

通过前三种方式装的，有新提交时会在 设置 → 插件 里提示更新。

装好后在左上角的来源切换里选「咪咕音乐」，点左下角账号处的「登录」。默认显示二维码，用咪咕音乐 App 扫码并确认。

如需使用短信验证码、密码或 SIM 登录，可在 **设置 → 插件 → 咪咕音乐 → 登录方式** 选择「网页登录」。MyGo Music 0.1.23 起显示下拉菜单，0.1.21 和 0.1.22 可在文本框填入 `web`，留空时使用扫码登录。

在 macOS 或 Windows 上，从对应平台的 ZIP 安装后，在插件设置中点击「允许程序」。发起网页登录时，插件会直接打开咪咕官方登录表单。关闭咪咕登录窗口即可取消。如果提示无法启动助手，请检查安装包与程序权限。其他系统可在插件设置中选择「扫码登录」。

插件加载时会检查续期时间。MyGo Music 运行期间，插件每 30 分钟尝试续期，遇到网络故障会保留原会话，并在 5 分钟后重试。遇到接口要求重新登录时，插件会先尝试续期。咪咕确认会话失效后，请重新登录。

## 能做什么

不登录：

- 搜索歌曲、专辑（含数字专辑）、歌手、歌单，搜索联想
- 首页：精选歌单、新歌速递、精选榜单
- 排行榜、歌单广场（按标签）、歌手（华语 / 欧美 / 日韩 · 男 / 女 / 组合）
- 专辑、歌手、歌单详情
- 电台：时序电台、乐游播客等
- 歌词（LRC，有翻译时带翻译）
- 播放免费歌曲（标准音质）

登录后（在咪咕音乐 App 扫码，或在咪咕网页用短信 / 密码 / SIM）：

- 我喜欢的：查看、红心 / 取消
- 我的歌单：创建、重命名、删除、加歌、移除歌曲；收藏 / 取消收藏歌单
- 收藏的专辑
- 今日推荐、私人FM、上瘾电台、听见不同
- 账号有权限的高品质（HQ）与无损（SQ / FLAC），按 MyGo 设置里的音质请求，拿不到就降一级

会员歌曲在没有会员的账号下只能试听，插件会给出咪咕的提示。

## 声明

- **非官方项目**：本插件由个人开发者出于学习和个人使用目的编写，与咪咕音乐、咪咕文化科技有限公司及中国移动没有任何关联，也未获得其授权或认可。「咪咕」「咪咕音乐」等名称和商标归其各自权利人所有，此处仅用于说明插件对接的服务。
- **只做网页版能做的事**：插件调用的是 [music.migu.cn](https://music.migu.cn/v5/) 网页版在浏览器里公开使用的接口，能看、能听的内容与在浏览器里登录同一账号完全一致。它不绕过会员、付费、试听或地区限制，不提供下载，不破解或转存任何音频文件；会员歌曲在没有会员的账号下仍然只能试听。
- **不收集任何数据**：扫码登录在你手机上的咪咕音乐 App 里确认，网页登录在咪咕自己的页面完成，插件都拿不到你的密码。登录凭据只保存在你本机的 MyGo Music 里，只发往咪咕自己的服务器；插件没有自己的服务器，不收集、不上传任何个人信息或使用数据。
- **版权归原作者**：所有歌曲、歌词、封面等内容的版权归其权利人所有，请支持正版，需要高品质或会员内容请在咪咕音乐开通相应服务。
- **风险自担**：本插件按「现状」提供，不对其可用性、稳定性作任何保证。咪咕可能随时调整接口，导致功能失效；使用本插件即表示你同意自行承担使用风险，并遵守[咪咕用户服务协议](https://passport.migu.cn/portal/protocol?sourceid=220001)及相关法律法规。请勿将本插件用于商业用途或任何违反上述协议的用途。
- **侵权联系**：如果咪咕或其他权利人认为本项目侵犯了其合法权益，请通过本仓库的 [Issues](https://github.com/Maker-World/mygo-music-migu/issues) 联系，我会在核实后第一时间修改或删除相关内容。

## 开发

```bash
npm test           # 离线测试
npm run test:live  # 对真实咪咕接口跑一遍不需要登录的功能
```

`index.js` 末尾打包了 [jsQR](https://github.com/cozmo/jsQR)（Apache-2.0）和 [jpeg-js](https://github.com/jpeg-js/jpeg-js)（BSD-3-Clause）的解码器，用来读出咪咕以图片形式给出的二维码，许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

开发时把这个文件夹放进（或软链接到）插件目录，改完 `index.js` 重启 MyGo Music 即可生效。

构建带网页登录助手的安装包需要 Node.js、Go 1.27.3 或以上及 `zip`。在 macOS 上可构建以下四个 ZIP，输出到 `dist/`，然后在 MyGo Music 的插件设置中导入对应的包。

```bash
bash scripts/package-web-login.sh darwin-arm64 darwin-amd64 windows-arm64 windows-amd64
go -C native/web-login test ./...
```

登录助手通过独立的系统 WebView 打开咪咕 Passport 登录页，使用临时网页会话。插件通过进程管道接收咪咕返回的令牌，向咪咕验证后保存到 MyGo Music 的插件存储。进程接入参考了 [汽水音乐插件](https://github.com/lane128/mygo-music-qishui)，登录回调处理参考了 [MiguWave](https://github.com/horizon0514/MiguWave)。
