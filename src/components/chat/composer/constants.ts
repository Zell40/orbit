// Composer static tables: the emoji picker grid, :name: → emoji tab-completion
// map, and the built-in /slash commands offered by tab-completion.

export const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤩','🥳','😏','😢','😭','😡','🤔','😴','🙄','👍','👎','👏','🙌','🙏','💪','👋','✌️','🤝','❤️','🔥','✨','🎉','🌹','☕','🍺','🍷','🎶','💯','😅','😜','🤗','😇','👀'];

/** Richer set for the channel-topic picker, grouped so the user can filter. */
export const TOPIC_SMILEY_GROUPS = [
  { id: 'faces', icon: '😊', smileys: ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😎','🤩','🥳','😏','😢','😭','😡','🤔','😴','🙄','😜','🤗','😶'] },
  { id: 'hands', icon: '👍', smileys: ['👍','👎','👏','🙌','🙏','💪','👋','✌️','🤝','👌','👀'] },
  { id: 'hearts', icon: '❤️', smileys: ['❤️','🧡','💛','💚','💙','💜','💕','🔥','✨','⭐','🌟','🎉','🎊','💯'] },
  { id: 'music', icon: '🎵', smileys: ['🎵','🎶','🎤','🎧','🎸','🎹','🥁','🎺','🎷','🎻','📻'] },
  { id: 'nature', icon: '🌍', smileys: ['🌍','☀️','🌙','🌈','⚡','❄️','🌸','🌹'] },
  { id: 'things', icon: '💡', smileys: ['💬','📢','🔔','💡','🏠','☕','🍺','🍷','🍕','🎂','🏆','🎮','⚽','🎯'] },
] as const;

export type TopicSmileyGroupId = typeof TOPIC_SMILEY_GROUPS[number]['id'];

export const TOPIC_SMILEYS = TOPIC_SMILEY_GROUPS.flatMap((g) => g.smileys);

// :name: → emoji, for tab-completion in the composer.
export const EMOJI_NAMES: Record<string, string> = {
  sourire: '😀', rire: '😂', mdr: '🤣', joie: '😊', amour: '😍', bisou: '😘',
  cool: '😎', etoiles: '🤩', fete: '🥳', malin: '😏', triste: '😢', pleure: '😭',
  colere: '😡', reflechir: '🤔', dodo: '😴', clindoeil: '😜', calin: '🤗', ange: '😇',
  yeux: '👀', pouce: '👍', nul: '👎', bravo: '👏', mains: '🙌', merci: '🙏',
  muscle: '💪', salut: '👋', victoire: '✌️', accord: '🤝', coeur: '❤️', feu: '🔥',
  brille: '✨', tada: '🎉', rose: '🌹', cafe: '☕', biere: '🍺', vin: '🍷',
  musique: '🎶', cent: '💯', heart: '❤️', fire: '🔥', smile: '😀', laugh: '😂',
  ok: '👌', wave: '👋', party: '🥳', think: '🤔', wink: '😉', sun: '☀️', star: '⭐',
};

// Slash commands offered by tab-completion (with a leading '/').
export const SLASH_COMMANDS = [
  'away', 'ban', 'clear', 'deop', 'help', 'ignore', 'invite', 'join', 'kick',
  'list', 'me', 'mode', 'msg', 'names', 'nick', 'notice', 'op', 'part', 'query',
  'quit', 'topic', 'unignore', 'voice', 'whois',
];
