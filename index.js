const fetch = require('node-fetch');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');

const dpBox = require('./lib/dropbox/dropbox')


const port = 3000;

console.log(process.env);
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

const { Dropbox } = require('dropbox');

const dbx = new Dropbox({ accessToken: ACCESS_TOKEN });

function uploadFile(file, res) {
    const UPLOAD_FILE_SIZE_LIMIT = 150 * 1024 * 1024;

    if (file.size < UPLOAD_FILE_SIZE_LIMIT) { // File is smaller than 150 Mb - use filesUpload API
        dbx.filesUpload({ path: '/' + file.name, contents: file.data })
            .then(function (response) {
                console.log('File uploaded!');
                console.log(response);
                sendRes(200, 'File uploaded!', res);
            })
            .catch(function (error) {
                console.error(error);
                sendRes(500, 'internal server error', res);
            });
    } else { // File is bigger than 150 Mb - use filesUploadSession* API
        sendRes(500, 'File size should be smaller than 150MB', res);
        const maxBlob = 8 * 1000 * 1000; // 8Mb - Dropbox JavaScript API suggested max file / chunk size
        var workItems = [];
        var offset = 0;

        while (offset < file.size) {
            var chunkSize = Math.min(maxBlob, file.size - offset);
            workItems.push(file.slice(offset, offset + chunkSize));
            offset += chunkSize;
        }

        const task = workItems.reduce((acc, blob, idx, items) => {
            if (idx == 0) {
                // Starting multipart upload of file
                return acc.then(function () {
                    return dbx.filesUploadSessionStart({ close: false, contents: blob })
                        .then(response => response.session_id)
                });
            } else if (idx < items.length - 1) {
                // Append part to the upload session
                return acc.then(function (sessionId) {
                    var cursor = { session_id: sessionId, offset: idx * maxBlob };
                    return dbx.filesUploadSessionAppendV2({ cursor: cursor, close: false, contents: blob }).then(() => sessionId);
                });
            } else {
                // Last chunk of data, close session
                return acc.then(function (sessionId) {
                    var cursor = { session_id: sessionId, offset: file.size - blob.size };
                    var commit = { path: '/' + file.name, mode: 'add', autorename: true, mute: false };
                    return dbx.filesUploadSessionFinish({ cursor: cursor, commit: commit, contents: blob });
                });
            }
        }, Promise.resolve());

        task.then(function (result) {
            console.log('File uploaded!');
            console.log(result);
            sendRes(200, 'File uploaded!', res);
        }).catch(function (error) {
            console.error(error);
            sendRes(500, 'internal server error', res);
        });

    }
    return false;
}

function sendRes(status, msg, res) {
    res.send(status, msg);
}


// enable files upload
app.use(fileUpload({
    createParentPath: true
}));

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.get('/', (req, res) => {
    let fileID = req.body.id;
        dpBox.fileHandler.getFile(fileID).then(function(doc) {
            const fs = require('fs');
            let data = doc;
            fs.writeFile(data.name, data.fileBinary, 'binary', (err) => {
                if (err) { throw err; }
                console.log(`File: ${data.name} saved.`);
                res.send(200, `File: ${data.name} saved.`);
            });
    }).catch(function(err) {
        res.send(500, err.message);
    });
});
app.post('/upload', (req, res) => {
    if (req.files.doc && req.body.filePath) {
        dpBox.fileHandler.uploadFile(req.body.filePath, req.files.doc).then(function(docJSon) {
            res.send(200, docJSon);
        }).catch(function(err) {
            res.send(500, err);
        });
    } else {
        res.send(500, "error");
    }
})

app.listen(process.env.PORT || port);
