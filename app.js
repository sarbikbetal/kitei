require('dotenv').config()

const checkDiskSpace = require('./disks')
const express = require('express');
const http = require('http');
const controller = require('./controller.js');

// Inits
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static('public'))

const server = http.createServer(app);
controller.init(server);

app.get('/', (req, res) => {
    res.sendFile("./index.html", {root: __dirname});
})

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server started at port:${PORT}`);
});