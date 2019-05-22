module.exports = function (bundler) {
  bundler.addAssetType('less', require.resolve('./LessAsset'));
};