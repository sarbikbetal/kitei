require('dotenv').config()

const checkDiskSpace = require('./disks')
const express = require('express');
const http = require('http');
const controller = require('./controller.js');
const whiskers = require("whiskers");
const enforce = require('express-sslify');

// Inits
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'))
app.engine('.html', whiskers.__express);
app.set('views', __dirname + '/views');

// Check for production env and upgrade to https
if (process.env.NODE_ENV === 'production') {
    app.use(enforce.HTTPS({
        trustProtoHeader: true
    }));
}

const server = http.createServer(app);
controller.init(server);

app.get('/', (req, res) => {
    res.render("index.html", {
        // cache: true,
        ws_host: process.env.WS_HOST
    });
})

app.get('/view/:dir/:file', (req, res) => {
    let dir = req.params.dir;
    let file = req.params.file;
    let url = `${process.env.HOSTNAME}/${dir}/${file}`;
    if (dir && file) {
        res.render("adobepdf.html", {
            url: url,
            filename: file,
            clientID: process.env.ADOBE_ID
        });
    } else {
        res.redirect("/");
    }
})

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server started at port:${PORT}`);
});