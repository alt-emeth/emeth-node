import 'reflect-metadata';
import path from 'path';

import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

import routes from './routes/index';

dotenv.config();
const app = express();

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
