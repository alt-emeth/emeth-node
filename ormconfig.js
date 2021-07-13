const dotenv = require('dotenv');

dotenv.config({
  path: '.env',
});

const { TYPE_CONNECTION, MYSQL_HOST, MYSQL_DATABASE, MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_PORT } = process.env;

const connectionOptions = {
  type: TYPE_CONNECTION,
  host: MYSQL_HOST,
  database: MYSQL_DATABASE,
  username: MYSQL_USERNAME,
  password: MYSQL_PASSWORD,
  port: parseInt(MYSQL_PORT),
  synchronize: false,
  logging: false,
  entities: ['dist/**/*.entity.{ts,js}'],
  migrations: ['dist/migrations/**/*.{ts,js}'],
  cli: {
    migrationsDir: 'src/migrations',
  },
};

module.exports = connectionOptions;
