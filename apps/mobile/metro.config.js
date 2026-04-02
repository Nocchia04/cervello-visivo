const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const mobileModules = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// Monorepo: Metro vede tutti i pacchetti workspace
config.watchFolders = [monorepoRoot];

// Monorepo: risolvi moduli prima dalla workspace locale, poi dalla root
config.resolver.nodeModulesPaths = [
  mobileModules,
  path.resolve(monorepoRoot, 'node_modules'),
];

// Supporta file .cjs (Apollo Client, graphql-ws CJS build)
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
];

module.exports = config;
