const fs = require('fs');
const http = require('http');
const util = require('util');
const fetch = require('node-fetch');
const exec = util.promisify(require('child_process').exec);
const streamPipeline = util.promisify(require('stream').pipeline);

const download = (url, dest) => {
    return new Promise((resolve, reject) => {
        fetch(url).then(async (response) => {
            if (response.ok) {
                let file = fs.createWriteStream(dest);
                let totalSize = response.headers.get('content-length');
                let timer = setInterval(() => {
                    let percentage = (file.bytesWritten / totalSize) * 100;
                    console.log(`Downloaded: ${file.bytesWritten}/${totalSize} ---- ${percentage.toFixed(2)}%`)
                }, 700);
                await streamPipeline(response.body, file);
                console.log(`Download Path: ${file.path}`);
                clearInterval(timer);
                resolve();
            } else {
                reject(response.statusText);
            }
        }).catch((err)=>{
            reject(err.message);
        })
    })
};


const convert = async (filename, dpi) => {
    try {
        const outName = `${Date.now().toString(36)}/${filename}`;
        const gsx = await exec(`gsx-pdf-optimize ./public/${filename} ./public/${outName} --dpi=${dpi}`);
        console.log(gsx);
        return outName;
    } catch (error) {
        throw error;
    }

}

const deleteFile = async (filename) => {
    try {
        await fs.promises.unlink(filename);
        console.log(`${filename} was deleted`);
    } catch (error) {
        console.log(error);
        throw error;
    }
}

module.exports = {
    download: download,
    convert: convert,
    deleteFile: deleteFile
}

const download2 = (url, dest) => {
    // try {
    //     const response = await fetch(url);
    //     if (response.ok) {
    //         let file = fs.createWriteStream(dest);
    //         let totalSize = response.headers.get('content-length');
    //         let timer = setInterval(() => {
    //             let percentage = (file.bytesWritten / totalSize) * 100;
    //             console.log(`Downloaded: ${file.bytesWritten}/${totalSize} ---- ${percentage.toFixed(2)}%`)
    //         }, 700);
    //         await streamPipeline(response.body, file);
    //         console.log(`Download Path: ${file.path}`);
    //         clearInterval(timer);
    //         return;
    //     } else
    //         throw new Error(response.statusText);
    // } catch (error) {
    //     console.log(error);
    //     throw new Error(error);
    // }
}

