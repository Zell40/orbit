import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseNickServInfo, parseNickServAlist, describeAlistAccess, alistCanInvite,
  parseNickServOptionPills, sendChanServInvite, parseNickServGlist, parseNickServList,
  parseNickServAjoin, mergeAlistAndAjoin,
} from './nickserv-info';

const FR = `\u0002Informations pour le compte Harry\u0002 :
Enregistré          : déc. 12 15:04:22 2019 CET (6 ans, 280 jours)
Dernière adresse    : Harry@cloak.reseau-entrenous.fr
Vu pour la dernière fois : maintenant
Adresse e-mail      : ha***@example.com
vHost               : user/harry
Langue              : Français
Options             : Kill, Secure, HideEmail
Nicks               : Harry, Harry2`;

const EN = `Information for account Zell:
Registered          : Jan 02 10:00:00 2021 UTC
                      (4 years ago)
Last addr           : Zell@host
Last seen           : now
Email address       : zell@example.com
Language            : English
Options             : Secure, Private`;

describe('parseNickServInfo', () => {
  it('parses French Anope INFO into labelled rows', () => {
    const info = parseNickServInfo(FR, 'fallback');
    expect(info.account).toBe('Harry');
    expect(info.rows.map((r) => r.key)).toEqual([
      'Enregistré',
      'Dernière adresse',
      'Vu pour la dernière fois',
      'Adresse e-mail',
      'vHost',
      'Langue',
      'Options',
      'Nicks',
    ]);
    expect(info.rows.find((r) => r.key === 'Adresse e-mail')?.value).toBe('ha***@example.com');
    expect(info.rows.find((r) => r.key === 'Options')?.pills).toEqual(['Kill', 'Secure', 'HideEmail']);
  });

  it('merges wrapped English continuation lines', () => {
    const info = parseNickServInfo(EN);
    expect(info.account).toBe('Zell');
    expect(info.rows[0].value).toBe('Jan 02 10:00:00 2021 UTC (4 years ago)');
    expect(info.rows.find((r) => r.key === 'Email address')?.value).toBe('zell@example.com');
  });

  it('skips the end-of-info footer', () => {
    const info = parseNickServInfo('Information for account A:\nRegistered : now\nEnd of Info');
    expect(info.rows).toHaveLength(1);
    expect(info.account).toBe('A');
  });

  it('reads the French “à propos du pseudo” header', () => {
    const info = parseNickServInfo('Informations à propos du pseudo Harry :\nCompte : Harry (ID : 1)');
    expect(info.account).toBe('Harry');
    expect(info.rows[0]).toEqual({ key: 'Compte', value: 'Harry (ID : 1)' });
  });
});

const ALIST_FR = `Salons auxquels le pseudo Harry a accès :
Numéro  Salon                Accès   Description
1       #EntreNous           FONDATEUR
2       #help                AOP     Salon d'aide
Fin de la liste d'accès aux salons.`;

const ALIST_EN = `Channels that nick Zell has access on:
Number  Channel              Access  Description
1       #orbit               Founder
2       #dev                 SOP     Builders
End of channel access list.`;

describe('parseNickServAlist', () => {
  it('parses a French numbered ALIST table', () => {
    expect(parseNickServAlist(ALIST_FR)).toEqual([
      { channel: '#EntreNous', access: 'FONDATEUR', description: '', noExpire: false },
      { channel: '#help', access: 'AOP', description: "Salon d'aide", noExpire: false },
    ]);
  });

  it('parses an English numbered ALIST table', () => {
    expect(parseNickServAlist(ALIST_EN)).toEqual([
      { channel: '#orbit', access: 'Founder', description: '', noExpire: false },
      { channel: '#dev', access: 'SOP', description: 'Builders', noExpire: false },
    ]);
  });

  it('keeps Anope ! as no-expire, not as part of the channel name', () => {
    expect(parseNickServAlist('1 !#Aide.chat AOP Help')).toEqual([
      { channel: '#Aide.chat', access: 'AOP', description: 'Help', noExpire: true },
    ]);
    expect(parseNickServAlist('2: !#Aide.chat = AOP')).toEqual([
      { channel: '#Aide.chat', access: 'AOP', description: '', noExpire: true },
    ]);
    expect(parseNickServAlist('3: #edfgdf.chat = Fondateurice')).toEqual([
      { channel: '#edfgdf.chat', access: 'Fondateurice', description: '', noExpire: false },
    ]);
  });

  it('parses Entre Nous numbered colon-equals ALIST lines', () => {
    const raw = `Liste des canaux auxquels Zell a accès :
1: # = Fondateurice
2: !#1000Bornes.chat = Fondateurice
3: !#Aide.chat = Fondateurice, QOP
5: !#Bannis.chat = Fondateurice, QOP (Salon des utilisateurs bannis d'un salon officiel
EntreNous.chat)
7: !#Echecs.chat = VOP
8: #edfgdf.chat = Fondateurice
10: !#EntreJeunes.chat = QOP (Salon des ados sur serveur EntreNous.chat)
Fin de la liste d'accès aux salons.`;
    const rows = parseNickServAlist(raw);
    expect(rows.map((r) => r.channel)).toEqual([
      '#',
      '#1000Bornes.chat',
      '#Aide.chat',
      '#Bannis.chat',
      '#Echecs.chat',
      '#edfgdf.chat',
      '#EntreJeunes.chat',
    ]);
    expect(rows[0].noExpire).toBe(false);
    expect(rows[1].noExpire).toBe(true);
    expect(rows[2].access).toBe('Fondateurice, QOP');
    expect(rows[3].description).toBe("Salon des utilisateurs bannis d'un salon officiel EntreNous.chat");
    expect(rows[4].access).toBe('VOP');
    expect(rows[5].noExpire).toBe(false);
    expect(rows[6].access).toBe('QOP');
    expect(rows[6].description).toBe('Salon des ados sur serveur EntreNous.chat');
  });

  it('recovers wrapped access on the next line (Entre Nous ALIST)', () => {
    const raw = `Liste des salons auxquels Harry a accès :
Numéro Salon Accès Description
1 !#Aide.chat AOP
3 !#Bannis.chat
AOP Salon des utilisateurs bannis
4 !#Echecs.chat Fondateurice
Fin de la liste d'accès aux salons.`;
    expect(parseNickServAlist(raw)).toEqual([
      { channel: '#Aide.chat', access: 'AOP', description: '', noExpire: true },
      { channel: '#Bannis.chat', access: 'AOP', description: 'Salon des utilisateurs bannis', noExpire: true },
      { channel: '#Echecs.chat', access: 'Fondateurice', description: '', noExpire: true },
    ]);
  });

  it('maps XOP tokens to prefixes', () => {
    expect(describeAlistAccess('AOP')).toEqual({ code: 'AOP', prefix: '@', labelKey: 'aop' });
    expect(describeAlistAccess('Fondateurice')).toEqual({ code: 'Fondateurice', prefix: '~', labelKey: 'founder' });
    expect(describeAlistAccess('VOP')).toEqual({ code: 'VOP', prefix: '+', labelKey: 'vop' });
  });
});

describe('alistCanInvite', () => {
  it('allows founder through hop, refuses vop', () => {
    expect(alistCanInvite('Fondateurice')).toBe(true);
    expect(alistCanInvite('Fondateurice, QOP')).toBe(true);
    expect(alistCanInvite('QOP')).toBe(true);
    expect(alistCanInvite('SOP')).toBe(true);
    expect(alistCanInvite('AOP')).toBe(true);
    expect(alistCanInvite('HOP')).toBe(true);
    expect(alistCanInvite('5')).toBe(true);
    expect(alistCanInvite('4')).toBe(true);
    expect(alistCanInvite('VOP')).toBe(false);
    expect(alistCanInvite('3')).toBe(false);
  });
});

describe('parseNickServOptionPills', () => {
  it('maps INFO pills to SET names and locks NOEXPIRE', () => {
    const on = parseNickServOptionPills([
      'Auto-op', 'Chanstats', 'Disposition flexible', 'Protection', 'Sans expiration',
    ]);
    expect([...on].sort()).toEqual(['AUTOOP', 'CHANSTATS', 'FLEXIBLE', 'KILL', 'NOEXPIRE']);
  });

  it('maps English Kill/Secure/HideEmail pills', () => {
    const on = parseNickServOptionPills(['Kill', 'Secure', 'HideEmail']);
    expect(on.has('KILL')).toBe(true);
    expect(on.has('SECURE')).toBe(true);
    expect(on.has('HIDEMAIL')).toBe(true);
    expect(on.has('NOEXPIRE')).toBe(false);
  });
});

describe('parseNickServGlist', () => {
  it('reads grouped nicks from a French GLIST', () => {
    const raw = `Liste des pseudos enregistrés sur le compte Zell :
Zell (principal)
Jessie
Fin de la liste.`;
    expect(parseNickServGlist(raw)).toEqual(['Zell', 'Jessie']);
  });

  it('reads Entre Nous GLIST table (nick + date + expire)', () => {
    const raw = `Liste des pseudos appartenant à votre compte :
Pseudo Enregistré Expire
Harry Sun Oct 9 08:44:49 2022 (il y a 3 années, 363 jours) does not expire
Lucas Thu Jan 1 00:00:00 1970 (il y a 56 années, 293 jours) does not expire
2 pseudos dans le compte.`;
    expect(parseNickServGlist(raw)).toEqual(['Harry', 'Lucas']);
  });
});

describe('parseNickServAjoin', () => {
  it('parses a numbered French AJOIN list and ignores help', () => {
    const raw = `Liste d'auto join :
1: #EntreNous
2: #secret s3cret
Fin de la liste d'auto-join.`;
    expect(parseNickServAjoin(raw)).toEqual(['#EntreNous', '#secret']);
    expect(parseNickServAjoin(`Syntaxe: AJOIN ADD [pseudo] salon [clé]
Cette commande gère votre liste d'auto join.`)).toEqual([]);
  });
});

describe('mergeAlistAndAjoin', () => {
  it('adds AJOIN-only channels and marks overlap', () => {
    const rows = mergeAlistAndAjoin(
      [{ channel: '#Aide.chat', access: 'AOP', description: '', noExpire: true }],
      ['#Aide.chat', '#monchan'],
    );
    expect(rows).toEqual([
      { channel: '#Aide.chat', access: 'AOP', description: '', noExpire: true, ajoin: true },
      { channel: '#monchan', access: '', description: '', noExpire: false, ajoin: true },
    ]);
  });
});

describe('parseNickServList', () => {
  it('reads numbered LIST hits and ignores help', () => {
    const raw = `Liste des pseudos correspondant à *Bot* :
Numéro  Pseudo
1       BotServ
2       TriviaBot
Fin de la liste.`;
    expect(parseNickServList(raw).nicks).toEqual(['BotServ', 'TriviaBot']);
    expect(parseNickServList('Syntaxe: LIST modèle').denied).toBe(true);
  });
});

describe('sendChanServInvite', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sends ChanServ INVITE then JOIN', () => {
    const client = { privmsg: vi.fn(), join: vi.fn() };
    sendChanServInvite(client, '#Aide.chat');
    expect(client.privmsg).toHaveBeenCalledWith('ChanServ', 'INVITE #Aide.chat');
    expect(client.join).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    expect(client.join).toHaveBeenCalledWith('#Aide.chat');
  });
});
