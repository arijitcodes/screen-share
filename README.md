# 🖥️ Screen Share

### Share your screen *and* system audio with a friend. Peer-to-peer, no accounts, no time limit, no quality cap.

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org) [![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=flat-square&logo=webrtc&logoColor=white)](https://webrtc.org) [![WebSocket](https://img.shields.io/badge/ws-WebSocket-010101?style=flat-square)](https://github.com/websockets/ws) [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript) [![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com) [![Nginx](https://img.shields.io/badge/Nginx-009639?style=flat-square&logo=nginx&logoColor=white)](https://www.nginx.com)

A tiny self-hosted web app: click **Create room**, send your friend the link, hit **Start sharing**. Your screen and *whatever you're hearing on your PC* (games, VLC, social media, anything) go straight to their browser.

## 🤔 Why I built this

I wanted to show a friend a video file with audio over a call, and every free option got in the way:

- 🎮 **Discord** (free tier) caps screen share at 720p.
- 📹 **Google Meet** can't share audio from desktop apps.
- 🕐 **Zoom** (free) cuts calls off at 40 minutes.

So this is a ~400-line WebRTC app that has none of those limits.

## ✨ Features

- 🔗 **One-link rooms**: a random UUID per room, nothing to sign up for
- 🔊 **System audio**: games, media players, browser, all of it (stereo, high-bitrate Opus)
- 🎞️ **Quality presets** (1080p, 1440p, 4K), picked on the host page (bitrate cap, frame rate and sharpness adapt)
- 🔒 **Peer-to-peer and encrypted**: video and audio never touch the server
- 👥 **Choose how many viewers** (1 to 4, or a custom number up to 50)
- 🪶 **Tiny**: one dependency (`ws`), no build step, plain HTML/JS on the page
- 🔐 **Host token**: only the room's creator can host it, the viewer link can't hijack a room
- 📊 **Live ping and quality stats** on both sides (resolution, fps, bitrate, packet loss)
- 🎬 **Built-in local player** (`/player.html`) with subtitles (SRT/VTT), sync and size controls, for movie nights
- ⏯️ **Pause for both**: with the player open, your friend's pause button pauses your movie (otherwise it's switched off, so nothing half-works)
- 🐳 **Docker + nginx ready** for a small VPS

## 🧠 How it works

The two browsers talk to each other directly using **WebRTC**. They just need a middleman once, to swap connection details (this is called *signaling*). That's all the Node server does: it relays small JSON messages over WebSockets.

```mermaid
sequenceDiagram
    participant H as Host (your PC)
    participant S as Signaling server
    participant V as Viewer (friend)
    V->>S: join room
    S->>H: viewer joined
    H->>S: offer
    S->>V: offer
    V->>S: answer
    S->>H: answer
    H-->>V: ICE candidates (relayed both ways)
    Note over H,V: Screen + audio now flow directly, peer to peer
```

## 🚀 Quick start (local)

Requires **Node.js 18+**.

```bash
git clone https://github.com/arijitcodes/screen-share.git
cd screen-share
npm install
npm start
```

1. Open **http://localhost:3000** on the PC that will share (use `localhost`, browsers only allow screen capture on secure origins).
2. Click **Create room**. The link box shows a LAN address (e.g. `http://192.168.x.x:3000/r/...`).
3. Open that link on another device on the same network, click **Join & watch**.
4. Back on the host, click **Start sharing**.

> 💡 If the other device can't connect, allow Node through the Windows firewall:
> ```powershell
> New-NetFirewallRule -DisplayName "screen-share" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
> ```

## 🎬 Using it

**Host** (desktop **Chrome or Edge**):

1. Create a room and send the link.
2. Choose **Max viewers** if you want more than one person, and a **Quality** preset. 4K needs roughly 20-30 Mbps of upload per viewer plus a strong PC, and the shared screen or tab has to be 4K to benefit.
3. Click **Start sharing**, pick **Entire screen**, and tick **Share system audio**.

**Viewer** (any modern browser, phones included): open the link, click **Join & watch**. That click also lets the browser play sound.

### 🔈 Audio notes

- **Playing it in Chrome?** Share the **Chrome Tab** with **tab audio**. Only that tab's sound is sent, so there's no Discord echo and no extra lag.
- Window and tab shares can't carry audio from other apps. To share a game or VLC, share the **entire screen** with system audio on.
- System audio capture includes **everything you hear**, including a Discord call on the same PC, so your friend would hear themselves. Keep the call on another device (e.g. your phone), or route it to a different output.
- Hosting from Firefox or mobile browsers isn't supported (no system audio, or no screen capture at all).

### 📊 Ping and quality

Both sides see live stats under the video: ping (the network round trip), resolution, fps, bitrate, packet loss, and whether Chrome is lowering quality because of bandwidth or CPU. The host sees one line per viewer. The real delay you perceive is usually 100-300 ms higher than the ping, because of capture, encoding and decoding.

### 🎬 Watching a movie together

1. On the host page, click **Open the movie player** (or go to `/player.html` on the app, e.g. `https://share.yourdomain.com/player.html`) in a Chrome tab.
2. Pick the video, then a `.srt` or `.vtt` subtitle file. **Sync -/+0.5s** and **Reset** fix timing, **A-/A+** changes the subtitle size, and **H** hides the top bar.
3. On the host page, click **Start sharing**, choose **Chrome Tab**, select the player tab and tick **Also share tab audio**.

**Pause for both:** keep the player open from the same site as the host page. The host page then shows *Player tab connected*, and when your friend presses pause or play, your movie does too. With no player tab open (YouTube, VLC, games), her pause button is switched off and she stays live with you.

**Preparing files:** Chrome can't decode E-AC-3 (Dolby Digital Plus) audio and can't read subtitles stored inside a video file. Fix both once with [ffmpeg](https://ffmpeg.org):

```bash
# keep the video, convert the audio to AAC stereo
ffmpeg -i movie.mkv -map 0:v:0 -map 0:a:0 -c:v copy -c:a aac -b:a 192k -ac 2 -movflags +faststart movie.mp4

# extract the first embedded text subtitle track
ffmpeg -i movie.mkv -map 0:s:0 movie.srt
```

Picture-based subtitles (PGS, DVD) can't be converted to text this way.

## 🌐 Deploy to a server (Docker + nginx)

Screen capture needs **HTTPS**, so use a domain or subdomain. Plain `http://<ip>` won't work for the host.

```bash
# 1. Start the container (listens on 127.0.0.1:3000 only)
docker compose up -d --build

# 2. Add the nginx site (edit server_name first)
sudo cp screenshare.nginx.conf /etc/nginx/sites-available/screenshare
sudo ln -s /etc/nginx/sites-available/screenshare /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 3. Get a certificate (DNS A record must already point at the server)
sudo certbot --nginx -d share.yourdomain.com
```

- Keep the port binding as `127.0.0.1:3000:3000` in production. Docker bypasses UFW, so `0.0.0.0` would expose the app over plain HTTP. Use `0.0.0.0` only for a local LAN test.
- The nginx config proxies WebSockets and sets long timeouts so signaling stays alive for the whole session.
- Media doesn't pass through the server, so it needs almost no bandwidth or CPU.

## ⚙️ Configuration

| What | Where | Default |
| --- | --- | --- |
| Server port | `PORT` env var | `3000` |
| Quality presets (bitrate, size, fps) | `QUALITY` in `public/index.html` | 1080p smooth (8 Mbps, 60 fps) |
| Max viewers | Host page dropdown (server limit in `server.js`) | `1` (up to `50`) |
| STUN servers | `ICE_CONFIG` in `public/index.html` | Google public STUN |

> **Behind CGNAT or a strict firewall?** A direct connection may fail ("Could not connect"). Add a TURN server to `ICE_CONFIG`. Note that a TURN relay carries all the video traffic, so it needs real bandwidth.

## 📁 Project structure

```
screen-share/
├── server.js               # web server + WebSocket signaling (rooms, relay rules)
├── public/
│   ├── index.html          # the UI and the WebRTC client (host + viewer)
│   └── player.html         # local video player: subtitles + pause sync
├── Dockerfile
├── docker-compose.yml
├── screenshare.nginx.conf  # nginx site config (WebSocket proxy)
├── package.json
└── package-lock.json
```

## 🔐 Privacy & security

- Media is encrypted end to end between the two browsers (DTLS-SRTP).
- The server only sees room IDs, IP addresses and the connection handshake. It never sees video or audio.
- Google's public STUN server only learns that your IP asked for its public address.
- Host and viewers can see each other's IP (inherent to peer-to-peer).
- **The viewer link is the only password**, so share it only with people you trust. The room's max-viewers limit caps who can join.
- Rooms live in memory only and disappear when empty.

## 🛠️ Troubleshooting

| Problem | Fix |
| --- | --- |
| No sound on the viewer | Host must tick **Share system audio** and share the **entire screen** in Chrome/Edge |
| Friend hears themselves | Your call audio is in the capture, move the call to another device |
| Black video while gaming | Use borderless windowed mode instead of exclusive fullscreen |
| Phone can't open the LAN link | Allow port 3000 in the firewall; make sure the PC's network is set to Private |
| "Could not connect" | A network is blocking direct connections, add a TURN server |
| Video starts muted on a phone | The browser blocked autoplay sound, tap the video's unmute button |
| **Create room** does nothing | Open the app via `localhost` or HTTPS (needs a secure origin) |
| No sound in the local player | The file's audio codec (often E-AC-3) isn't supported by Chrome, convert it with ffmpeg (see above) |
| Subtitles inside the video don't show | Browsers can't read embedded subtitles, extract them to `.srt` with ffmpeg |
| Picture is soft at the start | Normal, WebRTC starts low and ramps up over 10-30 s. Share a large tab or window and pick a higher **Quality** preset |
| Friend's pause button does nothing | Pause only works with the player open from the same site as the host page (`/player.html`), the host page shows when it's connected |

## 🚨 Slop Declaration

> **Warning: this repo contains AI slop.** 🍝
>
> Pair-programmed with **Claude**. I told it "make no mistakes" and it said "sure". 🫡 It wrote the code, I asked "are you sure?" a lot, and then we both hit LGTM. 🚀
>
> Any bugs will be split 50-50, no negotiation. 🤝
>
> Bug reports and PRs are welcome. Humans preferred, but I won't ask for ID. 🙏🏻

## 🤝 Contributing

Issues and PRs are welcome. Commits follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, ...).

## 👨🏻‍💻 Author

Built by **Arijit Banerjee**, a Node.js software engineer who likes real-time things. 🔥

[![LinkedIn Badge](https://img.shields.io/badge/-LINKEDIN_@arijitban-0077B5?style=for-the-badge&logo=linkedin&logoColor=white&link=https://linkedin.com/in/arijitban)](https://www.linkedin.com/in/arijitban) [![GitHub Badge](https://img.shields.io/badge/-GITHUB_@arijitcodes-181717?style=for-the-badge&logo=GitHub&logoColor=white&link=https://github.com/ArijitCodes)](https://github.com/ArijitCodes) [![Gmail Badge](https://img.shields.io/badge/-GMAIL_arijit.codes@gmail.com-grey?style=for-the-badge&logo=Gmail&logoColor=D14836&link=mailto:arijit.codes@gmail.com)](mailto:arijit.codes@gmail.com)

🌐 Portfolio: [iamarijit.dev](https://iamarijit.dev)
