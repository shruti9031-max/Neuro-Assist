const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background/background.ts',
    content: './src/content/content.ts',
    popup: './src/popup/popup.ts',
    offscreen: './src/offscreen/offscreen.ts',
    permission: './src/permission/permission.ts'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json',
          transform(content) {
            return content
              .toString()
              .replace(/dist\/background\.js/g, 'background.js')
              .replace(/dist\/content\.js/g, 'content.js')
              .replace(/dist\/popup\.html/g, 'popup.html');
          },
        },
        {
          from: 'src/popup/popup.html',
          to: 'popup.html',
          // Rewrite script src from "../../dist/popup.js" to "./popup.js"
          transform(content) {
            return content
              .toString()
              .replace('../../dist/popup.js', './popup.js');
          },
        },
        {
          from: 'src/offscreen/offscreen.html',
          to: 'offscreen.html',
          transform(content) {
            return content
              .toString()
              .replace('../../dist/offscreen.js', './offscreen.js');
          },
        },
        {
          from: 'src/permission/permission.html',
          to: 'permission.html',
          transform(content) {
            return content
              .toString()
              .replace('../../dist/permission.js', './permission.js');
          },
        },
      ],
    }),
  ],
};