// Composer static tables: the emoji picker grid, :name: → emoji tab-completion
// map, and the built-in /slash commands offered by tab-completion.

export const EMOJIS = ['😀','😂','🤣','😊','😍','😘','😎','🤩','🥳','😏','😢','😭','😡','🤔','😴','🙄','👍','👎','👏','🙌','🙏','💪','👋','✌️','🤝','❤️','🔥','✨','🎉','🌹','☕','🍺','🍷','🎶','💯','😅','😜','🤗','😇','👀'];

/** Richer set for the channel-topic picker, grouped so the user can filter.
 *  IRC topics are plain Unicode only — no custom image icons. */
/** Each emoji appears in exactly one group (no cross-category duplicates). */
export const TOPIC_SMILEY_GROUPS = [
  { id: 'faces', icon: '😊', smileys: ['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😎','🤩','🥳','😏','😢','😭','😡','🤔','😴','🙄','😜','🤗','😶'] },
  { id: 'hands', icon: '👍', smileys: ['👍','👎','👏','🙌','🙏','💪','👋','✌️','👌','👀','🤞','🤟','🤘','☝️','✋'] },
  { id: 'hearts', icon: '❤️', smileys: ['❤️','🧡','💛','💚','💙','💜','💕','💖','💗','💘','💝','💞','❣️','💔','✨','⭐','🌟','💯'] },
  { id: 'chat', icon: '💬', smileys: ['💬','💭','🗣️','📢','📣','🔔','🔕','#️⃣','👥','👤','🧑‍💻','💻','⌨️','📱','🛜','📡','🛰️','🏠','🚪','🔗'] },
  { id: 'energy', icon: '⚡', smileys: ['⚡','💡','🔌','🔋','🪫','🔆','🔥','♨️','🌡️','🏭','⚙️','🔧','🛠️','🧯','🛢️','⛽','💨','💧','🌀','☢️'] },
  { id: 'works', icon: '🚚', smileys: ['🚚','🚛','🚜','🚧','🏗️','🧱','🪜','🦺','👷','🔨','🪛','🪓','🪵','🗼','⛑️','🧤','🧰','📏','🔩','🛣️'] },
  { id: 'social', icon: '🤝', smileys: ['🤝','🫂','❤️‍🩹','🏥','👨‍👩‍👧','🎁','🎉','🎊','🏖️','⚽','🎭','📚','🎓','🏕️','🚌','🎟️','🍽️','☕','🥐','🎄'] },
  { id: 'games', icon: '🎲', smileys: ['🎲','🃏','🎴','🀄','♟️','♞','♝','♜','♛','♚','🧩','🎮','🕹️','👾','🎯','🏆','🎱','🎳','🎰','✏️'] },
  { id: 'music', icon: '🎵', smileys: ['🎵','🎶','🎤','🎧','🎸','🎹','🥁','🎺','🎷','🎻','📻'] },
  { id: 'nature', icon: '🌍', smileys: ['🌍','☀️','🌙','🌈','❄️','🌸','🌹','🌲','🌊','⛰️','🍀','🌾'] },
  { id: 'things', icon: '📦', smileys: ['🍺','🍷','🍕','🎂','⌚','📦','🛒','🔑','📷','🕶️','🎈','📎'] },
] as const;

export type TopicSmileyGroupId = typeof TOPIC_SMILEY_GROUPS[number]['id'];

/** Flat unique list (first group wins if a duplicate ever sneaks in). */
export const TOPIC_SMILEYS = [...new Set(TOPIC_SMILEY_GROUPS.flatMap((g) => g.smileys))];

/** FR/EN keywords so the topic picker can filter by text (emoji alone is hard to search). */
export const TOPIC_SMILEY_TAGS: Record<string, string> = {
  '😀': 'sourire smile face', '😃': 'sourire smile', '😄': 'sourire smile', '😁': 'sourire grin',
  '😅': 'sueur sweat', '😂': 'rire laugh mdr', '🤣': 'rire mdr rofl', '😊': 'joie happy',
  '😇': 'ange angel', '🙂': 'sourire smile', '😉': 'clin wink', '😍': 'amour love',
  '🥰': 'amour love', '😘': 'bisou kiss', '😎': 'cool', '🤩': 'etoiles starstruck',
  '🥳': 'fete party', '😏': 'malin smirk', '😢': 'triste sad', '😭': 'pleure cry',
  '😡': 'colere angry', '🤔': 'reflechir think', '😴': 'dodo sleep', '🙄': 'eyeroll',
  '😜': 'clin wink', '🤗': 'calin hug', '😶': 'muet silent',
  '👍': 'pouce ok like', '👎': 'nul dislike', '👏': 'bravo clap', '🙌': 'mains raise',
  '🙏': 'merci please pray', '💪': 'muscle force', '👋': 'salut wave', '✌️': 'victoire peace',
  '🤝': 'accord handshake social entraide', '👌': 'ok', '👀': 'yeux eyes',
  '❤️': 'coeur heart amour', '🧡': 'coeur heart', '💛': 'coeur heart', '💚': 'coeur heart',
  '💙': 'coeur heart bleu enedis ccas', '💜': 'coeur heart', '💕': 'coeur hearts',
  '🔥': 'feu fire energie', '✨': 'brille sparkle', '⭐': 'etoile star', '🌟': 'etoile star',
  '🎉': 'fete party tada social', '🎊': 'fete confetti', '💯': 'cent 100',
  '💬': 'tchat chat irc message bulle', '💭': 'pensee thought', '🗣️': 'parler speak',
  '📢': 'annonce megaphone', '📣': 'annonce megaphone', '🔔': 'cloche bell notif',
  '🔕': 'muet mute', '#️⃣': 'salon channel dieze irc', '👥': 'utilisateurs users groupe',
  '👤': 'utilisateur user pseudo', '🧑‍💻': 'dev code irc', '💻': 'ordinateur computer',
  '⌨️': 'clavier keyboard', '📱': 'telephone mobile', '🛜': 'wifi reseau network',
  '📡': 'antenne satellite irc', '🛰️': 'satellite', '🏠': 'maison salon home',
  '🚪': 'porte join part', '🔗': 'lien link',
  '⚡': 'electricite electric eclair energie edf enedis', '💡': 'ampoule idee light energie',
  '🔌': 'prise plug electricite', '🔋': 'batterie battery', '🪫': 'batterie faible',
  '☀️': 'soleil sun solaire', '🔆': 'lumiere bright', '♨️': 'chaud hot',
  '🌡️': 'temperature', '🏭': 'usine factory energie', '⚙️': 'engrenage gear',
  '🔧': 'cle wrench outil', '🛠️': 'outils tools', '🧯': 'extincteur',
  '🛢️': 'petrole oil baril', '⛽': 'essence gas station gaz', '💨': 'gaz gas vent',
  '💧': 'eau water goutte', '🌀': 'tourbine vent',
  '🚚': 'camion truck enedis nacelle chantier', '🚛': 'camion articule truck',
  '🚜': 'tracteur tractor', '🚧': 'travaux chantier works', '🏗️': 'grue crane chantier nacelle',
  '🧱': 'brique brick', '🪜': 'echelle ladder nacelle', '🦺': 'gilet security',
  '👷': 'ouvrier worker chantier', '🔨': 'marteau hammer', '🪛': 'tournevis',
  '🪓': 'hache axe', '🪵': 'bois wood poteau', '🗼': 'tour tower poteau',
  '⛑️': 'casque helmet', '🧤': 'gants gloves', '🧰': 'boite outils toolbox',
  '📏': 'metre ruler', '🔩': 'boulon nut', '🛣️': 'route road',
  '🫂': 'calin hug social entraide', '❤️‍🩹': 'soin care solidarite',
  '🏥': 'hopital hospital sante ccas', '👨‍👩‍👧': 'famille family',
  '🎁': 'cadeau gift', '🏖️': 'plage beach vacances', '⚽': 'sport foot',
  '🎭': 'theatre culture', '📚': 'livres books', '🎓': 'diplome education',
  '🏕️': 'camping colo', '🚌': 'bus sortie', '🎟️': 'ticket billet',
  '🍽️': 'repas meal', '☕': 'cafe coffee', '🥐': 'croissant', '🎄': 'noel christmas',
  '🎵': 'musique music', '🎶': 'musique notes', '🎤': 'micro mic', '🎧': 'casque headphones',
  '🎸': 'guitare', '🎹': 'piano', '🥁': 'batterie drums', '🎺': 'trompette',
  '🎷': 'saxophone', '🎻': 'violon', '📻': 'radio',
  '🌍': 'terre earth monde', '🌙': 'lune moon', '🌈': 'arc en ciel rainbow',
  '❄️': 'neige snow', '🌸': 'fleur flower', '🌹': 'rose',
  '🍺': 'biere beer', '🍷': 'vin wine', '🍕': 'pizza', '🎂': 'gateau cake',
  '🏆': 'trophee trophy jeu games gagnant', '🎮': 'jeu game video console',
  '🎯': 'cible target jeu dart',
  '🎲': 'des dice jeu games hasard', '🃏': 'cartes cards jeu poker joker',
  '🎴': 'cartes cards hanafuda', '🀄': 'mahjong cartes',
  '♟️': 'echecs chess pion jeu', '♞': 'echecs chess cavalier',
  '♝': 'echecs chess fou', '♜': 'echecs chess tour',
  '♛': 'echecs chess dame reine', '♚': 'echecs chess roi',
  '🧩': 'puzzle jeu', '🕹️': 'joystick manette arcade jeu',
  '👾': 'invader arcade jeu', '🎱': 'billard pool jeu',
  '🎳': 'bowling jeu', '🎰': 'casino machine jeu',
  '✏️': 'crayon bac petitbac mot jeu',
};

const TOPIC_GROUP_TAGS: Record<TopicSmileyGroupId | 'all', string> = {
  all: 'tous all',
  faces: 'visages faces smileys',
  hands: 'gestes hands',
  hearts: 'coeurs hearts',
  chat: 'tchat chat irc salon utilisateurs users',
  energy: 'energie energy electricite gaz edf enedis',
  works: 'chantier works travaux camion nacelle grue enedis poteau',
  social: 'social ccas entraide activites',
  games: 'jeux games cartes des echecs chess poker bac video',
  music: 'musique music',
  nature: 'nature',
  things: 'objets things',
};

function foldSmileyQuery(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9#\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filter smileys by free-text query (keywords + group labels). Empty query → unchanged. */
export function filterTopicSmileys(
  smileys: readonly string[],
  query: string,
  groupId: TopicSmileyGroupId | 'all' = 'all',
): string[] {
  const q = foldSmileyQuery(query);
  if (!q) return [...smileys];
  const tokens = q.split(' ').filter(Boolean);
  return smileys.filter((emoji) => {
    const fromGroups = TOPIC_SMILEY_GROUPS
      .filter((g) => (g.smileys as readonly string[]).includes(emoji))
      .map((g) => TOPIC_GROUP_TAGS[g.id])
      .join(' ');
    const blob = foldSmileyQuery([
      emoji,
      TOPIC_SMILEY_TAGS[emoji] || '',
      TOPIC_GROUP_TAGS[groupId] || '',
      fromGroups,
    ].join(' '));
    return tokens.every((t) => blob.includes(t) || emoji.includes(t));
  });
}

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
