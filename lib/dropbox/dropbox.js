"use strict";
const fileHandler = require("./services/file-handler");

function dropbox() {
  return {
    "fileHandler": fileHandler
  }
}

module.exports = dropbox();
