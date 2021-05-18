"use strict";

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const { Dropbox, DropboxAuth } = require('dropbox');
const dbx = new Dropbox({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    accessToken: ACCESS_TOKEN
});

// need to work on auth piece and delete file

// max file size limit on upload api 150 MB
const API_UPLOAD_FILE_SIZE_LIMIT = 150 * 1024 * 1024;
const ROOT_FOLDER = '/';

function uploadFile(relativeLocation, fileObj) {
    let folderLocation = ROOT_FOLDER;
    if (relativeLocation) {
        folderLocation += relativeLocation;
    }
    let filePath = folderLocation + fileObj.name;

    // before file upload check the filepath exists or not
    return dbx.filesUpload({
        path: filePath,
        contents: fileObj.data,
        mode: 'add',
        autorename: true,
        mute: true
    })
        .then(function (response) {
            console.log('File uploaded!');
            console.log(response);

            if (response.status !== 200) {
                throw (new Error(response));
            }
            return response.result || response;
        })
        .catch(function (error) {
            throw (new Error(error));
        });
}

function downloadFile(fileId, filePath) {
    let pathParam = fileId || filePath;

    return dbx.filesDownload({ 'path': pathParam })
        .then(function (response) {
            console.log('File downloaded!');
            console.log(response);

            if (response.status !== 200) {
                throw (new Error(response));
            }
            return response.result || response;
        })
        .catch(function (error) {
            console.error(error);
            throw (new Error(error));
        });
}

function uploadFileInSession() {
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

function deleteFile(filePath) {
    return dbx.filesDeleteV2({ 'path': filePath })
        .then(function (response) {
            console.log('File deleted!');
            console.log(response);

            if (response.status !== 200) {
                throw (new Error(response));
            }
            return response.result || response;
        })
        .catch(function (error) {
            console.error(error);
            throw (new Error(error));
        });
}

function fileHandler() {

    return {
        "uploadFile": function (filePath, fileObj) {
            return new Promise((resolve, reject) => {
                if (!filePath || !fileObj) {
                    reject(new Error('filePath or fileObj is must!'));
                }

                // File is smaller than 150 Mb - use filesUpload API
                if (fileObj.size < API_UPLOAD_FILE_SIZE_LIMIT) {
                    resolve(uploadFile(filePath, fileObj));
                } else { // File is bigger than 150 Mb - use filesUploadSession* API
                }
            })
        },

        "getFile": function (fileId, filePath) {
            return new Promise((resolve, reject) => {
                if (!fileId && !filePath) {
                    reject(new Error('file ID or file path is must!'));
                }
                resolve(downloadFile(fileId, filePath));
            });
        },

        "deleteFile": function (filePath) {
            return new Promise((resolve, reject) => {
                if (!filePath) {
                    reject(new Error('file path is must!'));
                }
                resolve(deleteFile(filePath));
            });
        },

        "getAuthUrl": function (redirectUri) {
            return dbx.auth.getAuthenticationUrl(redirectUri, null, 'code', 'offline', null, 'none', false)
                .then((authUrl) => {
                    return authUrl;
                });
        },

        "getTokenFromRedirectCode": function (redirectUri, code) {
            return dbx.auth.getAccessTokenFromCode(redirectUri, code)
                .then((token) => {
                    console.log(`Token Result:${JSON.stringify(token)}`);
                    dbx.auth.setRefreshToken(token.result.refresh_token);
                    return token;
                })
                .catch((error) => {
                    console.log(error);
                });
        }

    };
}

module.exports = fileHandler();
