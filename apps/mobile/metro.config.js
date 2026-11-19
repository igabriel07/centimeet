// Ρυθμίσεις bundler. Στο web αντικαθιστούμε το react-native-maps (δεν υποστηρίζει web)
// με ένα απλό πλαίσιο, ώστε η εφαρμογή να ανοίγει στον browser για αλλαγές εμφάνισης.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Στα Windows το γράμμα δίσκου μπορεί να έρθει πεζό (f:) ενώ τα symlinks του workspace δίνουν F: — ενοποίηση.
const projectRoot = __dirname.replace(/^[a-z]:/, (d) => d.toUpperCase());
const config = getDefaultConfig(projectRoot);
const mapsStub = path.resolve(projectRoot, 'src/web/maps-stub.tsx');
const resolveDefault = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: mapsStub };
  }
  return (resolveDefault ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
