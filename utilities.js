const fs = require('fs');
const path = require('path');
const util = require('util');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const streamPipeline = util.promisify(require('stream').pipeline);

const download = (job, url, dest) => {
    return new Promise((resolve, reject) => {
        fetch(url).then(async (response) => {
            if (response.ok) {
                let file = fs.createWriteStream(dest);
                let totalSize = response.headers.get('content-length');
                let timer = setInterval(() => {
                    let percentage = (file.bytesWritten / totalSize) * 100;
                    job.reportProgress({ done: parseInt(file.bytesWritten), total: parseInt(totalSize) });
                    console.log(`Downloaded: ${file.bytesWritten}/${totalSize} ---- ${percentage.toFixed(2)}%`)
                }, 700);
                await streamPipeline(response.body, file);
                console.log(`Download Path: ${file.path}`);
                clearInterval(timer);
                resolve();
            } else {
                reject(response.statusText);
            }
        }).catch((err) => {
            reject(err.message);
        })
    })
};


const convert = async (job, filename, dpi) => {
    return new Promise((resolve, reject) => {
        const outName = `${Date.now().toString(18)}.pdf`;

        console.log(filename, outName);

        dpi = dpi || 120;
        let ghostScript = process.env.GSX_OPTIMIZE_COMMAND || 'gs';
        let gsargs = [
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/ebook',
            '-dPreserveEPSInfo=false',
            '-dConvertCMYKImagesToRGB=true',
            '-dColorImageDownsampleThreshold=1',
            `-dColorImageResolution=${dpi}`,
            `-dMonoImageResolution=${dpi}`,
            `-dGrayImageResolution=${dpi}`,
            '-dNOPAUSE',
            '-dBATCH',
            '-dPrinted=false',
            `-sOutputFile=./public/${outName}`,
            `./public/${filename}`
        ]

        let optimizer = spawn(ghostScript, gsargs);
        console.log(`Started conversion for ${outName} with ${dpi}dpi`);

        let totalPages = 1;

        optimizer.stdout.on('data', function (data) {
            let rx1 = /Processing pages 1 through (\d+)/m;
            let rx2 = /Page (\d+)/;
            let g1 = rx1.exec(data.toString());
            let g2 = rx2.exec(data.toString());

            if (g1)
                totalPages = g1[1];
            else if (g2) {
                console.log(`${g2[1]}/${totalPages}`);
                job.reportProgress({ done: g2[1], total: totalPages });
            }
        });

        optimizer.stderr.on('data', function (data) {
            let eobj = "";
            eobj += data.toString();
            if (eobj.includes("failed: true")) {
                console.log('stderr: ' + eobj);
                reject("Failed to compress");
            }
        });

        optimizer.on('exit', function (code) {
            let exitCode = code
            console.log('ghostscript exited with code ' + exitCode);
            if (exitCode)
                reject("Conversion error, code " + exitCode);
            else
                resolve(outName);
        });

        optimizer.on('error', (err) => {
            console.log(err);
            reject(err);
        })
    });
}

const deleteFile = async (filename) => {
    try {
        console.log("filename", filename);
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