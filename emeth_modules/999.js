'use strict';

const { readFile, writeFile } = require('fs/promises');
const path = require('path');

module.exports = async function (job, inputDir, outputDir) {
  const dataset = await readFile(path.join(inputDir, `input-${job.id}.dat`), 'utf-8').then(
    (file) => {
      return file.split(/\r\n|\n/).map((line) => Number(line));
    },
  );

  const count = dataset.length + 1;
  const sum = dataset.reduce((previousValue, currentValue) => previousValue + currentValue);

  await writeFile(
    path.join(outputDir, `output-${job.id}.dat`),
    `${count},${sum / count}\r\n`,
    'utf-8',
  );
};
