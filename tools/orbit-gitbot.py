#!/usr/bin/env python3
"""Persistent Orbit commit bot — stays connected to IRC and joined to #orbit.

It holds one IRC connection (TLS/6697 — plaintext 6667 is Cloudflare-gated),
auto-reconnects with backoff, and rejoins if kicked. It listens on a Unix
socket; the git post-receive hook connects, writes the announce lines, and
closes — the daemon relays them to the channel, rate-limited to dodge flood.

Env: IRC_HOST IRC_PORT IRC_TLS IRC_NICK IRC_CHANNEL ORBIT_BOT_SOCK
"""
import os
import random
import select
import socket
import ssl
import sys
import time

HOST = os.environ.get("IRC_HOST", "127.0.0.1")
PORT = int(os.environ.get("IRC_PORT", "6697"))
TLS = os.environ.get("IRC_TLS", "1") != "0"
BASENICK = os.environ.get("IRC_NICK", "git")
CHAN = os.environ.get("IRC_CHANNEL", "#orbit")
SOCK = os.environ.get("ORBIT_BOT_SOCK", "/run/orbit-gitbot/sock")
REALNAME = "Orbit commit bot — orbit.tchatou.fr"
SEND_GAP = 0.5   # seconds between channel messages (anti-flood)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)


class IRC:
    def __init__(self):
        self.sock = None
        self.buf = ""
        self.nick = BASENICK
        self.registered = False

    def connect(self):
        raw = socket.create_connection((HOST, PORT), timeout=15)
        if TLS:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            self.sock = ctx.wrap_socket(raw, server_hostname=HOST)
        else:
            self.sock = raw
        self.sock.setblocking(False)
        self.buf = ""
        self.registered = False
        self.nick = BASENICK
        self.send("NICK " + self.nick)
        self.send("USER %s 0 * :%s" % (self.nick, REALNAME))
        log("connecting to %s:%d (tls=%s)…" % (HOST, PORT, TLS))

    def send(self, line):
        self.sock.sendall((line + "\r\n").encode("utf-8", "replace"))

    def pump(self):
        """Read + handle server lines. Returns False when the link drops."""
        try:
            data = self.sock.recv(8192)
        except (ssl.SSLWantReadError, BlockingIOError):
            return True
        except Exception as e:
            log("recv error:", e)
            return False
        if not data:
            log("server closed the connection")
            return False
        self.buf += data.decode("utf-8", "replace")
        while "\r\n" in self.buf:
            line, self.buf = self.buf.split("\r\n", 1)
            self._handle(line)
        return True

    def _handle(self, line):
        if line.startswith("PING"):
            self.send("PONG" + line[4:])
            return
        if " 001 " in line:
            self.registered = True
            log("registered as", self.nick, "→ joining", CHAN)
            self.send("JOIN " + CHAN)
        elif " 433 " in line:  # nick in use
            self.nick = BASENICK + str(random.randint(10, 99))
            self.send("NICK " + self.nick)
        elif " 366 " in line and CHAN.lower() in line.lower():
            log("joined", CHAN)
        elif " KICK " in line and CHAN in line and (" " + self.nick + " ") in (line + " "):
            log("kicked from", CHAN, "→ rejoining")
            self.send("JOIN " + CHAN)


def main():
    # Unix socket the hook talks to.
    d = os.path.dirname(SOCK)
    if d and not os.path.isdir(d):
        os.makedirs(d, exist_ok=True)
    try:
        os.unlink(SOCK)
    except FileNotFoundError:
        pass
    lst = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    lst.bind(SOCK)
    lst.listen(8)
    lst.setblocking(False)
    try:
        os.chmod(SOCK, 0o660)
    except OSError:
        pass
    log("listening on", SOCK)

    irc = IRC()
    clients = {}      # client-socket -> accumulated bytes(str)
    outq = []         # pending lines to relay
    last_send = 0.0
    connected = False
    backoff = 2

    while True:
        if not connected:
            try:
                irc.connect()
                connected = True
                backoff = 2
            except Exception as e:
                log("connect failed:", e, "→ retry in", backoff, "s")
                time.sleep(backoff)
                backoff = min(60, backoff * 2)
                continue

        watch = [irc.sock, lst] + list(clients.keys())
        try:
            r, _, _ = select.select(watch, [], [], 1.0)
        except Exception:
            r = []

        for s in r:
            if s is irc.sock:
                if not irc.pump():
                    try:
                        irc.sock.close()
                    except Exception:
                        pass
                    connected = False
                    time.sleep(backoff)
                    backoff = min(60, backoff * 2)
                    break
            elif s is lst:
                try:
                    c, _ = lst.accept()
                    c.setblocking(False)
                    clients[c] = ""
                except Exception:
                    pass
            else:
                try:
                    chunk = s.recv(4096)
                except Exception:
                    chunk = b""
                if not chunk:
                    acc = clients.pop(s, "")
                    for ln in acc.splitlines():
                        if ln.strip():
                            outq.append(ln)
                    try:
                        s.close()
                    except Exception:
                        pass
                else:
                    clients[s] += chunk.decode("utf-8", "replace")

        # relay queued lines, rate-limited, once registered
        now = time.time()
        if outq and connected and irc.registered and now - last_send >= SEND_GAP:
            line = outq.pop(0)
            try:
                irc.send("PRIVMSG %s :%s" % (CHAN, line))
                last_send = now
            except Exception as e:
                log("relay failed:", e)
                outq.insert(0, line)
                connected = False


if __name__ == "__main__":
    main()
