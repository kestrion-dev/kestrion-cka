const STORAGE_KEY = 'cka.v2.progress.schema-1';

type Progress = Record<string, boolean>;

function readProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function isCompleted(id: string): boolean {
  return readProgress()[id] === true;
}

export function setCompleted(id: string, completed: boolean): void {
  const progress = readProgress();
  if (completed) progress[id] = true;
  else delete progress[id];

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // El control sigue funcionando aunque el almacenamiento no esté disponible.
  }
}
