const WebSocket = require('ws');
const Queue = require('bee-queue');
// const path = require('path');
const fs = require('fs');
const prettyBytes = require('pretty-bytes');
const { rejects } = require('assert');
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
        let isFound = false;
        reportDownload(ws, id)
          .then((data) => {
            if (data)
              isFound = true;
            return reportCompress(ws, id);
          }).then((data) => {
            if (data)
              isFound = true;
            return reportStaging(ws, id);
          }).then((data) => {
            if (data)
              isFound = true;

            if (!isFound)
              ws.close(4004, "The associated doc was not found");
          }).catch((err) => {
            console.error(err);
            ws.close(1011);
          })
      }
    });
  });


  server.on('close', () => {
    console.log("Socket shutting down");
    downloadQueue.close(5);
    compressQueue.close(5);
    stagingQueue.close(5);
    wss.close((err) => {
      if (err)
        console.error(err);
      console.log("Socket connections closed");
    });
  });
}

const sendData = (ws, data) => {
  ws.send(JSON.stringify(data));
}

const reportDownload = (ws, id) => {
  return new Promise((resolve, reject) => {
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

        let info = {
          type: "info",
          data: "Your downloading is waiting ..."
        };
        sendData(ws, info);

        resolve(true);
      } else {
        console.log(`${id} : Download job not found`);
        resolve(false);
      }
    }).catch((err) => {
      console.log(err);
      reject();
    });
  })
}

const reportCompress = (ws, id) => {
  return new Promise((resolve, reject) => {
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
        });

        let info = {
          type: "info",
          data: "Waiting for compressor ..."
        };
        sendData(ws, info);

        resolve(true);
      } else {
        console.log(`${id} : Compression job not found`);
        resolve(false);
      }
    }).catch((err) => {
      console.log(err);
      reject();
    });
  })
}

const reportStaging = (ws, id) => {
  return new Promise((resolve, reject) => {
    stagingQueue.getJob(id).then(job => {
      if (job) {
        wrapup(ws, id, job.data);
        resolve(true);
      } else {
        console.log(`${id} : Staged job not found`);
        resolve(false);
      }
    }).catch((err) => {
      console.log(err);
      reject();
    });
  })
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

module.exports = init;