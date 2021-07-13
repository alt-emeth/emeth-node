import 'reflect-metadata';
import path from 'path';

import express from 'express';
import { createConnection } from 'typeorm';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import Axios from 'axios';

import routes from './routes/index';
import checkValidationEnv from './config/validationSchemaEnv';

dotenv.config();

//require env
checkValidationEnv();
//connect database
createConnection()
  .then((connection) => {
    console.log('Connected to DB: ' + connection.driver.database);
  })
  .catch((error) => {
    console.log('TypeORM connection error: ', error);
  });

const app = express();

export const addressPrefix = process.env.ADDRESS_PREFIX || '0x';
// config axios
Axios.defaults.baseURL = process.env.BURN_API_URL;

// view engine setup
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', routes);

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.render('pages/error', {
    message: err.message,
    error: err,
  });
});

module.exports = app;
