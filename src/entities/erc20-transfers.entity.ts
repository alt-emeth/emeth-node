import { Entity, Column, PrimaryColumn, getRepository, Index } from 'typeorm';

export interface Erc20TransfersDtoCreate {
  txId: string;
  eventIndex: number;
  tokenAddress: string;
  transferFrom: string;
  transferTo: string;
  createdAt: Date;
  amount?: string;
}

@Index(['transferFrom', 'tokenAddress'])
@Index(['transferTo', 'tokenAddress'])
@Entity('erc20_transfers')
export class Erc20Transfers {
  @PrimaryColumn({
    name: 'tx_id',
    type: 'varchar',
    length: 255,
  })
  txId: string;

  @PrimaryColumn({
    name: 'event_index',
    type: 'int',
    width: 11,
  })
  eventIndex: number;

  @Column({
    name: 'token_address',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  tokenAddress: string;

  @Column({
    name: 'transfer_from',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  transferFrom: string;

  @Column({
    name: 'transfer_to',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  transferTo: string;

  @Column({
    name: 'amount',
    nullable: true,
    type: 'decimal',
    width: 65,
    unsigned: true,
  })
  amount: string;

  @Column({
    name: 'created_at',
    type: 'datetime',
  })
  createdAt: Date;

  static async findAndCount(skip = 0, take = 100) {
    try {
      const erc20TransferRepository = getRepository(Erc20Transfers);
      const transfers = await erc20TransferRepository.find({
        skip,
        take,
      });

      const total = await erc20TransferRepository.count();

      return {
        total,
        transfers,
      };
    } catch (error) {
      const errMsg = `[Erc20Transfers][create] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async save(erc20Transfer: Erc20TransfersDtoCreate) {
    try {
      const erc20TransferRepository = getRepository(Erc20Transfers);
      const result = await erc20TransferRepository.save(erc20Transfer);
      console.log(`[Erc20Transfers][create] with tx: ${result.txId}`);
      return result;
    } catch (error) {
      const errMsg = `[Erc20Transfers][create] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async listTransfers(tokenAddress: string, countOnly = false, skip = 0, take = 100) {
    try {
      const erc20TransferRepository = getRepository(Erc20Transfers);

      const total = await erc20TransferRepository.count({ tokenAddress });
      let transfers = [];
      if (!countOnly) {
        transfers = await erc20TransferRepository.find({
          where: {
            tokenAddress,
          },
          order: {
            createdAt: 'DESC',
          },
          skip,
          take,
        });
      }

      return {
        total: total || 0,
        transfers: transfers || [],
      };
    } catch (error) {
      const errMsg = `[Erc20Transfers][create] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async listHolders(tokenAddress: string, countOnly = false, skip = 0, limit = 10) {
    try {
      const erc20TransferRepository = getRepository(Erc20Transfers);
      const rawQueryString = `
        SELECT amount_in.token_address, amount_in.holder, COALESCE(amount_in.amount, 0) - COALESCE(amount_out.amount, 0) AS balance
        FROM
          (SELECT token_address, transfer_to AS holder, SUM(amount) AS amount
          FROM erc20_transfers
          WHERE token_address = '${tokenAddress}'
          GROUP BY transfer_to) amount_in
        LEFT JOIN
          (SELECT token_address, transfer_from AS holder, SUM(amount) AS amount
          FROM erc20_transfers
          WHERE token_address = '${tokenAddress}'
          GROUP BY transfer_from) amount_out
        ON amount_in.token_address = amount_out.token_address
        AND amount_in.holder = amount_out.holder
        WHERE COALESCE(amount_in.amount, 0) - COALESCE(amount_out.amount, 0) > 0
      `;
      const pRawQueryString = rawQueryString + ` LIMIT ${skip},${limit};`;

      const allHolders = await erc20TransferRepository.query(rawQueryString + ';');
      let holders = [];
      if (!countOnly) {
        holders = await erc20TransferRepository.query(pRawQueryString);
      }

      return { total: allHolders.length, holders };
    } catch (error) {
      const errMsg = `[Erc20Transfers][create] ${error.message}`;
      throw new Error(errMsg);
    }
  }

  static async lastTransactionByToken(tokenAddress: string) {
    try {
      const erc20TransferRepository = getRepository(Erc20Transfers);
      const result = await erc20TransferRepository.findOne({
        where: {
          tokenAddress,
        },
        order: {
          createdAt: 'DESC',
        },
      });

      return result;
    } catch (error) {
      const errMsg = `[Erc20Transfers][lastTransactionByToken] ${error.message}`;
      throw new Error(errMsg);
    }
  }
}
