interface NetlifyGlobal {
  env?: { get(name: string): string | undefined };
}

/** Variable d'environnement : `Netlify.env` dans les fonctions, `process.env` ailleurs. */
export function env(name: string): string | undefined {
  const netlify = (globalThis as { Netlify?: NetlifyGlobal }).Netlify;
  return netlify?.env?.get(name) ?? process.env[name];
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`variable d'environnement manquante : ${name}`);
  return value;
}
