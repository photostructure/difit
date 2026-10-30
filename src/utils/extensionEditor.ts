/** Pass the extension's editor choice to the child server without changing process.env. */
export function resolveExtensionEditorEnvironment(
  inheritedEnv: Readonly<Record<string, string | undefined>>,
  selectedEditor: string,
  hostScheme: string,
): Record<string, string | undefined> {
  const env = { ...inheritedEnv };
  const selected = selectedEditor.trim().toLowerCase();

  if (selected && selected !== 'auto') {
    env.DIFIT_EDITOR = selected;
  } else if (!env.DIFIT_EDITOR && hostScheme.toLowerCase() === 'cursor') {
    env.DIFIT_EDITOR = 'cursor';
  }

  return env;
}
