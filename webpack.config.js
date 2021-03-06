const webpack = require('webpack')
const CopyPlugin = require('copy-webpack-plugin')
const base = require('./webpack.base.config.js')

module.exports = (env, argv) => {
  const config = typeof base === 'function' ? base(env, argv) : base

  config.plugins.push(new webpack.DefinePlugin({
    __CE__: true,       // community/baseline edition
    __WEB__: false,     // web edition
  }))

  config.plugins.push(new CopyPlugin({patterns: [
    {from: 'index.html'},
  ]}))

  return config
}
