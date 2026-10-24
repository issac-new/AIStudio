// compliant fixture: 生产 mode + source-map devtool + splitChunks + filesystem cache + 别名 + chunk 命名
const path = require('path');
const { DefinePlugin } = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].js',
  },
  cache: {
    type: 'filesystem',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  performance: {
    hints: 'warning',
    maxAssetSize: 300000,
  },
  externals: {
    react: 'React',
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({ parallel: true })],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'all',
        },
      },
    },
    runtimeChunk: 'single',
  },
  sideEffects: false,
  usedExports: true,
  plugins: [
    new DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'public', to: '.' }],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
    ],
  },
};

// 动态 import 配 webpackChunkName
import(/* webpackChunkName: "lazy" */ './src/lazy').then((m) => m.default());
