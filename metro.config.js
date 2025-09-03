const { getDefaultConfig } = require('expo/metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);
  config.resolver.assetExts = [...config.resolver.assetExts, 'png', 'jpg', 'jpeg', 'svg']; // Adds image support
  config.resolver.extraNodeModules = {
    'react-dom': require.resolve('react-native'), // Previous alias kept
  };
  return config;
})();