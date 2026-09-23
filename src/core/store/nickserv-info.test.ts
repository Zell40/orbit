import { describe, it, expect } from 'vitest';
import { parseNickServInfo, parseNickServAlist, describeAlistAccess } from './nickserv-info';

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

  it('maps XOP tokens to prefixes', () => {
    expect(describeAlistAccess('AOP')).toEqual({ code: 'AOP', prefix: '@', labelKey: 'aop' });
    expect(describeAlistAccess('Fondateurice')).toEqual({ code: 'Fondateurice', prefix: '~', labelKey: 'founder' });
    expect(describeAlistAccess('VOP')).toEqual({ code: 'VOP', prefix: '+', labelKey: 'vop' });
  });
});
