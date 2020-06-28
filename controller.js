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
    download(job.data.url, path.join(__dirname, `public/${job.data.name}.pdf`)).then(() => {
        console.log("File downloaded");
        done();
    }).catch((err) => {
        console.log(err);
        done(err);
    });
})

const addConvert = (job) => {
    return convertTask.createJob(job).save();
}

convertTask.process((job, done) => {
    convert(`${job.data.name}.pdf`, 100)
        .then((filename) => {
            console.log("Compression complete");
            done(null, filename);
        }).catch((err) => {
            console.log("Compression failed");
            done(err);
        });
})

const addDelete = (job) => {
    return deleteTask.createJob(job).delayUntil(Date.now() + 60 * 60 * 1000).save();
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
            if (message.type == "download" && message.job.url) {

                // enqueue the job and save it in a variable
                message.job.name = message.job.name.trim().replace(/[^a-z0-9]/gi, "_") || "document";
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
                        data: "File downloaded, ready for compression."
                    };
                    ws.send(JSON.stringify(info));
                    // convert(`${message.job.name}.pdf`, 100);
                    let convertJob = await addConvert(message.job);
                    convertJob.on("succeeded", (filename) => {
                        info = {
                            type: "info",
                            data: "Compressed and ready"
                        };
                        ws.send(JSON.stringify(info));
                        ws.send(JSON.stringify({
                            type: "url",
                            data: `view/${filename}`
                        }));
                        ws.send(JSON.stringify({ type: "finish" }));
                        deleteFile(`./public/${message.job.name}.pdf`);
                        addDelete(`./public/${filename}`);
                    });

                    convertJob.on("failed", (err) => {
                        let errorObject = { type: "error", data: err.message };
                        console.log(errorObject);
                        ws.send(JSON.stringify(errorObject));
                        ws.send(JSON.stringify({ type: "finish" }));
                    });
                });

                job.on("failed", (err) => {
                    let errorObject = { type: "error", data: "There was an error downloading your file" };
                    // console.log(err);
                    ws.send(JSON.stringify(errorObject));
                    ws.send(JSON.stringify({ type: "finish" }));
                });
            } else {
                ws.send(JSON.stringify({
                    type: "error",
                    data: "Invalid data"
                }));
                ws.send(JSON.stringify({ type: "finish" }));
            }
        });
    });
};

module.exports = {
    init: init
}
