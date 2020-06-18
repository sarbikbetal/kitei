const Queue = require('bee-queue');
const WebSocket = require('ws');
const path = require('path');
const { convert, download, deleteFile } = require('./utilities');

const options = {
    removeOnSuccess: true,
    redis: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        password: process.env.DB_PASS,
    },
}

const downloadTask = new Queue('download', options);
const convertTask = new Queue('convert', options);
const deleteTask = new Queue('delete', {
    ...options,
    storeJobs: false,
    activateDelayedJobs: true
});

const addDownload = (job) => {
    return downloadTask.createJob(job).save();
}

downloadTask.process((job, done) => {
    download(job.data.url, path.join(__dirname, `public/${job.data.name}.pdf`), function (err) {
        if (err) {
            done(err);
        }
        else {
            console.log("File downloaded");
            done();
        }
    });
})

const addConvert = (job) => {
    return convertTask.createJob(job).save();
}

convertTask.process((job, done) => {
    convert(`${job.data.name}.pdf`, 100)
        .then((filename) => {
            done(null, filename);
        }).catch((err) => {
            done(err);
        });
})

const addDelete = (job) => {
    return deleteTask.createJob(job).delayUntil(Date.now() + 60 * 1000).save();
}

deleteTask.process((job, done) => {
    deleteFile(job.data).then(() => {
        done();
    }).catch(err => {
        done(err);
    });
})


const init = (server) => {
    const wss = new WebSocket.Server({
        server
    });

    wss.on('connection', (ws) => {
        ws.on('message', async (message) => {
            message = JSON.parse(message);
            if (message.type == "download") {

                // queue the job and save it in a variable
                console.log(message.job);
                let job = await addDownload(message.job);
                ws.send("Job queued");


                // add an event lister for job complete event
                job.on("succeeded", async () => {
                    // send the url
                    ws.send("File downloaded, ready for conversion");
                    // convert(`${message.job.name}.pdf`, 100);
                    let convertJob = await addConvert(message.job);
                    convertJob.on("succeeded", (filename) => {
                        ws.send("File converted");
                        ws.send(filename);
                        deleteFile(`./public/${message.job.name}.pdf`);
                        addDelete(`./public/${filename}`);
                    });

                    convertJob.on("failed", (err) => {
                        console.log(err.name);
                        ws.send(err.name);
                    });
                });

                job.on("failed", (err) => {
                    console.log(err.name);
                    ws.send(err.name);
                });
            } else {
                ws.send("Invalid data");
            }
        });
    });
};

module.exports = {
    init: init
}
