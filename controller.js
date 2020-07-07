const Queue = require('bee-queue');
// const path = require('path');
// const fs = require('fs');
// const prettyBytes = require('pretty-bytes');

require("./worker");

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
const deleteQueue = new Queue('delete', {
    ...options,
    storeJobs: false,
    activateDelayedJobs: true
});

const addDownload = (data, id) => {
    return downloadQueue.createJob(data).setId(id).save();
}

downloadQueue.on('job succeeded', (jobId, result) => {
    console.log(result);
    console.log("\x1b[42m\x1b[30m%s\x1b[0m", `Download complete ${jobId}`);
    addCompress(result, jobId);
})

downloadQueue.on("job failed", (jobId, err) => {
    console.log("Download failed for", jobId, err);
})

const addCompress = (data, id) => {
    return compressQueue.createJob(data).setId(id).save();
}

compressQueue.on('job succeeded', (jobId, result) => {
    console.log('\x1b[43m\x1b[30m%s\x1b[0m', `Compression complete ${jobId}->${result}`)
})

compressQueue.on("job failed", (jobId, err) => {
    console.log("Compression failed for ", jobId, err);
})

module.exports = {
    addDownload
}