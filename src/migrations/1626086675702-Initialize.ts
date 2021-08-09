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
      'CREATE TABLE IF NOT EXISTS `erc20_tokens` (`address` varchar(255) NOT NULL, `name` varchar(255) NULL, `symbol` varchar(255) NULL, `decimals` tinyint NULL, `icon` varchar(255) NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `modified_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`address`)) ENGINE=InnoDB'
    );
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS `erc20_transfers` (`tx_id` varchar(255) NOT NULL, `event_index` int(11) NOT NULL, `token_address` varchar(255) NULL, `transfer_from` varchar(255) NULL, `transfer_to` varchar(255) NULL, `amount` decimal(65) UNSIGNED NULL, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_ea2479fe843aa386ca3a2260d6` (`transfer_to`, `token_address`), INDEX `IDX_eb0ada2cceefd81d2bec538764` (`transfer_from`, `token_address`), PRIMARY KEY (`tx_id`, `event_index`)) ENGINE=InnoDB'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `erc20_transfers`');
    await queryRunner.query('DROP TABLE `erc20_tokens`');
    await queryRunner.query('DROP TABLE `contract_methods`');
    await queryRunner.query('DROP TABLE `contract_events`');
    await queryRunner.query('DROP TABLE `contract_codes`');
  }
}
