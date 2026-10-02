import { describe, expect, it } from 'vitest';
import { redactContacts, sanitizeOffer } from '../../src/sources/francetravail/sanitize';

describe('suppression des données de contact (SPEC.md §11)', () => {
  const offer = {
    id: '199ABCD',
    intitule: 'Data Engineer (H/F)',
    description: 'Envoyez votre CV à marie.dupont@entreprise-exemple.fr ou appelez le 06 12 34 56 78.',
    entreprise: { nom: 'EXEMPLE DATA', description: 'Contact RH : +33 (0)1 23 45 67 89' },
    contact: { nom: 'Marie Dupont', courriel: 'marie.dupont@entreprise-exemple.fr', telephone: '0612345678' },
    agence: { courriel: 'ape.toulouse@francetravail.fr', telephone: '3949' },
    salaire: { libelle: 'Annuel de 45000.0 Euros à 55000.0 Euros sur 12 mois' },
  };

  it("retire les objets contact et agence et garde le nom de l'entreprise", () => {
    const clean = sanitizeOffer(offer);
    expect(clean).not.toHaveProperty('contact');
    expect(clean).not.toHaveProperty('agence');
    expect(clean.entreprise).toMatchObject({ nom: 'EXEMPLE DATA' });
    expect(clean.salaire).toEqual(offer.salaire);
  });

  it('masque e-mails et téléphones des descriptions, sans modifier l’offre d’origine', () => {
    const clean = sanitizeOffer(offer);
    expect(clean.description).toBe('Envoyez votre CV à [e-mail masqué] ou appelez le [téléphone masqué].');
    expect((clean.entreprise as { description: string }).description).toBe('Contact RH : [téléphone masqué]');
    expect(offer.contact.nom).toBe('Marie Dupont');
  });

  it.each(['06 12 34 56 78', '06.12.34.56.78', '0612345678', '+33 6 12 34 56 78', '+33 (0)6 12 34 56 78', '0033 6 12 34 56 78'])(
    'masque le numéro %s',
    (phone) => {
      expect(redactContacts(`Tél. ${phone}.`)).toBe('Tél. [téléphone masqué].');
    },
  );

  it.each([
    'Salaire : 45 000 € brut annuel, TJM 550 €/jour',
    'Code postal 31000, SIRET 12345678901234, publiée le 2026-10-05',
    'Prime de 2 500 €, 35 heures, 1 607 h par an',
  ])('laisse intacts les montants et codes : %s', (text) => {
    expect(redactContacts(text)).toBe(text);
  });
});
