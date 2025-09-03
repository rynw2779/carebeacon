module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],  // Expo's default preset for RN compatibility
    plugins: ['@babel/plugin-syntax-flow'],  // Adds Flow syntax support to fix the error
  };
};