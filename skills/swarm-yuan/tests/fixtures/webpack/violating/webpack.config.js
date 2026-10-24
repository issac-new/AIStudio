// violating fixture: 生产 mode + eval devtool + 无 splitChunks + 无 cache + 动态 import 无 chunk 命名
const path = require('path');
const { DefinePlugin } = require('webpack');

module.exports = {
  mode: 'production',
  devtool: 'eval',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  plugins: [
    new DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
  ],
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: ['sass-loader', 'css-loader'],
      },
    ],
  },
};

// 动态 import 无 webpackChunkName
import('./src/lazy').then((m) => m.default());
