import { describe, it, expect } from 'vitest';
import { parseNickServInfo, parseNickServAlist } from './nickserv-info';

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
      { channel: '#EntreNous', access: 'FONDATEUR', description: '' },
      { channel: '#help', access: 'AOP', description: "Salon d'aide" },
    ]);
  });

  it('parses an English numbered ALIST table', () => {
    expect(parseNickServAlist(ALIST_EN)).toEqual([
      { channel: '#orbit', access: 'Founder', description: '' },
      { channel: '#dev', access: 'SOP', description: 'Builders' },
    ]);
  });

  it('returns an empty list when the nick has no access', () => {
    expect(parseNickServAlist('Harry n\'a accès à aucun salon.')).toEqual([]);
    expect(parseNickServAlist('Zell has no access on any channels.')).toEqual([]);
  });
});
