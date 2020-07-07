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

downloadQueue.process((job) => {
    return download(job);
})

compressQueue.process((job) => {
    return compress(job);
})