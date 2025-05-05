const path = require('path')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
    entry: './src/index.js',
    output: {
        libraryTarget: "umd",
        library: "Aider",
        globalObject: 'this',
        path: path.resolve(__dirname, 'dist'),
        filename: 'Aider.min.js'
    },
    externals: {
        Aider: "Aider" 
    },
    module: {
        rules: [
        {
            test: /\.m?js$/,
            exclude: /(node_modules|bower_components)/,
            use: { loader: 'babel-loader' } // options 在 .babelrc 定义
        }
        ]
    },
    plugins: [
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            template: 'public/index.html',
            filename: 'index.html'
        })
    ],
    devServer: {
        contentBase: './dist',
        port: 8080
    },
    mode: 'development'
}