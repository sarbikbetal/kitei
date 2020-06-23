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
    return deleteTask.createJob(job).delayUntil(Date.now() + 30 * 60 * 1000).save();
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
                let info = {
                    type: "info",
                    data: "Your file is being downloaded."
                };
                ws.send(JSON.stringify(info));


                // add an event lister for job complete event
                job.on("succeeded", async () => {
                    // send the url
                    let info = {
                        type: "info",
                        data: "File downloaded, ready for conversion."
                    };
                    ws.send(JSON.stringify(info));
                    // convert(`${message.job.name}.pdf`, 100);
                    let convertJob = await addConvert(message.job);
                    convertJob.on("succeeded", (filename) => {
                        info = {
                            type: "info",
                            data: "Converion complete"
                        };
                        ws.send(JSON.stringify(info));
                        ws.send(JSON.stringify({
                            type: "url",
                            data: `view/${filename}`
                        }));
                        deleteFile(`./public/${message.job.name}.pdf`);
                        addDelete(`./public/${filename}`);
                    });

                    convertJob.on("failed", (err) => {
                        let errorObject = { type: "error", data: err.message };
                        console.log(errorObject);
                        ws.send(JSON.stringify(errorObject));
                    });
                });

                job.on("failed", (err) => {
                    let errorObject = { type: "error", data: err.message };
                    console.log(errorObject, err);
                    ws.send(JSON.stringify(errorObject));
                });
            } else {
                ws.send(JSON.stringify({
                    type: "error",
                    data: "Invalid data"
                }));
            }
        });
    });
};

module.exports = {
    init: init
}
