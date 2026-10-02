import { describe, expect, it } from 'vitest';
import { normalize } from '../src/core/normalize';

describe('normalize (SPEC.md §6.4)', () => {
  it.each([
    // Marqueurs de genre
    ['Forward Deployed Engineer IA (H/F)', 'forward deployed engineer ia'],
    ['Forward deployment engineer (H/F/NB)', 'forward deployment engineer'],
    ['AI Engineer (f/h)', 'ai engineer'],
    ['Senior Dev Fullstack (front mindset) (f/h/n)', 'senior dev fullstack (front mindset)'],
    ['Product Owner IA agentique H/F', 'product owner ia agentique'],
    ['Data Analyst F/H/X', 'data analyst'],
    ['Développeur(se) Java F/H', 'developpeur java'],
    ['Développeur·se Full Stack Java/Angular', 'developpeur full stack java/angular'],
    ['Développeurse PHP', 'developpeur php'],
    ['Ingénieur(e) développement logiciel F/H', 'ingenieur developpement logiciel'],
    ['Consultant·e cloud', 'consultant cloud'],
    ['Ingénieur.e data', 'ingenieur data'],
    [
      'Consultant(e) Data Protection & Gouvernance IA (RGPD/RIA)',
      'consultant data protection & gouvernance ia (rgpd/ria)',
    ],
    // Accents, ligatures, apostrophes typographiques
    ['Analyste de données', 'analyste de donnees'],
    ['Chef de projet SI – Œuvres sociales', 'chef de projet si oeuvres sociales'],
    ['Ingénieur d’affaires', "ingenieur d'affaires"],
    // Séparateurs et espaces
    [
      'Proxy Product Owner – Agentic Email Automation/ Marseille',
      'proxy product owner agentic email automation/ marseille',
    ],
    ['  Dev   Python | Django_REST  ', 'dev python django rest'],
    ['TJM : 2\u00a0500\u202f€', 'tjm : 2 500 €'],
    // Caractères conservés pour les motifs : + # . / -
    ['Développeur C# / .NET', 'developpeur c# / .net'],
    ['Ingénieur C++ embarqué', 'ingenieur c++ embarque'],
    ['Développeur Vue.js / Node.js', 'developpeur vue.js / node.js'],
  ])('%s → %s', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('est idempotente', () => {
    const once = normalize('Développeur·se Full Stack (H/F) – Ingénieur(e) d’études');
    expect(normalize(once)).toBe(once);
  });
});
