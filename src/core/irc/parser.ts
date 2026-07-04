// IRCv3 message parser (message-tags aware).
import type { IrcMessage } from './types';

const TAG_UNESCAPE: Record<string, string> = {
  ':': ';', s: ' ', '\\': '\\', r: '\r', n: '\n',
};

function unescapeTagValue(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && i + 1 < value.length) {
      out += TAG_UNESCAPE[value[i + 1]] ?? value[i + 1];
      i++;
    } else {
      out += value[i];
    }
  }
  return out;
}

export function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of raw.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) tags[part] = '';
    else tags[part.slice(0, eq)] = unescapeTagValue(part.slice(eq + 1));
  }
  return tags;
}

export function parseLine(line: string): IrcMessage {
  const msg: IrcMessage = {
    raw: line, tags: {}, prefix: '', nick: '', user: '', host: '',
    command: '', params: [],
  };
  let rest = line;

  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    if (sp === -1) { msg.tags = parseTags(rest.slice(1)); return msg; } // tags only — malformed
    msg.tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1).trimStart();
  }

  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    if (sp === -1) { msg.prefix = rest.slice(1); return msg; } // source only — malformed
    msg.prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1).trimStart();
    // prefix = nick!user@host  OR  servername
    const bang = msg.prefix.indexOf('!');
    const at = msg.prefix.indexOf('@');
    if (bang !== -1) {
      msg.nick = msg.prefix.slice(0, bang);
      msg.user = msg.prefix.slice(bang + 1, at === -1 ? undefined : at);
      msg.host = at === -1 ? '' : msg.prefix.slice(at + 1);
    } else if (at !== -1) {
      msg.nick = msg.prefix.slice(0, at);
      msg.host = msg.prefix.slice(at + 1);
    } else {
      msg.nick = msg.prefix;
    }
  }

  // command + params
  const trailingIdx = rest.indexOf(' :');
  let trailing: string | null = null;
  if (rest.startsWith(':')) {
    trailing = rest.slice(1);
    rest = '';
  } else if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    rest = rest.slice(0, trailingIdx);
  }
  const tokens = rest.split(' ').filter(Boolean);
  msg.command = (tokens.shift() ?? '').toUpperCase();
  msg.params = tokens;
  if (trailing !== null) msg.params.push(trailing);
  return msg;
}
