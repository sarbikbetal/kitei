const fs = require('fs');
const http = require('http');
const util = require('util');
const exec = util.promisify(require('child_process').exec);


const download = (url, dest, cb) => {
    var file = fs.createWriteStream(dest);
    var request = http.get(url, (response) => {
        if (response.statusCode == 200) {
            var totalSize = parseInt(response.headers['content-length'], 10);
            response.pipe(file);

            var timer = setInterval(() => {
                let percentage = (file.bytesWritten / totalSize) * 100;
                console.log(`Downloaded: ${file.bytesWritten}/${totalSize} ---- ${percentage.toFixed(2)}%`)
            }, 700);

            file.on('finish', () => {
                console.log(`Download Path: ${file.path}`);
                clearInterval(timer);
                file.close(cb); // close() is async, call cb after close completes.
            });
        } else {
            cb({ code: response.statusCode, message: response.statusMessage });
        }
    }).on('error', (err) => { // Handle errors
        fs.unlink(dest, () => { console.log(err) }); // Delete the file async. (But we don't check the result)
        if (cb) cb(err.message);
    });
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

// let job = {
//     url: 'http://ws06.longfiles.com/files/2/edmogz7qyq3ai7/Seventh-day%20Adventists%20and%20the%20Civil%20Rights%20Movement.pdf',
//     name: 'adcad'
// };

// download(job.url, path.join(__dirname, `public/${job.name}.pdf`), function (err) {
//     if (err) {
//         console.log(err);
//         done(err);
//     }
//     else {
//         console.log("File downloaded");
//         done();
//     }
// });