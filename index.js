module.exports = function (bundler) {
  console.log('Test')
  bundler.addAssetType('less', require.resolve('./LessAsset'));
};