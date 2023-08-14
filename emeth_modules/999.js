'use strict';

const fs = require('fs');
const path = require('path');

module.exports = async function (job, inputDir, outputDir) {
  let count = 0;
  let sum = 0;

  let filehandle;
  try {
    filehandle = await fs.promises.open(path.join(inputDir, `input-${job.id}.dat`));

    let lineNumber = 1;
    for await (const line of filehandle.readLines({ encoding: 'utf-8' })) {
      const number = Number(line.trim());

      if (!Number.isNaN(number)) {
        count++;
        sum += number;
      } else {
        console.error(
          `input-${job.id}.dat#L${lineNumber}: "${line}" can't be converted to a number.`,
        );
      }

      lineNumber++;
    }
  } finally {
    await filehandle?.close();
  }

  await fs.promises.writeFile(
    path.join(outputDir, `output-${job.id}.dat`),
    (count > 0 ? `${count},${sum / count}` : '') + '\r\n',
    'utf-8',
  );
};
