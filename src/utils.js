const { Readable } = require('stream');
const os = require('os');
const fs = require('fs');
module.exports.convertStringToStream = (stringToConvert) => {
  const stream = new Readable();
  stream._read = () => { };
  stream.push(stringToConvert);
  stream.push(null);

  return stream;
};

module.exports.getCodecInfoFromRtpParameters = (kind, rtpParameters) => {
  return {
    payloadType: rtpParameters.codecs[0].payloadType,
    codecName: rtpParameters.codecs[0].mimeType.replace(`${kind}/`, ''),
    clockRate: rtpParameters.codecs[0].clockRate,
    channels: kind === 'audio' ? rtpParameters.codecs[0].channels : undefined
  };
};

module.exports.getOS=()=> {
  const platform = os.platform();

  if (platform === 'win32') {
    return 'Windows';
  } else if (platform === 'linux') {
    return 'Linux';
  } else {
    return 'Unknown';
  }
}

module.exports.overwriteFolder = (folderPath) => {
  try {
    // Remove the folder and its contents recursively
    fs.rmdirSync(folderPath, { recursive: true, force: true });
    // Recreate the folder
    fs.mkdirSync(folderPath);
    console.log('Folder overwritten successfully!');
  } catch (err) {
    console.error('Error overwriting folder:', err);
  }
};

module.exports.removeDir=(directoryPath)=>{
  fs.access(directoryPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.log('Directory does not exist');
    } else {
      // Use recursive deletion with rmdirSync (cautious, synchronous)
      try {
        const removeFolderRecursively = function (path) {
          if (fs.existsSync(path)) {
            const files = fs.readdirSync(path);
            for (const file of files) {
              const currentPath = `${path}/${file}`;
              if (fs.lstatSync(currentPath).isDirectory()) {
                removeFolderRecursively(currentPath);
              } else {
                fs.unlinkSync(currentPath);
              }
            }
            fs.rmdirSync(path);
          }
        };
        removeFolderRecursively(directoryPath);
        console.log('Directory and its content removed successfully');
      } catch (err) {
        console.error('Error removing directory:', err);
      }
    }
  });
}


