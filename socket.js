const WebSocket = require('ws');
const Queue = require('bee-queue');
// const path = require('path');
const fs = require('fs');
const prettyBytes = require('pretty-bytes');
const options = {
  isWorker: false,
  redis: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    password: process.env.DB_PASS,
  }
}

const downloadQueue = new Queue('kti_dwl', options);
const compressQueue = new Queue('kti_cmp', options);
const stagingQueue = new Queue('kti_stg', {
  ...options,
  storeJobs: false,
  activateDelayedJobs: true
});

const init = (server) => {
  const wss = new WebSocket.Server({ server });

  wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
      message = JSON.parse(message);
      let id = message.id;
      if (message.type == "probe" && id) {
        reportDownload(ws, id);
        reportCompress(ws, id);
        reportStaging(ws, id);
      }
    });
  });
}

const sendData = (ws, data) => {
  ws.send(JSON.stringify(data));
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
        sendData(ws, pg);
      });

      job.on("succeeded", () => {
        ws.close(4007, "Please reconnect");
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
        sendData(ws, pg);
      });

      job.on("succeeded", (filename) => {
        console.log(`Sending compression progress report for ${id}`);
        let info = {
          type: "info",
          data: "Compressed and ready"
        };
        sendData(ws, info);
        wrapup(ws, id, filename)
      })
    } else
      console.log(`${id} : Compression job not found`);
  }).catch(console.log);
}

const reportStaging = (ws, id) => {
  stagingQueue.getJob(id).then(job => {
    if (job) {
      wrapup(ws, id, job.data);
    } else
      console.log(`${id} : Staged job not found`);
  }).catch(console.log);
}

const wrapup = (ws, id, filename) => {
  let ini = fs.statSync(`./public/${id}.pdf`).size;
  let fnl = fs.statSync(`./public/${filename}`).size;
  let info = {
    type: "size",
    initial: prettyBytes(ini),
    final: prettyBytes(fnl),
    ratio: (((ini - fnl) / ini) * 100).toFixed(2) + '%'
  }
  sendData(ws, info);

  info = { type: "url", data: `${filename}` }

  sendData(ws, info);
  sendData(ws, { type: "finish" });
  ws.close(1000);
}

process.on('SIGINT', () => {
  console.log("Gracefully shutting down");
  downloadQueue.close(5);
  compressQueue.close(5);
  stagingQueue.close(5);
});

module.exports = init;