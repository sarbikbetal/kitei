const Queue = require('bee-queue');
const { compress, download, deleteFile } = require('./utilities');

const options = {
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
const stagingQueue = new Queue('kti_stg', {
    ...options,
    storeJobs: false,
    activateDelayedJobs: true
});

downloadQueue.process((job) => {
    return download(job);
})

compressQueue.process((job) => {
    return compress(job);
})

stagingQueue.process((job) => {
    return new Promise((resolve, reject) => {
        deleteFile(`${job.id}.pdf`)
            .then(() => deleteFile(`${job.data}.pdf`))
            .then(() => { resolve() })
            .catch((err) => console.log("Error deleting files", err))
    })
})

const shutdown = () => {
    console.log("Worker shutting down");
    downloadQueue.close(5);
    compressQueue.close(5);
    stagingQueue.close(5);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);