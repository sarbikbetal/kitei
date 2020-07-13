console.log("Kitei is starting up ...");
require('dotenv').config()

const express = require('express');
const http = require('http');
const controller = require('./controller.js');
const wsInit = require("./socket");
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
wsInit(server);
// controller.init(server);

app.get('/', (req, res) => {
    res.render("index.html", {
        // cache: true,
        ws_host: process.env.WS_HOST
    });
})


app.get('/pdf', (req, res) => {
    let id = req.query.id;
    if (id)
        res.render("progress.html", {
            ws_host: process.env.WS_HOST
        })
    else
        res.redirect('/');
})

app.post('/pdf', (req, res) => {
    let { url, dpi } = req.body;

    if (url && dpi) {
        let id = Date.now().toString(36);
        controller.addDownload({ url, dpi }, id)
            .then((job) => {
                let { id, data, status } = job;
                res.json({ id, data, status });
            }).catch((err) => {
                res.json({ err: err })
            })
    } else {
        res.sendStatus(400);
    }
})

app.get('/view/:file', (req, res) => {
    let file = req.params.file;
    let url = `${process.env.HOSTNAME}/${file}`;
    if (file) {
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

process.on('SIGTERM', () => {
    console.log("Gracefully shutting down");
    server.close(() => {
        process.exit(0);
    })
});

const shutdown = () => {
    console.log("Gracefully shutting down the server");
    server.close((err) => {
        if (err) {
            console.error(err);
            process.exit(1);
        }
        console.log("Successfully closed the server.")
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);