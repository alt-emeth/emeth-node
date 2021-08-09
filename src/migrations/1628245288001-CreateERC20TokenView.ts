import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateERC20TokenView1628245288001 implements MigrationInterface {
  name = 'CreateERC20TokenView1628245288001';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP VIEW IF EXISTS `view_erc20_tokens`');
    await queryRunner.query(`
      CREATE VIEW view_erc20_tokens AS
      SELECT amount_in.token_address, token.name, token.symbol, token.decimals, token.icon, COUNT(*) AS holders, MAX(txs.cnt) AS transfers
      FROM
      (SELECT token_address, transfer_to AS holder, SUM(amount) AS amount
        FROM erc20_transfers
        GROUP BY token_address, transfer_to) amount_in
      LEFT JOIN
      (SELECT token_address, transfer_from AS holder, SUM(amount) AS amount
        FROM erc20_transfers
        GROUP BY token_address, transfer_from) amount_out
      ON amount_in.token_address = amount_out.token_address
      AND amount_in.holder = amount_out.holder
      LEFT JOIN
      (SELECT token_address, COUNT(*) as cnt
        FROM erc20_transfers
        GROUP BY token_address) txs
      ON amount_in.token_address = txs.token_address,
      erc20_tokens token
      WHERE COALESCE(amount_in.amount, 0) - COALESCE(amount_out.amount, 0) > 0
      AND token.address = amount_in.token_address
      GROUP BY amount_in.token_address
      ORDER BY holders DESC, transfers DESC;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP VIEW `view_erc20_tokens`');
  }
}
