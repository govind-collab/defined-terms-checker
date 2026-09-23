const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// The manifest points at the dev server. For a hosted build set ADDIN_URL, for example
// ADDIN_URL=https://example.github.io/defined-terms-checker/ npm run build
const DEV_URL = 'https://localhost:3000/';
const PROD_URL = process.env.ADDIN_URL || DEV_URL;

module.exports = async (env, argv) => {
  const production = argv.mode === 'production';
  const serving = Boolean(env && env.WEBPACK_SERVE);

  const config = {
    mode: production ? 'production' : 'development',
    devtool: production ? false : 'source-map',
    entry: { taskpane: './src/taskpane/taskpane.ts' },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          exclude: /node_modules/,
          options: { onlyCompileBundledFiles: true },
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'taskpane.html',
        template: './src/taskpane/taskpane.html',
        chunks: ['taskpane'],
        scriptLoading: 'blocking',
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: 'assets', to: 'assets' },
          { from: 'src/taskpane/taskpane.css', to: 'taskpane.css' },
          {
            from: 'manifest.xml',
            to: 'manifest.xml',
            transform: (content) => (production ? content.toString().split(DEV_URL).join(PROD_URL) : content),
          },
        ],
      }),
    ],
  };

  if (serving) {
    // Office only loads task panes over https; the dev certificate is created and trusted on first run.
    const devCerts = require('office-addin-dev-certs');
    config.devServer = {
      static: { directory: path.join(__dirname, 'dist') },
      headers: { 'Access-Control-Allow-Origin': '*' },
      server: { type: 'https', options: await devCerts.getHttpsServerOptions() },
      port: 3000,
      hot: false,
    };
  }

  return config;
};
