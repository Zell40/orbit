#!/usr/bin/env python3
"""GitHub-style commit announcer for the self-hosted Orbit git server.

Called from the bare repo's post-receive hook with: <ref> <oldrev> <newrev>.
Connects to the IRC server, joins the channel, posts a summary + per-commit
lines (mIRC-coloured — the Orbit client renders them), then quits. Best-effort:
any failure is swallowed so it never blocks a push/deploy.

Env overrides: IRC_HOST IRC_PORT IRC_NICK IRC_CHANNEL ORBIT_REPO COMPARE_BASE
"""
import os
import random
import socket
import ssl
import subprocess
import sys
import time

HOST = os.environ.get("IRC_HOST", "127.0.0.1")
# TLS/6697 bypasses the network's Cloudflare connection check (the plaintext
# 6667 port is gated). Verification is off because we connect to 127.0.0.1.
PORT = int(os.environ.get("IRC_PORT", "6697"))
TLS = os.environ.get("IRC_TLS", "1") != "0"
NICK = os.environ.get("IRC_NICK", "git")
CHAN = os.environ.get("IRC_CHANNEL", "#orbit")
REPO = os.environ.get("ORBIT_REPO", os.getcwd())
COMPARE = os.environ.get("COMPARE_BASE", "https://codeberg.org/reversefr/orbit")
BOT_SOCK = os.environ.get("ORBIT_BOT_SOCK", "/run/orbit-gitbot/sock")
PROJECT = "orbit"
MAX_COMMITS = 6
ZERO = "0" * 40

# mIRC colour helpers (\x03NN). 03 green, 14 grey, 10 teal, 02 blue.
def c(n, s):
    return "\x03%02d%s\x03" % (n, s)
def b(s):
    return "\x02%s\x02" % s

def git(*args):
    try:
        return subprocess.run(["git", "-C", REPO, *args],
                              capture_output=True, text=True, timeout=8).stdout.strip()
    except Exception:
        return ""

def build_lines(ref, old, new):
    branch = ref.rsplit("/", 1)[-1]
    new_branch = old == ZERO
    rng = new if new_branch else f"{old}..{new}"
    args = ["log", "--reverse", "--format=%h\x1f%an\x1f%s"]
    if new_branch:
        args.append("-%d" % MAX_COMMITS)
    args.append(rng)
    raw = git(*args).strip()
    commits = []
    for line in raw.splitlines():
        p = line.split("\x1f")
        if len(p) == 3:
            commits.append({"hash": p[0], "author": p[1], "subject": p[2]})
    if not commits:
        return []
    # file stat counts (added / deleted / modified)
    a = d = m = 0
    if not new_branch:
        for st in git("diff", "--name-status", rng).splitlines():
            k = st[:1]
            if k == "A": a += 1
            elif k == "D": d += 1
            elif k in ("M", "R", "C"): m += 1
    n = str(len(commits)) if new_branch else (git("rev-list", "--count", rng) or str(len(commits)))
    pusher = commits[-1]["author"]
    tag = b("[" + c(3, PROJECT) + "]")
    url = COMPARE + ("/src/branch/" + branch if new_branch
                     else "/compare/%s...%s" % (old[:12], new[:12]))
    plural = "" if n == "1" else "s"
    head = "%s %s pushed %s commit%s to %s [%s/%s/%s] %s" % (
        tag, b(pusher), n, plural, b(branch),
        c(3, "+%d" % a), c(4, "-%d" % d), c(10, "±%d" % m), url)
    lines = [head]
    shown = commits[-MAX_COMMITS:]
    for cm in shown:
        lines.append("%s %s %s - %s" % (tag, cm["author"], c(14, cm["hash"]), cm["subject"]))
    extra = int(n) - len(shown) if n.isdigit() else 0
    if extra > 0:
        lines.append("%s %s" % (tag, c(14, "... and %d more commit%s" % (extra, "" if extra == 1 else "s"))))
    return lines

def send_via_daemon(lines):
    """Hand the lines to the persistent bot over its Unix socket. Returns True
    if the daemon accepted them; False if it isn't running (→ transient fallback)."""
    try:
        c = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        c.settimeout(3)
        c.connect(BOT_SOCK)
        c.sendall(("\n".join(lines) + "\n").encode("utf-8", "replace"))
        c.close()
        return True
    except Exception:
        return False


def announce(lines):
    nick = NICK
    sock = socket.create_connection((HOST, PORT), timeout=8)
    if TLS:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        s = ctx.wrap_socket(sock, server_hostname=HOST)
    else:
        s = sock
    s.settimeout(8)
    def send(x):
        s.sendall((x + "\r\n").encode("utf-8", "replace"))
    send("NICK " + nick)
    send("USER %s 0 * :Orbit commit announcer" % nick)
    buf, registered, t0 = "", False, time.time()
    while time.time() - t0 < 12 and not registered:
        try:
            data = s.recv(4096).decode("utf-8", "replace")
        except socket.timeout:
            break
        if not data:
            break
        buf += data
        while "\r\n" in buf:
            line, buf = buf.split("\r\n", 1)
            if line.startswith("PING"):
                send("PONG" + line[4:])
            elif " 001 " in line:
                registered = True
            elif " 433 " in line:  # nick in use
                nick = NICK + str(random.randint(100, 999))
                send("NICK " + nick)
    if not registered:
        s.close(); return False
    send("JOIN " + CHAN)
    time.sleep(0.7)
    for ln in lines:
        send("PRIVMSG %s :%s" % (CHAN, ln))
        time.sleep(0.6)  # self-pace to avoid excess-flood
    time.sleep(0.4)
    send("QUIT :pushed")
    try:
        s.close()
    except Exception:
        pass
    return True

def main():
    if len(sys.argv) < 4:
        return
    ref, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
    if new == ZERO:  # branch deletion — skip
        return
    lines = build_lines(ref, old, new)
    if not lines:
        return
    # Prefer the always-connected daemon; fall back to a transient connection.
    if send_via_daemon(lines):
        sys.stderr.write("irc-announce: queued %d lines via daemon\n" % len(lines))
        return
    try:
        ok = announce(lines)
        sys.stderr.write("irc-announce: %s (%d lines, transient) \n" %
                         ("ok" if ok else "not registered", len(lines)))
    except Exception as e:
        sys.stderr.write("irc-announce: failed: %s\n" % e)

if __name__ == "__main__":
    main()
