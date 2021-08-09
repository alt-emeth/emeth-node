import path from 'path';

import * as Joi from 'joi';
import * as dotenv from 'dotenv';

dotenv.config({
  path: path.join(__dirname, '../.env'),
});

const checkValidationEnv = () => {
  const envSchema = Joi.object({
    //database
    TYPE_CONNECTION: Joi.string().valid('mysql').required(),
    MYSQL_HOST: Joi.string().required(),
    MYSQL_DATABASE: Joi.string().required(),
    MYSQL_USERNAME: Joi.required(),
    MYSQL_PASSWORD: Joi.required(),
    MYSQL_PORT: Joi.number().positive().required(),
  });
  const { TYPE_CONNECTION, MYSQL_HOST, MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_PORT } = process.env;

  const checkEnv = envSchema.validate({
    TYPE_CONNECTION,
    MYSQL_HOST,
    MYSQL_DATABASE,
    MYSQL_USERNAME,
    MYSQL_PASSWORD,
    MYSQL_PORT,
  });

  if (checkEnv.error) {
    throw checkEnv.error.message;
  }
};

export default checkValidationEnv;
