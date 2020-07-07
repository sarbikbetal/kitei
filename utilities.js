const fs = require('fs');
const path = require('path');
const util = require('util');
const fetch = require('node-fetch');
const { spawn } = require('child_process');
const streamPipeline = util.promisify(require('stream').pipeline);

const download = (job) => {
    let url = job.data.url;
    let dest = path.join(__dirname, `public/${job.id}.pdf`);
    return new Promise((resolve, reject) => {
        fetch(url).then(async (response) => {
            if (response.ok) {
                let file = fs.createWriteStream(dest);
                let totalSize = response.headers.get('content-length');
                let timer = setInterval(() => {
                    job.reportProgress({ done: parseInt(file.bytesWritten), total: parseInt(totalSize) });
                }, 700);
                console.log('\x1b[46m\x1b[30m%s\x1b[0m', `Download started: ${file.path}`);
                await streamPipeline(response.body, file);
                clearInterval(timer);
                resolve(job.data);
            } else {
                reject(response.statusText);
            }
        }).catch((err) => {
            reject(err.message);
        })
    })
};

const compress = async (job) => {
    return new Promise((resolve, reject) => {
        const filename = `${job.id}.pdf`;
        const outName = `${Date.now().toString(18)}.pdf`;

        let dpi = job.data.dpi || 120;
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
        console.log(`Compressing ${filename} --> ${outName} : ${dpi}dpi`);

        let totalPages = 1;

        optimizer.stdout.on('data', function (data) {
            let rx1 = /Processing pages 1 through (\d+)/m;
            let rx2 = /Page (\d+)/;
            let g1 = rx1.exec(data.toString());
            let g2 = rx2.exec(data.toString());

            if (g1)
                totalPages = g1[1];
            else if (g2) {
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


module.exports = {
    download,
    compress
}