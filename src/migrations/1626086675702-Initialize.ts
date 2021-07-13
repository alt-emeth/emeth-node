import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initialize1626086675702 implements MigrationInterface {
  name = 'Initialize1626086675702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `contract_codes` (`address` varchar(255) NOT NULL, `compiler` varchar(255) NOT NULL, `optimization` int NOT NULL, `code` text NOT NULL, `constructor_args` text NOT NULL, `abi` text NOT NULL, `evm_version` varchar(255) NOT NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`address`)) ENGINE=InnoDB'
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `contract_events` (`hash` varchar(255) NOT NULL, `event_name` varchar(255) NOT NULL, `event_definition` varchar(255) NOT NULL, PRIMARY KEY (`hash`)) ENGINE=InnoDB'
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `contract_methods` (`hash` char(10) NOT NULL, `method_name` varchar(255) NOT NULL, PRIMARY KEY (`hash`)) ENGINE=InnoDB'
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `erc20_tokens` (`address` varchar(255) NOT NULL, `name` varchar(255) NOT NULL, `symbol` varchar(255) NOT NULL, `decimals` tinyint NOT NULL, `icon` varchar(255) NOT NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `modified_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`address`)) ENGINE=InnoDB'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `erc20_tokens`');
    await queryRunner.query('DROP TABLE `contract_methods`');
    await queryRunner.query('DROP TABLE `contract_events`');
    await queryRunner.query('DROP TABLE `contract_codes`');
  }
}
