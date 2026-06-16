/**
 * Returns an explicit Monaco language id for files Monaco can't infer from the
 * extension (extensionless / dotfiles). Returns undefined to let Monaco infer
 * from the path (which covers ~90 normal extensions).
 */
export function languageForFilename(name: string): string | undefined {
  const base = name.split('/').pop() ?? name
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return 'dockerfile'
  if (base === 'Makefile' || base === 'makefile' || base === 'GNUmakefile') return 'makefile'
  if (base === 'CMakeLists.txt') return 'cmake'
  if (base === '.gitignore' || base === '.dockerignore' || base === '.npmignore') return 'ignore'
  if (base === '.env' || base.startsWith('.env.')) return 'ini'
  if (base === '.bashrc' || base === '.zshrc' || base === '.bash_profile' || base === '.profile') return 'shell'
  return undefined
}
