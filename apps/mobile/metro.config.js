const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const mobileModules = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// 1. Monorepo: Metro vede tutti i pacchetti workspace
config.watchFolders = [monorepoRoot];

// 2. Monorepo: risolvi moduli prima dalla workspace locale, poi dalla root
config.resolver.nodeModulesPaths = [
  mobileModules,
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Supporta file .cjs (Apollo Client, graphql-ws CJS build)
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
];

// 4. FIX CRITICO — React duplicato nel monorepo
//
//    Problema:
//      root/node_modules/react          → React 18.3.1  (per apps/web)
//      root/node_modules/react-native   → React Native 0.81.5 (hoisted, serve React 19)
//      apps/mobile/node_modules/react   → React 19.1.0
//
//    react-native@0.81.5 è hoisted in root e quando fa require('react')
//    trova React 18 → ReactSharedInternals.S è undefined → crash.
//
//    extraNodeModules non ha precedenza assoluta sul resolver normale.
//    resolveRequest viene chiamato PRIMA di qualsiasi altra logica di risoluzione
//    e garantisce che 'react' punti sempre a React 19 del workspace mobile.

const react19 = path.resolve(mobileModules, 'react');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Forza 'react' e tutti i suoi subpath (react/jsx-runtime, ecc.)
  // a usare React 19 del workspace mobile, da qualunque file venga richiesto
  if (moduleName === 'react') {
    return { filePath: path.resolve(react19, 'index.js'), type: 'sourceFile' };
  }
  if (moduleName.startsWith('react/')) {
    const sub = moduleName.slice('react/'.length);
    return { filePath: path.resolve(react19, sub + '.js'), type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
