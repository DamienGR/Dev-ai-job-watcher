/** Journal structuré : un objet JSON par ligne (SPEC.md §10). */
export type Logger = (event: string, fields?: Record<string, unknown>) => void;

export const jsonLogger: Logger = (event, fields = {}) => {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
};

export const silentLogger: Logger = () => {};
