const WebSocket = require('ws');
const Queue = require('bee-queue');
// const path = require('path');
const fs = require('fs');
const prettyBytes = require('pretty-bytes');
const options = {
  isWorker: false,
  removeOnSuccess: true,
  removeOnFailure: true,
  redis: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    password: process.env.DB_PASS,
  }
}

const downloadQueue = new Queue('kti_dwl', options);
const compressQueue = new Queue('kti_cmp', options);

const init = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
      message = JSON.parse(message);
      let id = message.id;
      if (message.type == "probe" && id) {
        reportDownload(ws, id);
        reportCompress(ws, id);
      }
    });
    ws
  });
}


const reportDownload = (ws, id) => {
  downloadQueue.getJob(id).then(job => {
    if (job) {

      job.on("progress", (progress) => {
        let pg = {
          progress: ((progress.done / progress.total) * 100).toFixed(1),
          type: "progress",
          data: `Downloaded ${prettyBytes(progress.done)} of ${prettyBytes(progress.total)}`
        };
        ws.send(JSON.stringify(pg));
      });

      job.on("succeeded", () => {
        console.log(`Activating compression progress report for ${id}`);
        setTimeout(() => reportCompress(ws, id), 500);
      });

    } else
      console.log(`${id} : Download job not found`);
  }).catch(console.log);
}

const reportCompress = (ws, id) => {
  compressQueue.getJob(id).then(job => {
    if (job) {

      job.on("progress", (progress) => {
        let pg = {
          progress: ((progress.done / progress.total) * 100).toFixed(1),
          type: "progress",
          data: `Compressing  ${progress.done}/${progress.total} pages`
        };
        ws.send(JSON.stringify(pg));
      });

      job.on("succeeded", (filename) => {
        console.log(`Activating compression progress report for ${id}`);
        info = {
          type: "info",
          data: "Compressed and ready"
        };
        ws.send(JSON.stringify(info));
        let ini = fs.statSync(`./public/${id}.pdf`).size;
        let fnl = fs.statSync(`./public/${filename}`).size;
        info = {
          type: "size",
          initial: prettyBytes(ini),
          final: prettyBytes(fnl),
          ratio: (((ini - fnl) / ini) * 100).toFixed(2) + '%'
        }
        ws.send(JSON.stringify(info));
        ws.send(JSON.stringify({
          type: "url",
          data: `${filename}`
        }));
        ws.send(JSON.stringify({ type: "finish" }));
      })
    }

    else
      console.log(`${id} : Compression job not found`);
  }).catch(console.log);
}

module.exports = init;